# travel_common

The shared kernel of the backend: the few things every service needs and that must mean the same
thing everywhere. Nothing here talks to a database or an external API.

| Module | Provides |
|---|---|
| `principal.py` | `Principal(subject, email, role)` and `Role` — the caller's identity as endpoints see it; `Claims` — what a verified token said (adds `name`, `picture`) |
| `config.py` | `CommonSettings` (project name, API prefix, CORS, `AUTH_MODE` and the settings of each token issuer); services subclass it |
| `exceptions.py` | Domain errors (`EntityNotFound`, `Forbidden`, `Unauthorized`, `ProviderUnavailable`, ...) with no HTTP knowledge |
| `security.py` | `verify_token` / `principal_from_token` (dispatch on `AUTH_MODE`), `create_access_token` and `decode_access_token` for the local HS256 issuer — settings passed explicitly |
| `cognito.py` | `verify_cognito_token`: RS256 against `COGNITO_JWKS`, issuer, audience and `token_use=id` checks; `admin` group → `Role.ADMIN` |
| `testing.py` | `CognitoTestIssuer`: an RSA key pair, its JWKS and signed ID tokens, so any package's tests can prove they accept the pool's tokens and reject forged ones |
| `http/auth.py` | `extract_bearer_token` dependency |
| `http/error_handlers.py` | Maps domain errors to `{"detail": {"message", "error_code", "extras"}}` |
| `http/app_factory.py` | `create_app(settings, routers, lifespan=...)`: logging + CORS + error handlers + versioned prefix; process resources live on `app.state` |
| `http/logging.py` | `configure_logging(level)`: root handler and format for the app's own loggers (`LOG_LEVEL`) |

Rule of thumb: if only one service uses it, it does not belong here.

```bash
uv run pytest    # from this directory
```
