# Revisión de calidad de código y arquitectura

**Fecha:** 2026-09-07
**Alcance:** `src/backend` (travel_common, core_api, ai_api, tools/scraper), `src/frontend`, `infra/`, `.github/`, `justfile`, `scripts/`, `docs/`.
**Objetivo:** proponer mejoras concretas para que el código y la arquitectura sean más SOLID, DRY y limpios.
Cada hallazgo indica fichero y línea, el principio afectado y un refactor propuesto. Todo lo que se afirma se ha comprobado en el código a fecha de hoy (rama `main`, commit `1423c5b`).

Estado verificado antes de empezar: `ruff check`, `tsc --noEmit`, `eslint` y `vitest` (105 tests) pasan. Este informe no trata de bugs de CI sino de deuda de diseño.

---

## 0. Resumen ejecutivo

Lo que ya está bien (y conviene proteger):

- La **separación de servicios** es real: `ai_api` no importa `core_api` ni SQLAlchemy; hablan por HTTP con el token del usuario (ADR 0002).
- `ai_api` es un ejemplo limpio de **puertos y adaptadores**: `LLMProvider`, `Retriever`, `TripGateway` como `Protocol`; el caso de uso `StreamChat` no conoce FastAPI ni httpx; tests con `FakeProvider` y `httpx.MockTransport`, sin red.
- `travel_common` es un **shared kernel** pequeño y bien acotado (Principal, settings, errores de dominio, JWT, app factory, manejadores de error con cuerpo JSON estable).
- El frontend respeta la frontera de red (ningún componente llama a `fetch`), los tipos de request/response salen del OpenAPI generado, y `AuthContext`/`ThemeContext` usan `useSyncExternalStore` correctamente.
- Infra: un `Dockerfile` multi-stage para dos imágenes, usuario no root, healthcheck, CI con filtros por ruta, `alembic check`, drift de contratos, OIDC y promoción de imágenes por digest.

Los diez problemas de mayor impacto, en orden:

| # | Hallazgo | Principio | Sección |
|---|---|---|---|
| 1 | Las entidades hijas del viaje (destinos, días, actividades, comidas, alojamientos, transportes) no comprueban propiedad: cualquier usuario autenticado lee, modifica y borra las de otros. `GET /users/{id}` expone el email de cualquier usuario. | Seguridad / Clean Architecture | 1.1 |
| 2 | Seis ficheros de endpoints, seis servicios vacíos y seis repositorios vacíos son copias literales; sólo cambian los nombres. | DRY / OCP | 1.2 |
| 3 | Existen **dos modelos de dominio `Trip`** que no se corresponden: el del backend (plano, snake_case) y el del frontend (anidado, camelCase, escrito a mano). Los mocks ni siquiera coinciden con el tipo del frontend. | Clean Architecture (contrato) | 3.1 |
| 4 | El repositorio hace `commit` en cada operación; no hay unidad de trabajo, así que un servicio no puede componer dos escrituras atómicas. | SRP / DIP | 1.3 |
| 5 | Los modelos ORM usan la API legacy `Column` y repiten `id`, `trip_id`, `location_*`, `lat/lng` en cada tabla; los esquemas `XUpdate` reescriben a mano todos los campos de `XBase` como opcionales. | DRY | 1.4, 1.5 |
| 6 | `core_api` usa un singleton global `settings` y crea el engine al importar; `ai_api` usa `Depends(get_settings)`. Dos estilos de inyección para el mismo problema. | DIP / consistencia | 1.6 |
| 7 | La sesión del frontend está repartida entre `AuthContext` (escribe) y `services/http.ts` (lee); `Header.tsx` (378 líneas) y `PlannerCard.tsx` (271) mezclan seis responsabilidades cada uno. | SRP | 3.2, 3.3 |
| 8 | El scraper reimplementa la tubería fetch → parse → normalize → merge → write en once ficheros; 5 funciones `normalizar`, 12 llamadas HTTP sin `timeout`, `main.py` siempre termina con código 0, cero tests. | DRY / SRP / OCP | 4 |
| 9 | Variables de entorno muertas (`FRONTEND_URL`, `DB_ENGINE`) propagadas por `.env.example`, Terraform y secretos de CI; PostgreSQL 16 en dev/CI pero 15 en producción. | Docs travel with the change | 5.1, 5.3 |
| 10 | No hay comprobación estática de tipos en Python (ni mypy ni pyright), ruff sólo con `E4/E7/E9/F`, y ninguna configuración de `logging` en ningún servicio. | Clean Code | 6 |

---

## 1. Backend: `core_api`

### 1.1 Autorización incompleta en entidades hijas y en usuarios (impacto alto)

**Evidencia.**

- `core_api/api/v1/endpoints/accommodations.py:19-71` (y sus gemelos `activities.py`, `meals.py`, `destinations.py`, `itinerary_days.py`, `transportations.py`): todos los handlers reciben `_principal` y **no lo usan**. `read_accommodations` devuelve `service.list(...)`, es decir, los alojamientos de **todos** los usuarios. `create_accommodation(accommodation_in, trip_id: UUID)` acepta cualquier `trip_id` sin comprobar que pertenezca al llamante.
- `core_api/api/v1/endpoints/users.py:36-43`: `read_user(user_id)` devuelve cualquier usuario (email, nombre, foto) a cualquier autenticado.
- `docs/architecture/overview.md:114-117` y `core_api/AGENTS.md` lo reconocen como "known gap". Es el hallazgo número uno porque contradice el propio invariante del sistema ("every trip is private to the user who owns it", `trips.py:1`).

**Principios.** Es un problema de arquitectura, no sólo de seguridad: la regla de negocio "un agregado pertenece a un usuario" vive sólo en `TripService.get_owned`, y las entidades hijas se exponen como si fueran agregados independientes.

**Propuesta.**

1. Modelar `Trip` como **raíz de agregado** y colgar las rutas hijas de él: `/trips/{trip_id}/destinations`, `/trips/{trip_id}/accommodations`, `/trips/{trip_id}/days/{day_id}/activities`. El `trip_id` deja de ser un query param en un `POST /accommodations/?trip_id=...` (smell REST) y pasa a ser parte del recurso.
2. Un único dependable que resuelve y autoriza el padre:

   ```python
   # core_api/api/deps.py
   async def get_owned_trip(
       trip_id: UUID,
       principal: Principal = Depends(get_current_user),
       trips: TripService = Depends(get_trip_service),
   ) -> Trip:
       return await trips.get_owned(trip_id, principal)
   ```

   Los endpoints hijos dependen de `get_owned_trip` y el servicio filtra por `trip_id` (`repository.list_by_trip(trip.id)`), de modo que un id ajeno devuelve 404 y no 403 (no se filtra existencia).
3. Para actividades y comidas, cuyo padre es `ItineraryDay`, el repositorio resuelve la pertenencia con un `join` a `trips.user_id`, o el servicio comprueba `day.trip_id == trip.id` tras `get_owned_trip`.
4. `GET /users/{user_id}` y `GET /users/` deberían ser sólo admin (ya existe `get_current_admin_user`); el perfil propio se sirve por `/users/me`.
5. Añadir tests de propiedad para cada entidad hija (hoy sólo `tests/api/test_trips.py` cubre trips) y retirar el "known gap" de `overview.md` y ADR 0001 al cerrarlo.

### 1.2 Seis endpoints, seis servicios y seis repositorios copiados (DRY / OCP)

**Evidencia.**

- `diff endpoints/accommodations.py endpoints/transportations.py` sólo difiere en identificadores; lo mismo `activities.py` vs `meals.py`. Son 5 handlers × 6 ficheros = 30 funciones idénticas (~400 líneas).
- `services/accommodation_service.py`, `activity_service.py`, `destination_service.py`, `meal_service.py`, `transportation_service.py`: clases con cuerpo `pass`. `repositories/*_repository.py` (6 ficheros): sólo `model = X`.
- `services/__init__.py`, `repositories/__init__.py`, `schemas/__init__.py` (89 líneas) y `models/__init__.py` re-exportan a mano las mismas listas.
- Los docstrings delatan la generación por plantilla: "Create a accommodation", "Get a activity by ID" (`accommodations.py:39,49`, `activities.py:33,43`).

**Propuesta.** Una fábrica de router para entidades hijas, parametrizada por un descriptor:

```python
# core_api/api/crud_router.py
@dataclass(frozen=True)
class ChildResource[M, C, U, R]:
    name: str                      # "accommodations"
    service_dep: Callable[..., BaseService[M, C, U]]
    create_schema: type[C]
    update_schema: type[U]
    response_schema: type[R]
    parent_field: str              # "trip_id" | "itinerary_day_id"

def child_router(res: ChildResource) -> APIRouter:
    router = APIRouter(prefix=f"/{res.name}", tags=[res.name.title()])

    @router.get("/", response_model=list[res.response_schema])
    async def list_(trip: Trip = Depends(get_owned_trip), page: Page = Depends(),
                    service=Depends(res.service_dep)):
        return await service.list_for_parent(trip.id, page)
    ...
    return router
```

y en `api_router.py` una lista declarativa:

```python
for res in CHILD_RESOURCES:  # accommodations, transportations, destinations, ...
    trips_router.include_router(child_router(res))
```

Con esto añadir una entidad hija es: modelo, esquema y una entrada en `CHILD_RESOURCES`. Las clases de servicio/repositorio vacías pueden desaparecer (`BaseRepository[Model]` y `BaseService` ya son genéricos; `provide()` puede recibir `BaseRepository.for_model(Accommodation)`), y sólo `TripService` y `UserService` conservan clase propia porque tienen reglas. Si se prefiere mantener una clase por entidad como punto de extensión, al menos eliminar los `__init__.py` de re-export manual (no aportan nada con imports absolutos).

Detalles asociados:

- `skip`/`limit` se repiten en 8 handlers: un dependable `Page` (`skip: int = Query(0, ge=0)`, `limit: int = Query(100, ge=1, le=500)`).
- `PUT` que hace actualización parcial (`exclude_unset=True`) es semánticamente `PATCH`; alinear verbo y contrato.
- `TripSummaryResponse` (`schemas/trip.py:22-32`) no lo usa nadie: eliminar o exponer `GET /trips/` con él (el frontend sí tiene `TripSummary`).

### 1.3 El repositorio es dueño de la transacción (SRP / DIP)

**Evidencia.** `repositories/base.py:28-41`: `create`, `update` y `delete` hacen `await self.db.commit()` cada uno. `update(obj)` ni siquiera recibe cambios: confía en que el objeto ya está modificado y adjunto a la sesión (acoplamiento temporal implícito). `UserService.find_or_create_google_user` (`user_service.py:40-46`) muta el ORM y luego llama a `repository.update(user)`.

**Por qué importa.** Un caso de uso que cree un viaje con sus destinos, o que actualice varios días, no puede ser atómico; y los tests no pueden envolver cada caso en una transacción que se revierta (hoy `conftest.py:62-64` borra tabla a tabla).

**Propuesta.** Unidad de trabajo en la frontera HTTP: `get_db` hace `commit` al terminar la petición con éxito y `rollback` si hay excepción; los repositorios sólo `add`/`delete`/`flush`. Alternativa explícita: un `UnitOfWork` inyectado al servicio con `async with uow:`. Cualquiera de las dos deja a `BaseRepository` sin conocimiento del ciclo de vida.

```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

### 1.4 Modelos ORM: API legacy y columnas repetidas (DRY)

**Evidencia.**

- `models/base.py:10` afirma "Uses the SQLAlchemy 2 class-based API for full mypy/pyright support", pero todos los modelos usan `Column(...)` sin `Mapped[]` (`models/trip.py:31`, `models/user.py:14`, ...). Sin `Mapped` ningún type-checker infiere los tipos de atributo.
- `id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)` y `trip_id = Column(UUID, ForeignKey("trips.id", ondelete="CASCADE"), ...)` se repiten en 6 modelos. `created_at/updated_at` sólo existen en `Trip`.
- `location_name/address/city/lat/lng` están duplicados en `Activity` (`activity.py:41-45`) y `Meal` (`meal.py:29-33`); `lat/lng` además en `Destination` y `Accommodation`.
- `is_active = Column(Boolean, default=True)` (`user.py:16`) es nullable; `UserRole = Role` (`user.py:8`) es un alias de compatibilidad que ya nadie usa.
- `time = Column(String(10))` para "09:00", `country_code = String(3)` comentado como "alpha-2/3", `budget_currency = String(3)` sin validación, `type`/`category` como texto libre (`meal.type` "breakfast/lunch/dinner", `transportation.type` "flight/train"), `duration_days` almacenado aunque se deriva de las fechas, `ai_local_tips: JSON` documentado como `str | str[]`.

**Propuesta.**

```python
class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

class TripChildMixin:
    trip_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"), index=True)

class LocationMixin:            # Activity, Meal
    location_name: Mapped[str | None]
    ...

class MealType(StrEnum): BREAKFAST = "breakfast"; LUNCH = "lunch"; DINNER = "dinner"
```

Migrar a `Mapped[...]`/`mapped_column` es mecánico y no cambia el esquema (verificable con `alembic check`). Los enums (`MealType`, `TransportType`, `ActivityCategory`) se comparten con Pydantic y llegan al frontend por el OpenAPI, eliminando comparaciones con literales en la UI (ver 3.1). Añadir `TimestampMixin` a todas las tablas.

### 1.5 Esquemas Pydantic: `XUpdate` reescrito a mano y estilos mezclados

**Evidencia.** `schemas/trip.py:74-96` repite los 22 campos de `TripBase` como `Optional`; igual en `activity.py:32-46`, `meal.py:29-40`, `accommodation.py:33-48`, `transportation.py:31-44`, `destination.py:25-33`, `itinerary_day.py:26-32`. Un campo nuevo hay que añadirlo en tres clases. Además `schemas/*.py` usan `Optional[...]`, `List[...]`, `Union[...]` de `typing` mientras `user.py` y el resto del backend usan `X | None` (7 ficheros con `Optional`).

**Propuesta.** Generar el modelo parcial a partir del base:

```python
# travel_common o core_api/schemas/_partial.py
def partial[T: BaseModel](model: type[T], name: str) -> type[BaseModel]:
    fields = {n: (f.annotation | None, None) for n, f in model.model_fields.items()}
    return create_model(name, **fields)

TripUpdate = partial(TripBase, "TripUpdate")
```

Las validaciones de dominio que hoy no existen deben vivir en los esquemas base (`model_validator` para `start_date <= end_date`, `Field(ge=0)` para viajeros y costes, `Field(pattern=r"^\d{2}:\d{2}$")` para `time`, `Literal`/enum para `type`). Unificar a sintaxis `X | None` (ruff `UP` lo hace solo, ver sección 6).

### 1.6 Inyección de configuración: dos estilos y efectos al importar

**Evidencia.**

- `core_api/config.py:33` `settings = get_settings()` es un singleton de módulo; `db/session.py:5` crea el `engine` al importar; `api/deps.py:9`, `auth/google.py:7`, `endpoints/auth.py:7`, `alembic/env.py:30` y `tests/conftest.py:13` lo importan directamente. No se puede levantar la app con otra configuración sin manipular el entorno antes del import.
- `ai_api` hace lo contrario y lo hace bien: `Depends(get_settings)` en `api/deps.py:20,26,44`, y los tests lo sobreescriben con `dependency_overrides` (`tests/conftest.py:31`).
- `auth/google.py:14-31`: `verify_google_token` es una función libre que lee `settings` global y lanza `ValueError`; el endpoint `auth.py:23-35` traduce a `Unauthorized`, llama al servicio **y** repite la regla "usuario inactivo" que ya existe en `UserService.get_active`. El endpoint contiene lógica de aplicación (regla 3 del proyecto en espíritu).

**Propuesta.**

1. Adoptar en `core_api` el mismo patrón que `ai_api`: `get_settings()` inyectado; el engine se crea en el `lifespan` de la app (o de forma perezosa) y se guarda en `app.state`.
2. Un puerto `GoogleTokenVerifier(Protocol)` con adaptador `GoogleTokenInfoVerifier(client_id, http)` que lance `Unauthorized`; y un caso de uso `GoogleSignIn(verifier, users, settings)` que encapsule verificar → upsert → comprobar activo → emitir token. El endpoint queda en tres líneas y el flujo es testeable sin red (hoy no hay ningún test de `/auth/google`).
3. `principal_from_token` + `user_service.get_active` en `deps.get_current_user` está bien; documentar que es una decisión (DB como fuente de verdad) y no una inconsistencia con `ai_api`.

### 1.7 Otros puntos de `core_api`

- `endpoints/health.py:6` importa `get_db` desde `core_api.api.deps` (re-export accidental) en lugar de `core_api.db.session`; captura `Exception` y devuelve **200** con `"status": "error"`, lo que engaña a cualquier orquestador. Devolver 503 (`ProviderUnavailable`) y usar `SELECT 1` con timeout.
- `UserService(BaseService[User, BaseModel, UserUpdate | UserRoleUpdate])` (`user_service.py:11`): el parámetro `CreateT = BaseModel` existe sólo para satisfacer el genérico; `create()` heredado no tiene sentido para usuarios (se crean por Google). Es una señal de que `BaseService` mezcla lectura, escritura genérica y reglas; separar `ReadService` / `CrudService` (ISP) o no heredar.
- `EntityNotFound.__init__(entity, entity_id)` (`travel_common/exceptions.py:41`) cambia la firma de `DomainError.__init__(message, **extras)`: una subclase no sustituible por su base (LSP). Mantener la firma y ofrecer un classmethod `EntityNotFound.for_entity("Trip", id)`.
- `tests/conftest.py:36-42` construye SQL con f-strings (`CREATE DATABASE {TEST_DB_NAME}`) y usa `create_all` en lugar de las migraciones: las migraciones nunca se ejecutan contra la base de tests. Usar `alembic upgrade head` en el fixture de sesión (CI ya tiene Postgres) y transacciones con rollback por test.
- `api_router.py:2-13` y `deps.py:9-14`: imports sin ordenar (mezclan `travel_common` entre `core_api`); ruff `I` lo corrige.

## 2. Backend: `ai_api` y `travel_common`

`ai_api` es la parte mejor diseñada del repositorio. Mejoras menores:

- **Un cliente HTTP por petición.** `api/deps.py:26-37` construye un `NvidiaProvider` nuevo en cada request y `nvidia_provider.py:79-81` abre un `httpx.AsyncClient` por llamada: sin pool de conexiones ni keep-alive con NVIDIA. Crear el provider (y su cliente) una vez en el `lifespan` y exponerlo por `app.state`; el `Depends` sólo lo devuelve.
- **Fuga de detalle interno al navegador.** `nvidia_provider.py:60` envuelve el error como `ProviderUnavailable(f"AI provider error: {exc}")`, donde `exc` es un `HTTPStatusError` cuyo mensaje incluye el **cuerpo de respuesta de NVIDIA** (`:85-86`); `sse.py:47-49` captura `Exception` y emite `{"error": str(exc)}` al cliente. Emitir al cliente sólo un mensaje genérico (o el `error_code`) y registrar el detalle en el log.
- **Parámetros de generación fijos.** `max_tokens=4096`, `temperature=0.7`, `top_p=0.95` (`nvidia_provider.py:73-75`) deberían ser `AISettings` o parámetros del caso de uso.
- **Contrato sin tipo.** `TripGateway.create_trip(bearer_token, trip: dict[str, Any]) -> dict[str, Any]` (`domain/ports.py:25-27`) y `get_trip_gateway` (`deps.py:44`) no se usan todavía. Cuando se use, definir un `TripDraft` (dataclass del dominio de `ai_api`) y que el adaptador serialice; el `dict` deja el contrato con `core_api` sin verificar.
- **Prompt en código.** `application/stream_chat.py:29` construye `"Use this background information:\n..."` inline; moverlo a `prompts.py`, que existe para eso.
- **Nombres.** `ai_api.domain.models.Role` (Literal de roles de chat) colisiona con `travel_common.principal.Role` (rol de usuario); renombrar a `ChatRole`. `testing.py` viaja en el paquete de producción: aceptable si se documenta, pero `AGENTS.md`/`README.md` de `ai_api` lo llaman `test_settings()` y la función real es `settings_for_tests()`.
- **Rutas.** `health.py` registra `"/"` y `chat.py` registra `""`: uniformar las barras finales en ambos servicios (afecta a las URLs del healthcheck en Dockerfile, Terraform y CI, ver 5.4).

`travel_common`:

- `exceptions.py:4` referencia `core/error_handlers.py`, ruta que ya no existe (`http/error_handlers.py`).
- `error_handlers.py:30` usa el literal `422` junto a constantes `status.*`.
- `security.decode_access_token` devuelve `dict`; un `TypedDict TokenClaims` (`sub`, `email`, `role`, `exp`) documenta el contrato entre servicios (ADR 0002).
- `CommonSettings.FRONTEND_URL` (`config.py:23`) no se usa en ningún servicio (ver 5.1).
- **No hay configuración de logging** en ningún servicio ni en `create_app`: los `logger.info/warning` de la aplicación sólo salen si el root logger tiene handler. Añadir `configure_logging(level)` en `travel_common.http` y un `LOG_LEVEL` en `CommonSettings`; opcionalmente un middleware de `request_id`.

## 3. Frontend

### 3.1 Dos modelos de `Trip` y mocks que no cumplen ninguno (impacto alto)

**Evidencia.**

- `src/types/trip.ts` define un `Trip` camelCase anidado (`dates`, `travelers`, `budget`, `preferences`, `aiInsights`, `coordinates`, `location`) con 11 importadores en `components/trip-viewer/**` y `app/trip/[id]/TripClientPage.tsx`.
- El contrato real es `components["schemas"]["TripResponse"]` en `src/types/generated/core-api.ts:1158` (plano, snake_case: `budget_accommodation`, `travelers_adults`, `itinerary_days`, `transportations`, `ai_local_tips`). La regla del frontend dice "do not redeclare response shapes by hand".
- `src/services/trips.ts:26,34` hace `mod.default as Trip` / `as TripSummary[]`: el cast oculta que el mock `trip-grand-european-tour.json` usa en `transportation[]` las claves `departure`, `arrival`, `confirmationNumber` mientras el tipo (y `TripOverview.tsx:70`) esperan `departureTime`, `arrivalTime`, `bookingReference`; esa vista renderiza `undefined - undefined` para ese viaje. Su `aiInsights` trae `packingList` y `budgetOptimization` que el tipo no conoce.
- `Trip.status: string` (`trip.ts:115`) frente a `TripStatus` del backend; `TripHeader.tsx:32` compara con `"confirmed"`, valor inexistente. `DayCard.tsx:28` decide si un día es libre buscando "free day" o "día libre" en el título.

**Principio.** La frontera UI ↔ datos está bien orientada (componentes → servicios) pero el contrato es un `as`. Es exactamente la capa anticorrupción que falta.

**Propuesta.**

1. Declarar el modelo de vista como tal y darle un **mapper único** en la capa de servicios:

   ```ts
   // src/services/trips.ts
   type TripResponse = components["schemas"]["TripResponse"];
   export function toTrip(dto: TripResponse): Trip { /* snake→camel, budget_*→budget, ai_local_tips→string[] */ }
   ```

2. Hacer que los **mocks tengan la forma del backend** (`TripResponse`) y pasen por `toTrip`. Con `resolveJsonModule`, TypeScript infiere el literal del JSON y falla en compilación si el mock no cumple el contrato. Conectar la API real será cambiar el origen del DTO.
3. Tipar discriminantes desde el OpenAPI: `status: TripStatus`, `category`, `meal.type` (ver 1.4). Los derivados de presentación (`isFreeDay`, `hasTravel`, `totalTravelers`, `durationDays`) se calculan en el mapper, no en JSX.
4. Corregir o regenerar el mock europeo.
5. Decidir y documentar en un ADR la estrategia de `/trip/[id]` con export estático: hoy `dynamicParams = false` + `generateStaticParams` sobre los ids de los mocks (`app/trip/[id]/page.tsx:10,21-24`) no funcionará con datos por usuario; `not-found.tsx:21-31` redirige tras 2 s como parche. El README del frontend describe un diseño (`generateStaticParams([{ id: '_' }])` + `useParams`) que no es el implementado.

### 3.2 La sesión no tiene dueño (SRP / DIP)

**Evidencia.** `context/AuthContext.tsx` (257 líneas) decodifica JWT de Google, escribe `localStorage`, mantiene un store con listeners, mapea `AuthUser → User`, aplica política prod/dev y navega (`router.push("/")`, línea 231). Mientras, `services/http.ts:82-98` **lee** el mismo token del mismo `localStorage`. En modo estático, `login` con credencial inválida no lanza (`:219-224`), así que `LoginModal` cierra y redirige a `/dashboard` como si hubiera funcionado.

**Propuesta.** Un módulo `services/session.ts` como único dueño de storage y suscripción (`readSession`, `writeSession`, `clearSession`, `subscribe`, `getSnapshot`); `services/auth.ts` con `loginWithGoogle(credential): Promise<User>` que decide API vs estático y lanza en fallo; `AuthContext` reducido a `useSyncExternalStore` + `login/logout` delegados (~60 líneas). La navegación tras logout pertenece a `UserMenu`, no al contexto. El patrón "listeners + evento `storage`" duplicado entre `ThemeContext.tsx:26-39` y `AuthContext.tsx:90-103` se extrae a `createLocalStorageStore(key)`.

**Relacionado (seguridad):** `components/auth/LoginModal.tsx:67-73` hace `router.push(decodeURIComponent(searchParams.get("redirect")))` sin validar: open redirect. Aceptar sólo rutas que empiecen por `/` y no por `//`.

### 3.3 Componentes con demasiadas responsabilidades

- `components/layout/Header.tsx` (378 líneas): scroll, clic fuera vía selector CSS `.dropdown-container`, logo, nav, tema, idioma, CTA, menú de usuario y drawer móvil; **cada bloque está duplicado** en versión desktop y móvil (logo 72-79 / 233-244, nav 82-94 / 258-282, tema 100-106 / 338-344, idioma 109-139 / 346-364, usuario 150-198 / 286-330). Extraer `Logo`, `MarketingNav`, `ThemeToggle`, `LanguageSwitcher` (variantes), `UserMenu`, `MobileDrawer`, y hooks `useScrolled`/`useClickOutside(ref)`. El drawer permanece montado cuando está cerrado (sólo `translate-x-full`), por eso los tests usan `getAllByText(...)[0]`.
- `components/ui/PlannerCard.tsx` (271 líneas): máquina de estados del chat, coalescing por `requestAnimationFrame`, stick-to-bottom, autoresize, teclado y tres bloques de markup; redefine `ChatMessage` (14-17) aunque `services/chat.ts:8` ya lo exporta; `console.error` en UI; no puede abortar el stream al desmontar. Mover a `components/planner/` con `useChatStream()`, `useStickToBottom()`, `useAutoResizeTextarea()` y subcomponentes `MessageList`, `PromptComposer`, `ExamplePills`. `streamChat` debe aceptar `AbortSignal`.
- Layouts: `DashboardLayout.tsx` y `TripViewLayout.tsx` son idénticos salvo `pb-20`; `ProtectedRoute` se envuelve a mano en cada página cliente. Usar route groups de App Router (`app/(marketing)/layout.tsx`, `app/(app)/layout.tsx`) con `ProtectedRoute` una sola vez.

### 3.4 DRY y i18n

- `language === "en" ? "en-US" : "es-ES"` aparece 10 veces en 8 ficheros (`TripHeader.tsx:63,73`, `BudgetCard.tsx:22`, `DayCard.tsx:63,95`, `ActivityItem.tsx:53`, `TripOverview.tsx:47`, `InteractiveTimeline.tsx:104`, `DestinationTimeline.tsx:39`). El contexto de idioma debe exponer `locale` y un hook `useFormatters()` (`formatDate`, `formatCurrency`). `BudgetCard` deja de recibir `language` por props.
- Metadatos de idioma (`FLAG`, lista `["en","es"]`, nombres nativos) viven en `Header.tsx:14,122,134,347`. Con un `LANGUAGES` en `src/i18n/index.ts` la promesa del README ("añadir un idioma no toca otros ficheros") vuelve a ser cierta.
- ~20 cadenas visibles fuera de i18n (regla 6): `LoginModal.tsx:41,54,100`, `app/error.tsx:37-46`, `app/loading.tsx:14`, `LoadingSpinner.tsx:9`, `AIInsights.tsx:23,27`, `TripCard.tsx:12-22` (existen `t.common.*` y no se usan), `Header.tsx:112,134,216,249,336`, `not-found.tsx:39` (ternario por idioma), `Footer.tsx:63`. Fallbacks imposibles como `t.tripViewer.viewItinerary || "View Itinerary"` (`InteractiveTimeline.tsx:121`) y `t.dashboard?.emptyTitle || "..."` (`EmptyDashboard.tsx:25,29`) sobre claves tipadas como obligatorias.
- Estructura i18n: `footer.links: Record<string, string[]>` usa títulos traducidos como claves (la estructura cambia por idioma); `hero.trust1/2/3` debería ser un array; `common.{planning,planned,finished}` debería ser `status: Record<TripStatus, string>` para eliminar los `switch` de `TripHeader` y `TripCard`. Ocho claves sin uso (`nav.home`, `planPage.*`, `tripPage.*`, `auth.loggedIn`, `auth.signingIn`, `auth.loginWithGoogle`, `tripViewer.backToDashboard`, `notFound.title`).
- Markup: contenedor `max-w-[1440px] w-full mx-auto px-8 lg:px-16` copiado en `PlannerCard.tsx:156`, `Footer.tsx:19`, `Header.tsx:70` en vez de `Container`; cabecera de sección idéntica en `FeaturesSection.tsx:29` y `HowItWorks.tsx:31`; altura del header `72px` en 6 sitios; sombra `rgba(79,110,247,…)` literal 7 veces; `Card` fija `p-6` y los consumidores añaden `p-8` sin `tailwind-merge` (el resultado depende del orden del CSS). Tokens `--header-h`, `--shadow-accent-glow`, `--color-error/success/warning` (hoy `text-red-400`, `text-green-500`... y `hover:text-error` referencia un token que no existe en `globals.css`).

### 3.5 Servicios, tests y tooling

- `services/http.ts` mezcla configuración de URLs, storage de sesión, cabeceras y parseo de errores; `auth.ts:18-25` y `chat.ts:24-35` repiten `fetch` + `Content-Type` + `!res.ok` + `readErrorMessage`. Un `request<T>(service, path, init)` que lance `ApiError { status, code }` conserva el `error_code` del backend (hoy se descarta y la UI muestra el mensaje del servidor en el idioma del servidor).
- El parser SSE de `chat.ts:43-63` está embebido en el generador y tiene **cero tests**; extraer `parseSseEvents(buffer)` puro y testear cortes a mitad de línea, `[DONE]`, `{"error"}`.
- Sin tests: `services/chat.ts`, `services/http.ts`, `services/auth.ts`, `LoginModal`, `ProtectedRoute`, `ThemeContext`, `LanguageContext`. En cambio hay tests para componentes muertos.
- Código muerto (sin importadores): `DestinationTimeline.tsx`, `JourneyMap.tsx`, `LandingRedirect.tsx`, `Skeleton.tsx`; `api.dicebear.com` en `next.config.ts` sin uso; `@playwright/mcp` es herramienta de agentes, no dependencia del frontend.
- Tests frágiles: 8 ficheros repiten los mismos `vi.mock` de primitivas (`Card`, `Section`, `Container`, `next/link`); aserciones sobre clases Tailwind (`Header.test.tsx:153,158`, `PlannerCard.test.tsx:84`); `lucide-react` mockeado icono a icono; fixtures con `as unknown as Trip`. Proponer `src/test/render.tsx` (`renderWithProviders` con el `LanguageProvider` real) y `makeTrip(overrides)` tipado.
- ESLint sólo con `next/core-web-vitals` + `next/typescript`. Las reglas del proyecto pueden hacerse mecánicas: `no-restricted-globals` para `fetch` fuera de `src/services`, `no-restricted-imports` para `@/mocks/*` y `@/types/generated/*` fuera de servicios, `import/first` (hay imports a mitad de fichero en `layout.tsx:36`, `LoginModal.tsx:14`, `DashboardClientPage.tsx:13`). `tsconfig`: activar `noUncheckedIndexedAccess` (habría señalado `STEP_IMAGES[i]`, `ICON_MAP[i]`, `statusConfig[trip.status]`).
- `layout.tsx:57`: `NEXT_PUBLIC_GOOGLE_CLIENT_ID || "PLACEHOLDER_CLIENT_ID"` enmascara una configuración ausente en producción.

## 4. Scraper (`src/backend/tools/scraper`)

23 ficheros, 2 040 líneas, 35 funciones, 2 con anotaciones de tipo, 67 `print`, 0 `logging`, 0 tests, 12 llamadas `requests.get/post` y **ninguna** con `timeout`. `core/http_client.py` existe y no tiene ningún importador.

Duplicación medida:

| Patrón | Ocurrencias | Dónde |
|---|---|---|
| `normalizar()` / `_norm()` (NFD + lower + espacios) | 5 definiciones | `emt_madrid_fusion.py:11`, `cercanias_madrid_fusion.py:10`, `iglesias_palacios_fusion.py:10`, `iglesias_palacios_wiki.py:16`, `emt_madrid_lineas_from_csv.py:22` |
| `os.makedirs("data")` + `json.dump(indent=4, ensure_ascii=False)` | 10 / 16 | todos los `sources/*` |
| `open("data/...")` relativo al CWD | 22 | todos los `sources/*` (funciona sólo porque `justfile` hace `cd`) |
| Dict de 8 campos + `"fuente": "Google Places (New)"` | 9 copias | `core/utils.py` ×7, `emt_madrid_google.py:59-69`, `cercanias_madrid_google.py:90-100` |
| Cabecera `X-Goog-FieldMask` literal | 5 | `scraper_general.py:65,124`, `emt_madrid_google.py:14`, ... |
| `get_close_matches(..., cutoff=0.6)` + fallback | 5 | todos los `*_fusion.py` |
| Bucle wikitable → `estaciones.setdefault(...)` | 2 idénticos | `metro_madrid_wiki.py:76-87`, `cercanias_madrid_wiki.py:64-75` |
| Nearby vs Text Search en el motor genérico | 35 líneas, 5 distintas | `scraper_general.py:78-112` vs `137-168` |

Hallazgos principales:

1. **No existe la abstracción "fuente"** (SRP/OCP): Metro, Cercanías, EMT e Iglesias reimplementan la misma tubería con variaciones accidentales (dedupe por nombre en `cercanias_madrid_google.py:63` y por id en `emt_madrid_google.py:52`; `metro_fusion.py:27` hace fuzzy match sin normalizar; tipos de retorno distintos en cada script).
2. **Tres listas de las mismas entidades unidas por fuzzy matching**: `LUGARES` (`iglesias_palacios_madrid.py:16-35`) y `WIKI_NOMBRES` (`iglesias_palacios_wiki_names.py:3-22`) son la misma lista de 16 nombres y se emparejan con `cutoff=0.4` (puede cruzar "San Andrés" con "San Ginés" en silencio). Los 9 intercambiadores de EMT están escritos tres veces en tres formatos.
3. **`main.py:42-93` es una lista fija de 21 `run_safe(...)`**: sin `argparse`, sin selección de paso o ciudad, y `run_safe` traga la excepción de modo que el proceso **siempre sale con 0**.
4. **El motor "genérico" conoce categorías concretas**: `scraper_general.py:101-110` hace `if categoria == "metro"` porque `core/utils.py` tiene 7 normalizadores con dos aridades distintas, resueltos por nombre de string vía `getattr(utils, normalizer_name)`.
5. **Sin esquema de salida**: la clave del subtipo cambia por categoría (`tipo_comida`, `tipo_museo`, `tipo`...), `"count"` se calcula a mano en 8 sitios, `fuente`/`source` conviven con 4 valores distintos para lo mismo.
6. **Configuración**: `load_dotenv()` al importar (`config/env.py:7`), `API_KEY` congelada en constantes al importar, y con clave vacía Google devuelve 4xx que `emt_madrid_google.py:21-23` convierte en `[]` sin distinguir "sin clave" de "sin resultados".
7. **`config/categories.py` (288 líneas)** mezcla parámetros de API, reglas de filtrado, presentación en español, zonas y plumbing; "Madrid" aparece 31 veces. El README promete que otra ciudad es "cambiar coordenadas y páginas"; en la práctica son ~15 ficheros.

Propuesta (en orden de menor riesgo):

1. `core/matching.py` (`normalize_name`, `match_by_name`, `dedupe` con tupla lexicográfica en lugar de `score = rating + reviews`, que suma un 0-5 a cientos) y `core/io.py` (`write_dataset`, rutas basadas en `Path(__file__)`). Añadir tests.
2. `ScraperSettings(BaseSettings)` (pydantic-settings ya está en el lockfile) + un `HttpClient` real con `timeout`, `Retry`, User-Agent identificativo (la política de Wikimedia lo pide; hoy se envía un UA de navegador) y caché en disco; borrar `core/http_client.py` y `config/env.py`.
3. Modelos `Place` / `Dataset` en Pydantic con `fuente: Literal[...]` y un único `normalize_place(place, extra_field=...)`; exportar el JSON Schema a `docs/api/` como se hace con OpenAPI.
4. `Source(Protocol)` + `Domain` (google, wiki, merge) + registro; `main.py` con `argparse` (`--city`, `--only`, `--stage`) y código de salida.
5. Configuración por ciudad en YAML (`config/cities/madrid.yaml`) validada con Pydantic.
6. `logging` en lugar de `print`; incluir `tools/scraper/tests` en `testpaths`; ADR `0005-scraper-pipeline.md`.

## 5. Infraestructura, CI y tooling

### 5.1 Variables de entorno muertas o incoherentes

- `FRONTEND_URL` se define en `travel_common/config.py:23` y **no se usa** (CORS usa `BACKEND_CORS_ORIGINS`). Aun así aparece en ambos `.env.example`, `infra/gcp/cloud_run.tf:11`, `infra/aws/ecs.tf:13`, ambos `variables.tf`, ambos `tfvars.example`, `deploy-backend.yml:65` (como secreto) e `infra/README.md:28`.
- `DB_ENGINE=postgresql` se inyecta en `cloud_run.tf:27` y `ecs.tf:30` pero `CoreSettings` no tiene ese campo (`extra="ignore"` lo descarta).
- `BACKEND_CORS_ORIGINS`, la variable que sí controla CORS, **falta** en `core_api/.env.example`. `ai_api/.env.example` omite `NVIDIA_BASE_URL`, `NVIDIA_*_TIMEOUT`, `NVIDIA_MAX_RETRIES`.

Propuesta: eliminar `FRONTEND_URL` y `DB_ENGINE` de toda la cadena; completar los `.env.example`; y un test en `travel_common/tests` que compare las claves de cada `.env.example` con `Settings.model_fields` en ambas direcciones, para cerrar esta deriva de forma permanente.

### 5.2 Duplicación entre `infra/gcp` e `infra/aws` y dentro de cada uno

13 de 15 variables idénticas (`gcp/variables.tf:18-90` vs `aws/variables.tf:7-79`), `locals.secret_values` (`*/secrets.tf:1-9`), `locals.frontend_env`, los bloques `env`/`secret_env` de cada servicio y el default del modelo `"minimaxai/minimax-m3"` (que además vive en `ai_api/config.py:13` y su `.env.example`). En AWS, los dos target groups (`alb.tf:15-47`) son idénticos salvo `path`, y la lista de servicios está en `ecr.tf`, `alb.tf` y `ecs.tf`; `data.aws_caller_identity` (`main.tf:1`) no se usa; `gcp/variables.tf:12` declara `zone` "used by Cloud SQL" y `cloud_sql.tf` no la usa.

Propuesta: un módulo neutro `infra/modules/app_config/` (sin providers) que devuelva `{core = {env, secrets}, ai = {env, secrets}}` consumido por ambos roots; `locals.services = { core-api = { health = ... }, ai-api = { health = ... } }` con `for_each` en ECR, target groups y módulos; el default del modelo sólo en `ai_api/config.py` (`nvidia_chat_model = null` en Terraform).

### 5.3 Versiones repetidas a mano y sin fichero canónico

| Herramienta | Dónde |
|---|---|
| Python 3.12 | `Dockerfile:10`, `.github/actions/setup-uv/action.yml:15`, `.devcontainer/Dockerfile:48,51`, 5 `requires-python`, docs |
| Node 24 | `pr.yml:192,238`, `deploy.yml:31`, `.devcontainer/Dockerfile:33`; no hay `.nvmrc` ni `engines` |
| uv | `Dockerfile:16` fija `0.8`; `setup-uv` y devcontainer instalan la última |
| PostgreSQL | **16** en `pr.yml:98`, `docker-compose.yml:55`, devcontainer, docs; **15** en `infra/gcp/cloud_sql.tf:3` e `infra/aws/rds.tf:4` |

CI valida las migraciones contra una major distinta a la de producción. Propuesta: `.python-version`, `.nvmrc` + `engines`, versión de uv en un solo sitio, y subir infra a Postgres 16.

### 5.4 CI y workflows

- El filtro `changes` de `pr.yml:32-59` no incluye `infra/**`: un PR que rompa HCL no dispara nada; ambos `terraform.tfvars.example` están sin `terraform fmt`. El filtro `docs` no incluye `justfile` aunque `check_docs.py` valida las recetas citadas. `scripts/` no se lintea (`ruff` desde `src/backend` no lo alcanza; `release.py:111` tiene un `F541`).
- Setup de Node + `npm ci` copiado tres veces (`pr.yml:189-197`, `pr.yml:235-243`, `deploy.yml:28-37`); el build de imagen copiado en `pr.yml:155-164` y `backend-images.yml:56-66`. Existe `setup-uv` como composite action; falta `setup-frontend` y un reusable `_build-image.yml`.
- `deploy-backend.yml:92` obtiene la región de producción **parseando `terraform.tfvars.example`**. Debe ser una `vars.GCP_REGION` o `terraform output`.
- `TF_VAR_frontend_url`, `TF_VAR_backend_cors_origins` y `google_client_id` (`sensitive = true`) se tratan como secretos aunque el client id va embebido en el bundle público (`deploy.yml:45`).
- `pr.yml:254-263` ejecuta `next build` dos veces (`test:e2e:static` incluye un build). Ningún job tiene `timeout-minutes`; no hay `dependabot.yml`.
- CI no usa `just`: reimplementa `lint`, `contracts-check` y `docs-check`. Con `extractions/setup-just`, el `justfile` sería la única definición, como promete el README.
- La tabla `SERVICE → ruta de health` (`/api/v1/health/` vs `/api/v1/ai/health/`) vive en 5 sitios: `Dockerfile:66-69`, `cloud_run.tf:22,53`, `alb.tf:23,40`, `pr.yml:172,176`, `nginx.conf:18`.

### 5.5 `justfile`, Docker Compose, docs

- `justfile:9` fija `windows-shell` a PowerShell 5.1 pero las recetas usan `[ -f x ] || cp`, `&&` y `rm -rf` (`justfile:26-28,144`): `just setup` falla en Windows. Usar `sh -cu` (Git Bash) o recetas `[windows]`, y corregir `AGENTS.md:47`.
- Faltan recetas `infra-fmt`/`infra-validate` y `test-e2e-static` (lo que corre CI).
- `docker-compose.yml:57` pasa el `.env` completo de `core_api` (con `SECRET_KEY`, `GOOGLE_CLIENT_SECRET`) al contenedor de Postgres sólo para leer `DB_*`; `proxy.depends_on` no usa `condition: service_healthy` pese a existir `HEALTHCHECK`.
- Docs desfasadas: `docs/runbooks/local-dev.md:32` y `docker.md:34` apuntan a `http://localhost:8001/docs` (la ruta real es `/api/v1/ai/docs`); `.claude/commands/backend-db-migrate.md:16` usa la ruta previa a ADR 0004; `CommonSettings.VERSION = "1.0.0"` es lo que anuncia el OpenAPI mientras `release.py` mantiene `0.1.1`.
- Terraform: sin `depends_on` entre Cloud Run y `google_secret_manager_secret_version` (primer `apply` puede fallar); sin `deployment_circuit_breaker` en ECS; ALB sólo HTTP 80 con frontend HTTPS (mixed content); lockfiles con un solo hash de plataforma.

## 6. Calidad transversal: tipado, lint, logging

- **Sin type-checker en Python.** No hay mypy ni pyright en `pyproject.toml` ni en CI. Con `Mapped[]` en los modelos (1.4) y `Protocol` en `ai_api`, `pyright --strict` sobre `libs/` y `services/` es viable y detectaría, por ejemplo, la firma incompatible de `EntityNotFound` o el `dict` sin tipo de `TripGateway`.
- **Ruff mínimo.** `select = ["E4", "E7", "E9", "F"]` (`src/backend/pyproject.toml`). Añadir `I` (imports), `UP` (moderniza `Optional` → `| None`), `B` (bugbear), `SIM`, `N`, `RUF`, `ASYNC` y `S` (bandit: habría marcado los f-strings SQL de `conftest.py`). Aplicar la misma configuración al scraper y a `scripts/`.
- **Logging.** Ningún servicio configura `logging`; el scraper usa `print`. Una función `configure_logging()` en `travel_common` y `LOG_LEVEL` en settings.
- **Frontend.** Reglas ESLint que codifiquen las normas del proyecto (3.5), `noUncheckedIndexedAccess`, `tailwind-merge` en las primitivas.

---

## 7. Plan de ataque sugerido

Ordenado por relación valor/riesgo. Cada bloque cabe en un PR y las reglas del proyecto exigen ADR cuando cambia estructura o contrato.

| Orden | Trabajo | Hallazgos | ADR |
|---|---|---|---|
| 1 | Propiedad de entidades hijas: rutas anidadas bajo `/trips/{trip_id}`, `get_owned_trip`, `/users/{id}` sólo admin, tests por entidad. Regenerar contratos. | 1.1 | Sí (cambia rutas) |
| 2 | Fábrica `child_router` + `Page` + `partial()`; eliminar servicios/repositorios vacíos y re-exports. | 1.2, 1.5 | No |
| 3 | Unidad de trabajo en `get_db`; `Mapped[]` + mixins + enums; migración verificada con `alembic check`. | 1.3, 1.4 | No |
| 4 | `get_settings` inyectado en `core_api`; `GoogleSignIn` como caso de uso con `GoogleTokenVerifier`; test de `/auth/google`. | 1.6 | No |
| 5 | Frontend: `toTrip` mapper, mocks en forma `TripResponse`, tipos discriminados, arreglar mock europeo. | 3.1 | Sí (estrategia `/trip/[id]`) |
| 6 | Frontend: `services/session.ts`, `loginWithGoogle`, `AuthContext` delgado, validar `redirect`. | 3.2 | No |
| 7 | Frontend: `LANGUAGES` + `locale` + `useFormatters`, claves i18n faltantes/muertas, `t.status`. | 3.4 | No |
| 8 | Frontend: descomponer `Header` y `PlannerCard`; route groups; borrar código muerto; tests de servicios; reglas ESLint. | 3.3, 3.5 | No |
| 9 | Limpieza de env vars + test `.env.example` ↔ `Settings`; Postgres 16 en infra; `.python-version`/`.nvmrc`. | 5.1, 5.3 | No |
| 10 | Job `infra` en CI, `setup-frontend`, `_build-image.yml`, región desde `vars`, `just` en CI, shell de Windows. | 5.4, 5.5 | No |
| 11 | `ai_api`: provider en `lifespan`, mensaje de error genérico al cliente, parámetros de generación en settings, `ChatRole`. | 2 | No |
| 12 | Scraper: `matching`/`io` + tests → `HttpClient`/`ScraperSettings` → modelos `Place`/`Dataset` → `Source`/`Domain` + `argparse` → YAML por ciudad. | 4 | Sí (`0005-scraper-pipeline`) |
| 13 | Ruff ampliado + pyright en CI; `configure_logging`. | 6 | No |
