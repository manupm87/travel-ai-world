# Auditoría de código y arquitectura — 2026-09-27

**Base:** `main` en `48c74a2`. **Alcance:** todo el repositorio: `src/backend` (travel_common, core_api,
ai_api, tools), `src/frontend`, `infra/`, `.github/`, `.devcontainer/`, `justfile`, `scripts/`, `docs/`.
**Encargo:** buenas prácticas; KISS, YAGNI, DRY, SOLID y DDD; documentación y comentarios al día;
todas las comprobaciones posibles; sin romper nada (la web funciona en producción).

**Método.** (1) Se ejecutaron en local (Windows) todas las comprobaciones de CI y algunas más:
auditoría de dependencias, búsqueda de secretos en el historial, código sin uso, el stack de
Compose con su e2e y una simulación del reloj. (2) Ocho revisiones por área, cada hallazgo con
evidencia `fichero:línea`: core_api + travel_common (CORE), plataforma de ai_api (AI), planificador
(PLAN), herramientas (TOOL), planificador del frontend (FEP), resto del frontend (FE), infra/CI
(INF) y documentación (DOC). (3) Todo lo que aquí se da por confirmado se comprobó en el código; lo
que se arregló lleva un test que **falla sin el arreglo** (verificado deshaciendo el cambio).

**Estado.** Entregado en cuatro PR, una por área y con ficheros disjuntos: TRA-252 (#211),
TRA-253 (#212), TRA-254 (#213) y la de este informe (TRA-255). El §6 detalla qué lleva cada una.

La revisión anterior ([code-quality-review.md](code-quality-review.md), 2026-09-07) es histórica:
describe el código de la época de Postgres.

---

## 0. Resumen ejecutivo

**Estado general: bueno.** La arquitectura se sostiene y la mayoría de los problemas son de
bordes (ciclos de vida, validación, portabilidad) y de documentación que se quedó atrás.
Lo que conviene proteger:

- **Fronteras reales.** `ai_api` no importa `core_api` y hablan por HTTP con el token del usuario;
  core_api comprueba sus fronteras de import con un test.
- **core_api:** capas limpias (el dominio y los servicios no importan boto3 ni FastAPI), reglas en
  las entidades (`check_invariants`), escrituras condicionales por `version`, verificación de
  Cognito estricta (RS256 fijado; `iss`, `aud` y `token_use` comprobados).
- **ai_api:** puertos y adaptadores; una traza nunca rompe un turno; los reintentos solo ocurren
  antes del primer delta; una id del modelo solo se acepta si se recuperó; el SSE está tipado y
  generado para el frontend.
- **Frontend:** `fetch` solo en `services/` (regla de ESLint), sesión con `useSyncExternalStore`,
  PKCE S256 con `state`, i18n disciplinado, sin fugas (MapLibre, temporizadores, `AbortController`).
- **Infra:** sin claves de acceso (SSO en local, OIDC en CI), roles de Lambda con mínimo privilegio
  real, PITR y protección de borrado en la tabla, imágenes promovidas por digest.
- **Tests:** unos 1.180 de backend y 800 de frontend, sin red, más tres suites e2e.

**Lo más importante:**

| # | Hallazgo | Estado |
|---|---|---|
| 1 | **CORE-1** Un `PATCH` podía guardar datos que `POST` rechaza (un título de 300 caracteres al renombrar, `null`, un país `"hungary"`, viajeros negativos). Desde ese momento `GET /trips/` respondía **500** para ese usuario: su página de viajes se rompía. | Arreglado + tests |
| 2 | **FE-1** Bomba de relojería: la sesión grabada empieza el 23-10-2026. Desde ese día fallan 7 tests de `useSaveTrip` y el e2e "a saved trip reopens" del stack, en toda PR que toque `src/`. | Arreglado; verificado simulando el 24-10 |
| 3 | **Windows/macOS** `tsc` y `next build` fallaban: `ModelCalls.tsx` y `modelCalls.ts` solo difieren en mayúsculas. También fallaban un test de vitest y dos de city_corpus. | Arreglado |
| 4 | **PLAN-1** "generally", "in general" o "I cannot decide" disparaban el borrador completo del viaje (unas 10 llamadas al modelo) en vez de una respuesta. | Arreglado + tests |
| 5 | **FE-2** Redirección abierta tras iniciar sesión: `?redirect=/%09/evil.example` llevaba fuera del sitio. | Arreglado + tests |
| 6 | **AI-1/AI-2** Previsualizaciones de web: la `og:image` se pedía sin pasar por `fetchable` (SSRF a IP privadas o a loopback), `127.1` y `0x7f.1` pasaban el filtro, y una URL que httpx no sabe construir tumbaba el turno entero. | Arreglado (queda la resolución DNS) + tests |
| 7 | **AI-4** Todos los eventos `progress` se trazaban como `done`: contadores y línea de tiempo del inspector de admin erróneos. | Arreglado + test |
| 8 | **PLAN-4** "12 euros" salía como "(price not shown)os"; "20 dollars" no se ocultaba. | Arreglado + tests |
| 9 | **INF-1/INF-2** El rol de despliegue de CI puede darse `AdministratorAccess` a sí mismo (`travel-ai-*` también lo nombra a él), y ningún workflow de despliegue comprueba la rama. | Pendiente: decisión de infra |
| 10 | **TOOL-1** Bolonia se construyó antes de la etapa de fotos: 3 de 95 hoteles tienen foto. Como el planificador nunca ofrece un hotel sin foto (ADR 0022), en Bolonia ofrece 3 como mucho. | Pendiente: reconstruir y reindexar |
| 11 | **FEP-1..5** Ciclo de vida del planificador: botones que cortan un turno en curso, guardado interrumpido al salir, "Empezar de nuevo" sobre un viaje guardado, "Reintentar" que duplica el mensaje y `planner_session_id` que nunca se guarda. | Pendiente: cambios de comportamiento |
| 12 | **AI-6** La vertical del chat v1 (`POST /ai/chat`, las conversaciones de core_api, `services/chat.ts`) no tiene ningún cliente desde el 20-09 (TRA-192). | Decisión |

---

## 1. Comprobaciones ejecutadas

| Comprobación | Antes | Después | Nota |
|---|---|---|---|
| `ruff check` + `ruff format --check` (backend y `scripts/`) | OK | OK | |
| `pyright` (modo estándar) | 0 errores | 0 errores | |
| Import de `core_api.main` y `ai_api.main` | OK | OK | |
| pytest `travel_common` | 37 | 37 | |
| pytest `core_api` (moto) | 199 | 212 | +13 de regresión (CORE-1, CORE-10) |
| pytest `ai_api` | 627 | 653 | +26 (AI-1, AI-2, AI-4, PLAN-1, PLAN-4) |
| pytest `city_corpus` | 252 + **2 fallos en Windows** | 255 | + test de gemelos |
| pytest `vector_store_bench` | 19 (+2 omitidos) | 19 (+2 omitidos) | |
| OpenAPI al día (`export_openapi.py --check`) | OK | OK | documentos regenerados (§2.6) |
| Tipos TS generados | OK | regenerados | idempotente |
| `scripts/check_docs.py` | OK | OK | |
| ESLint | OK | OK | |
| `tsc --noEmit` | **falla en Windows** | OK | colisión de mayúsculas |
| Vitest | 804/805 (**1 falla en Windows**) | 803/803 | |
| `next build` | **falla en Windows** | OK | |
| Vitest con el reloj en 2026-10-24 | **7 fallos** | 0 | FE-1 |
| Playwright contra `next dev` | 49 OK, 17 omitidos | — | |
| Playwright sobre el export (`test:e2e:static`, CI `frontend`) | — | 54 OK, 17 omitidos | |
| Stack de Compose + e2e con sesión (CI `e2e-stack`) | — | 7/7 comprobaciones, 71/71 Playwright | §1.1 |
| `npm audit` | 5 (4 altas, 1 moderada) | igual | solo dependencias de desarrollo: vite (vía vitest), picomatch y js-yaml (vía openapi-typescript). `npm audit fix` sin `--force` las resuelve; va en una PR aparte |
| Paquetes desactualizados | parches menores | igual | TypeScript 7 y ESLint 10 siguen bloqueados por `eslint-config-next` |
| Secretos en el árbol y en todo el historial | ninguno | — | patrones de AWS, NVIDIA, Google, GitHub, Slack y Anthropic, y claves privadas |
| Código sin uso (script sobre TS y Python) | ver §4.4 | | |
| `terraform fmt/validate`, markdownlint, lychee, actionlint | no ejecutados en local | | no están instalados; CI ejecuta los tres primeros en las PR que tocan esas rutas |

### 1.1 Stack de Compose

El e2e del stack se ejecutó en local igual que el job `e2e-stack` de CI: export para `:8080`,
proxy, APIs y DynamoDB Local, comprobaciones con `curl` y la suite de Playwright con un token
acuñado. Los `.env` locales no se tocaron: un fichero de Compose aparte inyecta los valores de
plantilla, como hace CI. Resultado, con todos los cambios de este informe: las 7 comprobaciones de
TRA-127 pasan (`/`, `/dashboard/`, health de los dos servicios, 404 propio y 401 sin token), el
token abre la API (`GET /trips/` → `[]`) y la suite de Playwright da **71 de 71**, incluidos el
planificador con sesión, "a saved trip reopens" (con las fechas desplazadas) y la consola de
administración.

---

## 2. Cambios aplicados

Todos pequeños y verificados. Los arreglos de comportamiento llevan su test de regresión.

### 2.1 Bugs

| ID | Qué | Cambio | Test |
|---|---|---|---|
| CORE-1 | `partial()` quitaba a los campos obligatorios su tipo no nulo y sus restricciones: `StringConstraints`, `Field(ge=...)` y los validadores viven en `FieldInfo.metadata`. Un PATCH guardaba lo que después fallaba en `TripResponse`. | `schemas/_partial.py` conserva anotación y metadatos. `null` solo se acepta donde la base lo admite. | `test_patch_refuses_what_post_refuses` (9 casos, incluidos título largo y nulo), `test_partial.py` (+2) |
| CORE-10 | Un cursor de administración con JSON anidado a 3.000 niveles daba `RecursionError`, un 500. | `decode_cursor` lo convierte en `BadRequest`. | `test_a_bad_cursor_or_limit_is_refused` |
| AI-4 | `_stamp_planner` sellaba cualquier evento desconocido como `done`, y `progress` (ADR 0025) llegó después. | Rama propia para `progress` y otra explícita para `done`. Un evento futuro se sella con su propio tipo. | `test_progress_events_are_stamped_as_progress` |
| AI-2 | `httpx.InvalidURL` no hereda de `HTTPError`: una `og:image` con un carácter de control rompía la promesa "never raises" del puerto y el turno terminaba en `INTERNAL`. | Se captura en las dos fases. | `test_an_image_url_httpx_cannot_build_is_none_not_an_error` |
| AI-1 | La `og:image` (que decide la página del tercero) se pedía con `HEAD` sin pasar por `fetchable`, a diferencia del gemelo del corpus. `fetchable` aceptaba `127.1`, `0x7f.1` y `2130706433`: el runtime de Lambda escucha en `127.0.0.1:9001`. | `fetchable(image)` antes del `HEAD`, y rechazo de todo lo que `socket.inet_aton` lee como IP, en **los dos gemelos**. | 3 URLs nuevas en `test_a_url_that_is_not_a_venues_public_site_makes_no_request` y `test_an_image_on_a_host_that_may_not_be_fetched_gets_no_head` |
| PLAN-1 | `GENERATE_WORDS` no tenía `\b` final e incluía "decide" y "elige" a secas. | Frases completas: `generate`, `genera`, `you decide`, `elige tú`, `sorpréndeme`... Los textos del botón (`Generate the trip`, `Genera el viaje`) siguen funcionando. | 8 positivos (con los del botón) y 5 negativos |
| PLAN-4 | `strip_prices` no terminaba la palabra de moneda ("12 eur" + "os"), no conocía "euros", "dollars" ni "dólares", y partía "5 000 Ft". | Moneda seguida de algo que no sea letra (se mantiene `Ft2200`), formas deletreadas y miles con espacio. | 5 positivos y 2 negativos nuevos |
| FE-2 | `safeRedirectTarget` miraba cómo se escribe la ruta, no adónde lleva: el parser de URL descarta tabuladores y saltos de línea y lee `\` como `/`. Además `LoginModal` decodificaba el `?redirect=` dos veces. | Se valida resolviendo contra un origen. `LoginModal` decodifica una sola vez y `AuthCallback` revalida lo que guardó. Se elimina `safeRedirectPath`, ya sin uso. | `safeRedirect.test.ts` (`\t`, `\n`, `\r`, `\t\`) |
| FE-1 | Fechas fijas de la grabación (23-10-2026) frente al reloj real. | `useSaveTrip.test.tsx` fija el día. El mock de `planner.spec.ts` desplaza la grabación 30 días hacia delante y rellena el formulario con esos días. | simulación con el reloj en 2026-10-24: 0 fallos |
| FE-6 | `--color-text-muted` del tema claro daba 4,10–4,37:1, por debajo del 4,5:1 que exige `kyrian-world.md`. | Alfa de 0,58 a 0,62: entre 4,63 y 4,99:1 en todas las superficies claras. | cálculo WCAG |

### 2.2 Portabilidad (Windows y macOS)

- `components/admin/turn/modelCalls.ts` → `calls.ts`, junto con su test: el `import "./ModelCalls"`
  del inspector resolvía al fichero de ayudas en sistemas de ficheros que no distinguen mayúsculas.
- `services/planner.test.ts`: `fileURLToPath(import.meta.url)`, porque `URL.pathname` es
  `/C:/...` en Windows.
- `city_corpus/config/cities.py`: `path.anchor` en lugar de `is_absolute()`. En Windows,
  `/etc/f.toml` no es absoluta pero sale de la carpeta al unirla; el test ya lo pedía.
- `scripts/export_openapi.py` escribe en UTF-8 con LF: antes escribía CRLF en Windows y había que
  normalizarlo a mano.

### 2.3 Tests y CI

- **Gemelos del corpus y de ai_api (AI-5/TOOL-2).** Nuevo `test_the_site_rules_in_ai_api_are_kept_in_step`
  (city_corpus): compara por AST, sin docstrings, las 14 reglas de sitio que ai_api copia a mano, y
  `GROUP_DOMAINS` por valor. Hoy coinciden todas salvo `absolute_image`, excluida y documentada
  (TOOL-8).
- **Filtros de rutas de `pr.yml`.** Cada test que lee la copia del otro lado ahora también se
  ejecuta cuando cambia ese otro lado: `ai` con `city_corpus/data/cities.json`; `corpus` con
  `commons_photos.py` y `site_previews.py`; `bench` con el corpus de Budapest.
- **FEP-9.** `planner-new-trip.spec.ts` sembraba un borrador de la versión 1, que la página descarta
  sin más, así que sus comprobaciones no probaban nada. Ahora importa `DRAFT_VERSION` (exportada).
- **CORE-6 (parcial).** Se quita `assert ... or True`, que no podía fallar nunca.

### 2.4 YAGNI y DRY

- `TripGateway`, `get_trip_gateway` y `CoreApiClient.create_trip` (ai_api): nadie los usaba. El
  navegador guarda el viaje (ADR 0019) y el AGENTS.md decía lo contrario. Los tests de mapeo de
  errores pasan a `start_thread`, que usa el mismo `_post`.
- `traced_complete` y `level_for` (ai_api `application/tracing.py`): sin uso.
- `utils/countryFlag.ts` y su test: sin uso. El script `start` (`next start`) falla con
  `output: "export"`.
- `isEditable` estaba sin uso mientras la regla se repetía en `TripsList` y `PlannerClientPage`.
  Ahora es un *type guard* y lo usan los dos.

### 2.5 Documentación y comentarios

- **Visión general:** `README.md` (servicios, árbol, "How it works", *roadmap*), `AGENTS.md` raíz
  (fila de ai_api, `vector_store_bench`, alcance de pyright), READMEs y AGENTS de backend, de
  travel_common (`dynamodb.py`) y de core_api (paginación, garantía del PATCH), y
  `docs/architecture/overview.md` (eventos, trazas, GSI2, GCP).
- **ai_api:** README y AGENTS (`progress`, `session_id`/`language`, puertos, `BEDROCK_TITLE_MODEL`
  sin uso, almacenamiento, `tracer.phase`).
- **ADR:** estado de 0005, 0008, 0011, 0013, 0015 y 0023; fila 0012 en el índice (reservado y nunca
  escrito); fecha real de la retirada de RDS.
- **Runbooks:** `local-dev.md` (el planificador responde 503 sin recuperación; tablas de e2e),
  `docker.md` (ya no hay migraciones), `deploy.md` (ancla rota y excepción obsoleta), `add-city.md`
  (seis fuentes de foto; se cae la mitad) y `frontend-https-aws.md`, marcado como histórico, con
  las ids de AWS enmascaradas.
- **Frontend:** README (Cognito, tokens enlazados al documento de diseño, fila de `/plan/`,
  `basePath`) y AGENTS (contrato generado, diálogos, maleta, etiqueta, e2e).
- **Restos de ECS, GitHub Pages y RDS:** comentarios de Dockerfile, `entrypoint.sh`, Terraform
  (`lambda.tf`, `dynamodb.tf`, `cognito.tf`, descripción de `admin_usernames`), `justfile`
  (`Google_<sub>` en `admins.auto.tfvars`), devcontainer, `next.config.ts`, las configuraciones de
  Playwright (`just seed` ya no existe) y `.env.example`.
- **Comentarios de código:** docstrings de travel_common, core_api y ai_api que citaban el ORM,
  `core/error_handlers.py`, `PUT` o reglas de fotos anteriores a TRA-206; los comentarios del
  planificador que decían que la vista general no tiene mapa; dos JSDoc huérfanos (`runTurn`,
  `ChatColumn`) movidos a su símbolo.
- `docs/README.md` indexa este informe, el *spike* de vectores y `kyrian-world.md`.
  `scripts/check_docs.py` describe lo que de verdad comprueba.

### 2.6 Contratos

`docs/api/*.openapi.json` y `src/frontend/src/types/generated/` están regenerados (`just contracts`).
Los tipos `XUpdate` ya no aceptan `null` en los campos que la base no permite vacíos, por ejemplo
`title?: string` en lugar de `string | null`. Ningún cliente enviaba esos nulos y `tsc` pasa.

---

## 3. Decisiones pendientes (del equipo, no aplicadas)

| # | Decisión | Datos | Recomendación |
|---|---|---|---|
| D1 | **Vertical del chat v1** (AI-6, FEP-10) | `POST /ai/chat`, `StreamChat`, `RecordConversation`, `ConversationGateway`, `/chat-threads` y sus agregados en core_api, y `services/chat.ts`: sin ningún cliente desde aa5396a (20-09). Cualquier cuenta puede usarlo contra Haiku (40 × 8.000 caracteres de historial) y no hay límite por usuario. | Retirarlo entero (ADR que sustituya a 0013), o nombrar a su cliente. Si se retira, conservar `ChatMessage`, que usa el planificador. |
| D2 | **`tools/scraper`** (TOOL-6) | Nada lee su salida. Tiene datos de Google Places versionados (`hoteles_madrid.json`, 491 de 614 documentos), que el propio corpus prohíbe por licencia. | Borrarlo (el historial lo conserva), o como mínimo quitar los datos de Google. |
| D3 | **`tools/vector_store_bench`** (TOOL-14) | *Spike* cerrado (TRA-151). Mantiene job de CI, pyright y dependencias (`qdrant-client`, `grpcio`...), su artefacto ya no casa con el corpus y su AGENTS dice "goes or freezes". | Mover `eval/budapest-queries.jsonl` donde lo use TRA-148, quitarlo del workspace y dejar el código en una etiqueta. |
| D4 | **Raíz `infra/gcp`** (INF-8) | Se valida en CI y se puede desplegar desde `deploy-backend.yml`, pero crea Cloud SQL y no DynamoDB: no puede servir el core_api actual. Sin *backend* de estado. | Retirarla (ADR), o quitar `gcp` de las opciones del workflow hasta portarla. |
| D5 | **`fastapi[standard]` en las imágenes** | Unos 27 MB de 128 MB de paquetes que no se usan en Lambda: `sentry_sdk`, `fastapi_cloud_cli`, `rich`/`pygments`, `typer`, `jinja2`, `websockets` (el AGENTS prohíbe WebSockets) y `watchfiles`. | `fastapi` + `uvicorn[standard]` (+ `email-validator` en core_api) y `uv lock`, en una PR propia. |
| D6 | **Recorte de `src/frontend/AGENTS.md`** | 44 KB que se cargan en cada tarea de un agente; entre el 75 y el 80 % es historia o repite comentarios y ADR (§5). | Dejar reglas, fronteras, mapa y convenciones de test (unos 10 KB). |
| D7 | **`BEDROCK_TITLE_MODEL`** (AI-12) | Ningún código lo lee, pero Terraform lo pasa y da IAM a Nova Lite. | Quitar el ajuste, la variable y el permiso (mínimo privilegio), o documentar para qué se reserva. |
| D8 | **Endpoints de usuario sin cliente** (CORE-3, CORE-7) | `PATCH /users/{id}` deja cambiar el email (la cuenta se desvincula de sus viajes) o `is_active=false` (bloqueo sin vuelta atrás). El `PATCH .../role` de admin se deshace en la siguiente petición en modo Cognito. `GET /users/` y `GET /users/{id}` no tienen cliente. | Quitar `email`/`is_active` del esquema y montar el PATCH de rol solo en modo local, o borrarlos. |
| D9 | **Seguridad de la cadena CI → AWS** (INF-1..3, INF-9) | Ver §4.1. | Acotar el rol, restringir el entorno `aws` a `main` y separar el *build* del *deploy* del frontend. |
| D10 | **Límites de coste** (INF-4, PLAN-5) | Sin *throttling* en API Gateway ni concurrencia reservada en ai_api, sin presupuestos en Terraform y con campos de la petición del planificador sin tamaño máximo. | *Throttling* por etapa y método, límites de tamaño en los esquemas, y presupuesto con alertas o dejar constancia de la alerta del curso. |

---

## 4. Hallazgos pendientes por área

La severidad es la del revisor, confirmada o ajustada. **(P)** marca lo verosímil pero no
reproducido.

### 4.1 Seguridad

| ID | Sev. | Qué | Dónde | Propuesta |
|---|---|---|---|---|
| INF-1 | alta | El rol de CI tiene IAM sobre `role/travel-ai-*`, y ese patrón lo incluye a él (`travel-ai-github-deploy`): puede adjuntarse `AdministratorAccess` o reescribir su propia confianza. | `infra/aws/bootstrap/main.tf:109-150` | Acotar a `role/${prefix}-*-lambda`, `Deny iam:*` sobre sí mismo, `iam:PolicyARN` en *attach* e `iam:PassedToService` en `PassRole`. Revisar `PowerUserAccess`. |
| INF-2 | alta | La confianza OIDC acepta cualquier job que nombre el entorno `aws`, desde cualquier rama. Ningún workflow comprueba `github.ref`, y la nota del equipo dice que el entorno no tiene reglas. | `bootstrap/main.tf:104`, `deploy.yml`, `deploy-backend.yml`, `backend-images.yml` | `if: github.ref == 'refs/heads/main'`; en GitHub, entorno `aws` solo para `main` y checks obligatorios en `main`. |
| INF-3 | media | El despliegue del frontend ejecuta `npm ci` y `next build` con `id-token: write` y el rol de Terraform al alcance. Las acciones de terceros van fijadas por etiqueta. | `deploy.yml`, `_build-image.yml` | Separar *build* (sin credenciales) de *deploy*, usar un rol mínimo para `s3 sync` + invalidación y fijar acciones por SHA. |
| INF-5 / FE-5 | media | CloudFront no envía cabeceras de seguridad (HSTS, `frame-ancestors`, `nosniff`, CSP). El *refresh token* de 30 días está en `localStorage` y el *logout* no lo revoca. | `frontend.tf:215`, `services/session.ts`, `services/cognito.ts:247` | `response_headers_policy` (primero CSP *report-only*), `POST /oauth2/revoke` al salir y un ADR. |
| FE-4 | media | El script de Google Identity se carga en todas las páginas de producción para un botón que el build de Cognito no muestra. | `app/layout.tsx:84` | Montar `GoogleOAuthProvider` solo en la rama de Google. |
| PLAN-5 | media | La mayoría de campos de la petición del planificador no tienen tamaño: un `origin` de 400 KB viaja a unos 8 *prompts*, y una traza de más de 400 KB se pierde. Fechas extremas dan `OverflowError`. | `schemas/planner_events.py:59-71`, `schemas/planner.py` | Límites (≈120 caracteres, ≤ 12 intereses...), `CardId` en todas las ids, cotas de días y fechas. Luego `just contracts`. |
| AI-1 (resto) | media | `fetchable` mira el nombre, no la dirección a la que resuelve (`127.0.0.1.nip.io`). Afecta a los dos gemelos. | `site_previews.py`, `photos.py` | Resolver y exigir `is_global` en el propio transporte. |
| AI-3 | media | Sin plazo total por previsualización: un servidor que gotea bytes cada menos de 2 s alarga el turno hasta el *timeout* de Lambda (900 s). | `site_previews.py:142-147` | `asyncio.timeout` en `_fetch` y cachear el fallo. |
| INF-9 | baja | `inputs.image_tag` se inserta tal cual en el *shell* de `deploy-backend`. | `deploy-backend.yml:151` | Pasarlo por `env` y validar `^([0-9a-f]{40}\|latest)$`. |
| CORE-16 (P) | baja | No se comprueba `email_verified`, y los tokens locales no exigen `exp`. | `auth/google.py`, `cognito.py`, `security.py:40` | `require: ["exp","sub"]`; mapear y exigir `email_verified`. |
| PLAN-23 (P) | baja | La prosa del chat se pinta como Markdown con enlaces del modelo, que salen de Wikivoyage u OSM (editables). | `MarkdownContent.tsx` | Enlazar solo a hosts de las fuentes del turno. |
| INF-10 | baja | El *hook* de nombres de rama falla en abierto en Windows (sin `jq`) y se esquiva con `--create`, `worktree add -b` o `git -C`. | `.claude/hooks/check-branch-name.sh` | Fallar en cerrado, *matcher* `Bash\|PowerShell` y ampliar el patrón. **No se tocó `.claude/`.** |
| INF-11 | baja | Las decisiones humanas (`terraform apply`, `gh workflow run`) no están en `permissions.ask`. | `.claude/settings.json` | Decisión del equipo; configuración del arnés de agentes, **no se tocó**. |

### 4.2 Bugs y robustez

| ID | Sev. | Qué | Propuesta |
|---|---|---|---|
| FEP-1 | alta | "Cambiar", "Quitar" y la petición automática del panel lanzan un turno nuevo mientras otro emite: el borrador se corta en silencio (faltan días y el tiempo), y "Guardar" puede guardar ese viaje a medias. | Bandera `busy` en las tarjetas, esperar al fin del turno y `status !== "streaming"` en `canSave`. |
| FEP-2 | media | Salir durante "Guardando…" aborta la cadena de escrituras después de haber borrado los hijos: el viaje queda vacío. | No abortar las escrituras al desmontar; abortar solo si hay un guardado más nuevo. |
| FEP-3 | media | "Empezar de nuevo" sobre `?trip=` olvida el viaje guardado: al recargar se vuelve a aplicar el viaje y se pierde el plan nuevo, y sin recargar "Guardar" sobrescribe el viaje antiguo. | Separar "limpiar borrador" de "olvidar viaje guardado", o que actúe como "Viaje nuevo". |
| FEP-4 | media | "Reintentar" tras una respuesta parcial duplica el mensaje en pantalla y en la petición (reproducido). | Recortar el transcript hasta el inicio del turno fallido. |
| FEP-5 | media | Ningún viaje guarda `planner_session_id` (ADR 0024), así que el enlace viaje ↔ trazas no existe en ningún viaje real. | Escribirlo en `tripBodyOf` y rehidratar la sesión. |
| FEP-6 | media | Si `/ai/planner/cities` falla una vez, "Guardar" queda desactivado con el motivo falso "es una sesión grabada". | Reintentar la carga de ciudades y dar un motivo tipado. |
| CORE-2 | media | Un borrado de usuario que falla a medias deja el `EMAIL#` apuntando a un perfil que ya no existe: 409 para siempre en esa cuenta (reproducido). | Borrar hijos primero y terminar con una transacción `PROFILE` + `EMAIL#`; limpiar la búsqueda colgante. |
| CORE-4 | media | Se puede crear un viaje ya bloqueado (empieza hoy en UTC); el guardado entre zonas horarias deja un viaje vacío y bloqueado. | `ensure_editable()` en `TripService.create` (revisar los tests de fase) y, a la larga, un guardado en una sola petición (CORE-5). |
| PLAN-2 | media | `title_words` corta en ö, ä, ß...: "Söröző" da `{'', 'r', 'ző'}` y 1.303 pares de Budapest cuentan como el mismo sitio. | Tokenizador Unicode con acentos plegados, sin tokens de menos de 2 caracteres y con proximidad. |
| PLAN-3 | media | `_named_at` busca por subcadena: "Noon" aparece en "afternoon", "λ" se pliega a `""`. | Palabra completa, al menos 3 alfanuméricos, y no buscar en el texto propio de la página. |
| PLAN-6 | media | Si una tarea de `asyncio.gather` falla, las demás siguen vivas tras la respuesta (incumple la regla de Lambda). | Una ayuda que cancele y espere a las hermanas. |
| AI-7 | baja | El contexto de la traza (brief, acción, ids) no tiene tope: un brief enorme hace perder la traza entera. | Recortar por tamaño y escribir el resumen con su propio `PutItem`. |
| AI-8, AI-9, AI-10 | baja | Titan lee el cuerpo en el bucle de eventos y fuera del mapeo de errores. En Bedrock, los errores de urllib3 esquivan reintentos y cierre. NVIDIA reintenta 4xx permanentes y un 200 que no es JSON se escapa. | Mover las lecturas al hilo y dentro del `try`, cerrar el `EventStream` y reintentar solo transporte, 429 y 5xx. |
| FE-3 | media | Cualquier fallo del *refresh* (sin red, 5xx, 429) cierra la sesión y borra el *refresh token* de 30 días. | Borrar solo con 400/401 (`invalid_grant`). |
| FE-7, FE-8, FE-9 | baja | `ProtectedRoute` usa `push` (Atrás queda atrapado). El enlace "Turnos" de un usuario solo muestra los de hoy. `AdminGate` muestra "no permitido" hasta que llega `/users/me`. | `replace`, "cualquier día" con `subject`, y `roleKnown`. |
| FEP-13, FEP-14, FEP-15, FEP-23, FEP-24 | baja | Anillos de opciones obsoletos en el mapa, un stream cortado sin `[DONE]` cuenta como éxito, el scroll no baja al terminar, "Guardado" sobrevive a cambios del brief, y detalles de pintado. | Ver el informe FEP. |
| PLAN-8..PLAN-13, PLAN-21 | baja | Tarjetas "mencionadas" que incluyen hoteles, `why` perdido al confirmar, `topK` sin tope, `aclose` que no cancela en el acto, `slot:0` que da `INTERNAL`, selección no validada contra el grupo, ciudad desconocida que pasa a Berlín, "hoy" local frente a UTC. | Ver el informe PLAN. |
| CORE-8 (P), CORE-15 | baja | Un `TransactionConflict` da 500 en vez de 409; `EmailStr` en la respuesta da 500 con cuentas de desarrollo `.test`. | Mapearlo a `Conflict`; `email: str` en la respuesta. |
| INF-6 | media | El disparador de *redeploy* de API Gateway solo mira ids: un cambio en sitio (*timeout*, autorizador) no llega a la etapa. | Hacer el hash de los recursos completos. |
| INF-14 (P) | baja | CORS para un frontend local contra AWS no puede funcionar: el *preflight* choca con el autorizador de Cognito. | Documentarlo, o métodos `OPTIONS` sin autorización. |
| TOOL-3, TOOL-4, TOOL-8..12 | media/baja | El *gate* cuenta fragmentos de Wikipedia como lugares; `language = "en"` en todas las ciudades, así que las búsquedas "en la lengua de la ciudad" nunca se hacen; doble `unescape` en `absolute_image`; `entity_id` con redirecciones de Wikidata; caché que guarda el veredicto de la política; un build parcial con `--sources` sobrescribe el corpus; los listados en español de Wikivoyage pierden todos sus datos (TOOL-9). | Ver el informe TOOL. Casi todos exigen reconstruir y reindexar. |

### 4.3 Diseño: KISS, DRY, SOLID y DDD

| ID | Principio | Qué | Propuesta |
|---|---|---|---|
| PLAN-7 | SRP/KISS | `plan_trip.py` tiene 1.962 líneas; `PlanTrip`, 41 métodos más unas 570 líneas de funciones puras. | (a) Mover las funciones puras sin cambiarlas a `cities.py`, `places.py`, `brief.py` y un módulo de protocolo (seguro). (b) `_with_progress` a `progress.py`. (c) Un colaborador `draft.py` solo si el borrador es lo siguiente que se toca. |
| FEP-18, FEP-19 | SOLID | El modelo de dominio del planificador vive en `hooks/plannerReducer.ts`, y los servicios importan de `hooks/`. `PlannerClientPage` enlaza cinco efectos. | Tipos a `types/planner.ts`; álgebra del itinerario a `domain/planner/`; `useOpenTrip` y `useChangeSheet`. |
| FE-16 | DRY | `i18n/types.ts` (879 líneas) repite a mano `en.ts`. | `export type Translations = typeof en`, con los JSDoc en `en.ts`. |
| FE-17, FE-18, FE-19 | DRY/DDD | `isAbort`, `toApiError` y 401 → `clearSession` repetidos; seis versiones de "petición con clave y abort"; cinco copias del rango de fechas; rutas (`/plan/?trip=`, `HOME`) en varios sitios; `TripCard` en `ui/`. | `hooks/asyncResource.ts`, `formatDateRange` en `useFormatters`, `lib/routes.ts` y `TripCard` a `components/trips/`. |
| FEP-20..22 | DRY | Pasos de la maleta copiados tres veces; título del viaje y `PART_TIME` duplicados; chips de fuente, etiqueta de precio y botones copiados por tarjeta. | Una fuente para cada cosa, con `satisfies` contra el tipo generado. |
| AI-15, PLAN-17 | DIP | `providers.py` dice ser el único que conoce adaptadores, pero `main.py` y `deps.py` construyen otros. `plan_trip.py` importa `infrastructure.static_flight_search`. `LLMProvider` no declara `name`, `is_configured` ni `aclose`. | Constructores en `providers.py`, puerto `RouteFinder` o función pura en `application/`, y completar el `Protocol`. |
| AI-17, AI-20 | DRY | Los campos del resumen de traza se escriben tres veces. El códec de cursor está duplicado entre servicios. | Test que ate las copias; códec a `travel_common.dynamodb`. |
| CORE-5 | KISS | El único cliente reescribe el viaje entero con unas 40–60 peticiones hijas no atómicas, y la lista devuelve viajes completos. | `PUT /trips/{id}` con hijos en una escritura condicional y un endpoint de resumen (ADR 0019, "To revisit"). |
| CORE-9, CORE-11, CORE-17 | DDD | El bloqueo de los hijos vive en las dependencias y no en el agregado; `TripLocked` y `TooManyRequests` están en el *kernel* compartido; la fase se calcula en tres sitios. | `ensure_editable()` en las escrituras hijas, `TripLocked` a core_api, y la fase leída de la entidad. |
| PLAN-19, PLAN-20, TOOL-16 | DRY | Frases en/es leídas como protocolo; tres recorridos del snapshot; duplicados internos del corpus. | Derivarlos de una sola fuente. |

### 4.4 YAGNI: código y configuración sin uso

Detectado con un script sobre las exportaciones de TS y las definiciones de Python, y confirmado
buscando en todo el repositorio:

- **Backend:** `GOOGLE_CLIENT_SECRET` (se declara y nadie lo lee; CORE-12); `User.google_id` (se
  escribe y nadie lo lee); `ops.py` + `backfill.py` (de un solo uso, TRA-230; CORE-18);
  `TurnFilters.session_id`, `Embedder.model_id` y `Embedder.dimensions` (AI-13); `city_key`,
  `PLANNER_TEXTS["acknowledged"]`, `_line(tier=)`, `complete_json(usage=)` y tres constantes
  eat/drink iguales (PLAN-18); `SKIPPED_LOCAL_SECTIONS` y ramas muertas en `neighbourhoods.py`
  (TOOL-15); `testing.py` de ai_api (512 líneas) viaja en el paquete de producción (AI-19).
- **Frontend:** props y ramas sin uso (`unavailable`, el modo plegable de `DayCard`, `disabled` de
  `QuickReplies`, `errorText`, `highlight`/`variant` de `Card`, `as` y `white` de `Button`,
  `onRowClick`, la rama sin sesión de `UserMenu`; FEP-17 y FE-13); `readErrorMessage`,
  `getStoredToken`, `formatCurrency`, `formatDuration` y `remotePatterns` (FE-14); 17 claves de
  i18n (FE-15); los literales de unión que el servidor nunca envía (`flight`, `day_template`,
  `multi`; PLAN-18).
- **Infra y *tooling*:** el plugin de Session Manager en el devcontainer; el alias `www` de
  CloudFront (INF-25); `NEXT_PUBLIC_BASE_PATH`, que solo pone el paso de PR "GitHub Pages" (INF-7).

### 4.5 Tests

- CORE-6: los casos de formato solo prueban `POST` fuera de los viajes (hijos: la misma idea que
  en §2.1). Tampoco se prueban los fallos a medias de un borrado ni el bloqueo en comidas,
  estancias y trayectos.
- PLAN-22: no hay casos negativos (fallos del *retriever* dentro del borrador, títulos no ASCII,
  *slots* inválidos). `FakeProvider` contesta por posición: cambiar el orden de las llamadas rompe
  muchos tests.
- TOOL-19: faltan *fixtures* de Wikivoyage en español, de redirecciones de Wikidata, de `&amp;` y
  de artículos con varios fragmentos. Tampoco hay un test que pase el *gate* sobre `data/*/`.
- FE-20: los *helpers* de e2e (`fakeToken`, *sign-in*) están copiados en seis *specs*, hay textos
  de interfaz fijados a mano y un `waitForTimeout(500)`.

### 4.6 CI, infraestructura y entorno

- **INF-7:** el paso de PR "Build as deployed (GitHub Pages base path)" construye una variante que
  nadie despliega. Debería construir como `deploy.yml` (Cognito y API en el mismo origen), con
  valores de ejemplo.
- **INF-12:** Dependabot no mira las *composite actions*, Docker ni Terraform, y las imágenes base
  flotan. **INF-13 (P):** el e2e de Compose falla a veces con 429 de `public.ecr.aws`; conviene
  una descarga previa con reintentos.
- **INF-16:** las reglas de `kyrian-wave.js` prohíben tocar `docs/api` y los *lockfiles*, pero
  `just contracts` y `uv add` los regeneran. Además el *trailer* nombra otro modelo.
- **INF-18, INF-19, INF-21..24:** comentarios de Terraform restantes, comandos de `.claude/`
  obsoletos (`test_other_users_trip_is_forbidden` ya no existe), filtros de rutas que no disparan
  `docs`, `contracts` ni `infra` en algunos casos, `default_tags`, *lifecycle* del bucket y el
  README del *spike*.
- **INF-20:** en Windows, las recetas `python3` (`docs-check`, `version`, `release`) topan con el
  alias de la Microsoft Store, y el MCP de Playwright con `env -u` no arranca. (El job de docs de CI
  no instala uv, así que cambiar a `uv run` exige tocar también ese job.)
- **TOOL-7:** `release.py` no actualiza `CommonSettings.VERSION` (el OpenAPI anuncia `1.0.0`
  mientras el paquete va por `0.1.1`), ni el manifiesto del *bench* ni `package-lock.json`; hace
  commit de todo lo que haya en el índice; `pull` sin `--ff-only`; sin `--target`.

### 4.7 Documentación

Lo que queda tras el §2.5: los nombres de las herramientas MCP de Linear difieren entre
`.claude/CLAUDE.md` y los runbooks (DOC-28; no se tocó `.claude/`); la factura de AWS del README
de infra no incluye la WAF (DOC-24), y las recetas `python3` en Windows (DOC-29/INF-20).

### 4.8 Memoria (LaTeX)

La memoria está fijada en el commit `e7916c8` (23-09); lo siguiente cambió después y el equipo
decide si actualizarlo:

- "23 ADR" (`01-introduccion.tex:18`, `08-cicd-proceso.tex:130`): ahora son 24 (0025, más el hueco
  de 0012), y la tabla de `12-anexo.tex` termina en 0024.
- "tres columnas (chat ≈30 %, viaje ≈40 %, mapa ≈30 %)" y "panel central" (`02-producto.tex:61-69`):
  desde TRA-238 son dos zonas, con el viaje flotando sobre el mapa.
- `#8A5400` (`02-producto.tex:95`): la paleta "Pizarra" es salvia (`#47705F` en el tema claro).
- "98,8 % en inglés" (cinco apariciones) y "25 516 docs, cuatro ciudades" (`05-arquitectura-ia.tex`):
  hoy son 32.566 documentos, 5 ciudades (Los Ángeles) y un 99,1 % en inglés.
- La unión de eventos de `04-arquitectura-software.tex:128-130` no incluye `progress`.
- Recuentos de tests y ficheros del 23-09 (597, 1.087, 747, 259): son medidas fechadas.

---

## 5. Documentos que se han convertido en *changelog*

Los AGENTS.md se cargan en el contexto de cada agente. Cuanto más narran la historia, más cuesta
mantenerlos exactos; los errores corregidos en el §2.5 lo demuestran.

- **`src/frontend/AGENTS.md`**: 44 KB, 483 líneas y 54 referencias a TRA. La viñeta del
  planificador ocupa 17,7 KB, el 40 % del fichero, y es un recorrido por los componentes que repite
  sus comentarios de cabecera. Hay frases de historia ("there is no viewer any more", "Since
  TRA-237…"). Se podrían sacar unos 33–35 KB: el comportamiento a los comentarios de cada
  componente, las decisiones a los ADR 0019, 0020, 0024 y 0025, lo visual a `kyrian-world.md` y
  el e2e a `local-dev.md`.
- **`src/frontend/README.md`** (21 KB, unos 8–9 KB sobrantes: celdas de tabla de 1,5 KB) y el
  **README de ai_api** (21 KB, unos 7–8 KB sobrantes: la mecánica de `plan_trip.py` narrada por
  funciones privadas).

---

## 6. Cómo se entregó

Cuatro PR, una por área, con ficheros disjuntos. Cada rama se comprobó sola sobre `main` antes de
subirla, y cada una regenera únicamente los contratos que cambia su código:

1. **#211, TRA-252 — fix(core):** `_partial.py` y sus tests, el cursor (CORE-10), `just contracts`
   de core_api, `export_openapi.py` con LF y los docstrings y el AGENTS/README de core_api.
2. **#212, TRA-253 — fix(ai_api):** trazas de `progress`, *site previews* y su gemelo del corpus,
   `GENERATE_WORDS`, `strip_prices`, el test de gemelos, los filtros de `pr.yml`, el código sin uso
   de ai_api, `cities.py` (`anchor`), `just contracts` de ai_api y el README/AGENTS de ai_api.
3. **#213, TRA-254 — fix(frontend):** la redirección, los tests que caducaban, `calls.ts`,
   `fileURLToPath`, el borrador del e2e, el contraste, el código sin uso y los comentarios y el
   README/AGENTS del frontend.
4. **TRA-255 — docs:** este informe, el aviso de histórico en la revisión anterior y el resto del
   §2.5 (README y AGENTS de la raíz y del backend, travel_common, `overview.md`, ADR, runbooks,
   comentarios de infra, `justfile`, Dockerfile y `check_docs.py`).

Después, por orden de valor y riesgo: TOOL-1 (Bolonia), INF-1/INF-2, FEP-1..5, PLAN-5 + INF-4,
D1..D8 y PLAN-7.
