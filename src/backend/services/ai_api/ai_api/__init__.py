"""AI API: everything that talks to language models and retrieval.

Layout (ports and adapters):
- domain/          pure types and the Protocols the use cases depend on
- application/     use cases (PlanTrip, ...) built only on domain ports
- infrastructure/  adapters: NVIDIA provider, SSE codec, core_api client
- api/             FastAPI wiring: dependencies, routers, endpoints
"""
