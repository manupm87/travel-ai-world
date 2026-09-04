"""Chat service — business logic for AI chat streaming.

Updated to match NVIDIA's 2025–2026 API:
- Model is now passed in the URL (?model=...)
- /v1/chat/completions no longer accepts "model" in the JSON body
- Old endpoint returned 404, causing timeouts in the backend
This service is stateless and model‑agnostic: it works with Kimi, Llama,
StepFun, Cosmos and any NVIDIA‑compatible chat model.
"""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator

import httpx

from app.core.config import settings
from app.core.constants import (
    NVIDIA_BASE_URL,
    NVIDIA_CHAT_MODEL,
    NVIDIA_CONNECT_TIMEOUT,
    NVIDIA_MAX_RETRIES,
    NVIDIA_READ_TIMEOUT,
)

logger = logging.getLogger(__name__)


class ChatService:

    """Manages AI chat completions via NVIDIA API (SSE streaming)."""

    # ROLE NORMALIZATION
    # Ensures frontend roles ("human", "me", "assistant_message", etc.)
    # are mapped to valid NVIDIA roles: "user", "assistant", "system".
    def _normalize_role(self, role: str) -> str:
        role = role.lower().strip()

        if role in ("user", "human", "me"):
            return "user"

        if role in ("assistant", "ai", "model", "assistant_message"):
            return "assistant"

        if role == "system":
            return "system"

        # fallback: treat any unknown role as "user" to avoid NVIDIA API errors 
        return "user"

    # REQUEST HEADERS
    # Builds the headers required for NVIDIA's chat/completions API,
    # including SSE support and Bearer authentication.
    def _get_headers(self) -> dict[str, str]:

        if not settings.NVIDIA_API_KEY:
            raise ValueError("NVIDIA API key not configured")
        return {
            "Authorization": f"Bearer {settings.NVIDIA_API_KEY}",
            "Accept": "text/event-stream",      # enables SSE streaming
            "Content-Type": "application/json",
        }


    # Payload
    def _build_payload(self, messages: list[dict[str, str]]) -> dict:
        """Payload for NVIDIA API — model must be in the body."""

        return {
            "model": NVIDIA_CHAT_MODEL,
            "messages": messages,
            "max_tokens": 4096,
            "temperature": 0.7,
            "top_p": 0.95,
            "reasoning_effort": "low",
            "stream": True, # enable SSE streaming
        }


    # Streaming SSE
    async def stream_completion(
        self, messages: list[dict[str, str]]
    ) -> AsyncGenerator[str]:

        headers = self._get_headers()
        payload = self._build_payload(messages)

        # Correct endpoint — model goes in the body, NOT in the URL
        url = f"{NVIDIA_BASE_URL}/chat/completions"


        timeout = httpx.Timeout(
            connect=NVIDIA_CONNECT_TIMEOUT,
            read=NVIDIA_READ_TIMEOUT,
            write=10.0,
            pool=10.0,
        )

        last_error: Exception | None = None

        for attempt in range(NVIDIA_MAX_RETRIES + 1):
            try:
                async with (
                    httpx.AsyncClient(timeout=timeout) as client,
                    client.stream(
                        "POST", url, headers=headers, json=payload
                    ) as response,
                ):
                    if response.status_code != 200:
                        body = await response.aread()
                        error_msg = (
                            f"NVIDIA API returned {response.status_code}: "
                            f"{body.decode('utf-8', errors='replace')}"
                        )
                        logger.error(error_msg)
                        raise httpx.HTTPStatusError(
                            error_msg, request=response.request, response=response
                        )

                    buffer = ""
                    async for chunk in response.aiter_text():
                        buffer += chunk
                        lines = buffer.split("\n")
                        buffer = lines.pop()

                        for line in lines:
                            line = line.strip()
                            if not line or not line.startswith("data: "):
                                continue

                            data = line[6:].strip()
                            if data == "[DONE]":
                                continue

                            try:
                                parsed = json.loads(data)
                                choices = parsed.get("choices", [])
                                if choices:
                                    delta = choices[0].get("delta", {})
                                    # content = delta.get("content") # Old models used "content"
                                    content = delta.get("content") or delta.get("text") # some models use "content", others use "text"

                                    if content:
                                        yield f"data: {json.dumps({'content': content})}\n\n"
                            except json.JSONDecodeError:
                                logger.debug("Skipping malformed SSE data: %s", data)

                yield "data: [DONE]\n\n"
                return

            except ValueError:
                raise
            except httpx.TimeoutException as exc:
                last_error = exc
                if attempt < NVIDIA_MAX_RETRIES:
                    wait = 2**attempt
                    logger.warning(
                        "NVIDIA API timeout, retrying in %ds (attempt %d/%d)",
                        wait,
                        attempt + 1,
                        NVIDIA_MAX_RETRIES,
                    )
                    await asyncio.sleep(wait)
                    continue
                break
            except httpx.HTTPError as exc:
                last_error = exc
                if attempt < NVIDIA_MAX_RETRIES:
                    wait = 2**attempt
                    logger.warning(
                        "NVIDIA API error, retrying in %ds (attempt %d/%d)",
                        wait,
                        attempt + 1,
                        NVIDIA_MAX_RETRIES,
                    )
                    await asyncio.sleep(wait)
                    continue
                break
            except Exception as exc:
                last_error = exc
                logger.exception("Unexpected error during NVIDIA streaming: %s", exc)
                break

        error_msg = str(last_error) if last_error else "Unknown error"
        logger.error("NVIDIA streaming failed after retries: %s", error_msg)
        yield f"data: {json.dumps({'error': error_msg})}\n\n"
        yield "data: [DONE]\n\n"
