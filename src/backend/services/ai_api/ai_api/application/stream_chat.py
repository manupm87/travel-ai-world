"""Use case: answer a user turn as a stream of text deltas."""

import logging
from collections.abc import AsyncIterator, Sequence

from travel_common.exceptions import DomainError

from ai_api.application.tracing import (
    TurnTracer,
    clip_query,
    current_tracer,
    traced_llm_stream,
)
from ai_api.domain.models import ChatTrace, Document, Message
from ai_api.domain.ports import LLMProvider, Retriever
from ai_api.prompts import RAG_CONTEXT_PROMPT, format_context

logger = logging.getLogger(__name__)


class StreamChat:
    def __init__(
        self,
        provider: LLMProvider,
        system_prompt: str,
        retriever: Retriever | None = None,
        *,
        retrieval_limit: int = 6,
    ) -> None:
        self._provider = provider
        self._system_prompt = system_prompt
        self._retriever = retriever
        self._retrieval_limit = retrieval_limit

    async def __call__(
        self,
        message: str,
        history: Sequence[Message] = (),
        *,
        trace: ChatTrace | None = None,
    ) -> AsyncIterator[str]:
        """Stream the answer; `trace`, when given, collects what it was built from."""
        tracer = current_tracer()
        tracer.phase("wardrobe")
        messages = [Message("system", self._system_prompt)]
        documents = await self._retrieve(message, tracer)
        # Every passage grounds the answer: the model reads them all.
        tracer.mark_used(d.id for d in documents)
        if documents:
            if trace is not None:
                trace.documents.extend(documents)
            messages.append(
                Message(
                    "system",
                    RAG_CONTEXT_PROMPT.format(context=format_context(documents)),
                )
            )
        messages.extend(history)
        messages.append(Message("user", message))

        usage = trace.usage if trace is not None else None
        tracer.phase("zip")
        async for delta in traced_llm_stream(
            self._provider,
            messages,
            name="chat",
            tracer=tracer,
            template=self._system_prompt,
            usage=usage,
        ):
            yield delta

    async def _retrieve(self, message: str, tracer: TurnTracer) -> list[Document]:
        """Passages for this question, or none.

        A store that fails does not take the chat down with it: the answer
        comes from the model's own knowledge, as it did before retrieval, and
        the failure is logged. Only the question is embedded, not the history.
        """
        if self._retriever is None:
            return []
        try:
            async with tracer.span(
                "retriever",
                "search:chat",
                purpose="chat",
                query=clip_query(message),
                k=self._retrieval_limit,
            ) as span:
                found = await self._retriever.search(
                    message, limit=self._retrieval_limit
                )
                tracer.retrieved(span, found)
                return found
        except DomainError as exc:
            logger.warning(
                "Answering without retrieval (%s): %s", exc.error_code, exc.message
            )
            return []
