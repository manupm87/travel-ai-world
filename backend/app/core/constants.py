"""Global constants — external URLs, model identifiers, timeouts."""

# ── NVIDIA / AI Chat ─────────────────────────────────────────
# Base endpoint for all NVIDIA chat/completions models.
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"

# Active chat model (Kimi, Llama, StepFun, Cosmos, etc.)
# This backend is model‑agnostic: switching models only requires changing this value.
# Examples:
#   "moonshotai/kimi-k2.6"
#   "meta/llama-3.1-8b-instruct"

# NVIDIA_CHAT_MODEL = "moonshotai/kimi-k2.6" # modelo original, pero respuestas muy toscas
NVIDIA_CHAT_MODEL = "meta/llama-3.1-8b-instruct"

# HTTP client configuration
NVIDIA_CONNECT_TIMEOUT = 10  # seconds
NVIDIA_READ_TIMEOUT = 120  # seconds
NVIDIA_MAX_RETRIES = 2
