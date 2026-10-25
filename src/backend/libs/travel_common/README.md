# travel_common

The shared kernel of the backend: the few things every service needs and that must mean the same
thing everywhere. Nothing here owns data: `dynamodb.py` is the one way both services reach
DynamoDB (ADR 0023), and the tables are each service's own.

| Module | Provides |
|---|---|
| `principal.py` | `Principal(subject, email, role)` and `Role` — the caller's identity as endpoints see it; `Claims` — what a verified token said (adds `name`, `picture`) |
| `config.py` | `CommonSettings` (project name, API prefix, CORS, `AUTH_MODE` and the settings of each token issuer); services subclass it |
| `exceptions.py` | Domain errors (`EntityNotFound`, `Forbidden`, `Unauthorized`, `ProviderUnavailable`, ...) with no HTTP knowledge |
| `security.py` | `verify_token` / `principal_from_token` (dispatch on `AUTH_MODE`), `create_access_token` and `decode_access_token` for the local issuer (`ALGORITHM` is HS256, HS384 or HS512; a token without `exp` or `sub` is refused) — settings passed explicitly |
| `cognito.py` | `verify_cognito_token`: RS256 against `COGNITO_JWKS`, issuer, audience and `token_use=id` checks; `admin` group → `Role.ADMIN` |
| `dynamodb.py` | `DynamoSettings` (`DYNAMODB_ENDPOINT_URL`, `AWS_REGION`), `dynamodb_client` (cached per endpoint and region), `call` (a blocking boto3 method in a thread), `TableSpec` + `ensure_table` (only where an endpoint override is set), `to_item` / `from_item` |
| `testing.py` | `CognitoTestIssuer`: an RSA key pair, its JWKS and signed ID tokens, so any package's tests can prove they accept the pool's tokens and reject forged ones; `mock_dynamodb()`: moto in process, no container |
| `http/auth.py` | `extract_bearer_token` dependency |
| `http/error_handlers.py` | Maps domain errors to `{"detail": {"message", "error_code", "extras"}}` |
| `http/app_factory.py` | `create_app(settings, routers, lifespan=...)`: logging + CORS + error handlers + versioned prefix; process resources live on `app.state` |
| `http/logging.py` | `configure_logging(level)`: root handler and format for the app's own loggers (`LOG_LEVEL`) |
| `http/access_log.py` | Optional `ACCESS_LOG_ENABLED` ASGI access events, written synchronously before the final body/trailer message; route templates only |

Access events use `access_log={json}` with version, route template, bounded method,
HTTP status, duration_ms, Lambda invocation UUID (otherwise null), cold_start and
outcome (`response_ready` or `interrupted`). No path parameters, query strings,
bodies, credentials or raw request contexts are included. Duration ends immediately
before the final ASGI body/trailer is sent, including stream production but not
final network delivery; `response_ready` does not prove client receipt. Interrupted
streams retain the status already sent. Lambda readiness requests without a valid
invocation UUID are omitted. The first genuine invocation in each middleware/app
instance is marked cold: this lifecycle bit does not measure initialization time
or aggregate traffic. Local requests are never marked cold. Events remain INFO
when explicitly enabled even if LOG_LEVEL is WARNING; logging failures do not
change the response.

Rule of thumb: if only one service uses it, it does not belong here.

```bash
uv run pytest    # from this directory
```
