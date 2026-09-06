"""Global constants — external URLs, model identifiers, timeouts."""

# ── NVIDIA / AI Chat ─────────────────────────────────────────

# Base endpoint for all NVIDIA chat/completions models.
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"

# Active chat model
# This backend is model‑agnostic: switching models only requires changing this value.
# Examples:
#   "moonshotai/kimi-k2.6"
#   "meta/llama-3.1-8b-instruct"
NVIDIA_CHAT_MODEL = "openai/gpt-oss-20b"

# HTTP client configuration
NVIDIA_CONNECT_TIMEOUT = 10  # seconds
NVIDIA_READ_TIMEOUT = 120  # seconds
NVIDIA_MAX_RETRIES = 2

# ── Chat system prompt ───────────────────────────────────────

CHAT_SYSTEM_PROMPT = (
    "You are the Travel AI World planning assistant. Turn the user's trip idea "
    "into a concrete, day-by-day itinerary: ask for whatever is missing (dates, "
    "budget, number of travellers, pace) instead of guessing, and keep every "
    "suggestion specific and practical. Reply in the language the user writes in."
)
