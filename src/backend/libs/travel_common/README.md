# travel_common

The shared kernel of the backend: the few things every service needs and that must mean the same
thing everywhere. Nothing here talks to a database or an external API.

| Module | Provides |
|---|---|
| `principal.py` | `Principal(id, email, role)` and `Role` — the caller's identity as endpoints see it |
| `config.py` | `CommonSettings` (project name, API prefix, CORS, JWT settings); services subclass it |
| `exceptions.py` | Domain errors (`EntityNotFound`, `Forbidden`, `Unauthorized`, `ProviderUnavailable`, ...) with no HTTP knowledge |
| `security.py` | `create_access_token`, `decode_access_token`, `principal_from_token` — settings passed explicitly |
| `http/auth.py` | `extract_bearer_token` dependency |
| `http/error_handlers.py` | Maps domain errors to `{"detail": {"message", "error_code", "extras"}}` |
| `http/app_factory.py` | `create_app(settings, routers, lifespan=...)`: CORS + error handlers + versioned prefix; process resources live on `app.state` |

Rule of thumb: if only one service uses it, it does not belong here.

```bash
uv run pytest    # from this directory
```
