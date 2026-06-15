# 🇬🇧 English

## Main Application (`app/`)

This is the core of the project. The architectural design follows a strict **N-Tier Layered Architecture** to ensure scalability, decoupling, and efficient maintenance.

If you use AI tools (identified in `.claude/`), they are instructed to strictly respect this flow.

### Directory Structure

```text
app/
├── api/          # Controllers (Routers). Receive the HTTP request and return responses.
├── core/         # Core configuration and utilities: Env Settings, Custom Exceptions, and Security.
├── db/           # Async database connection and session management setup via asyncpg.
├── models/       # SQLAlchemy Tables. These define the actual DB schema.
├── repositories/ # Repository Pattern. ABSOLUTELY ALL logic interacting with SQL/asyncpg lives here.
├── schemas/      # Pydantic Models. Validate incoming (Requests) and outgoing (Responses) data, ensuring Type Safety.
└── services/     # Business Logic. Bridge Schemas and Repositories. Verify rules, throw `core/` exceptions.
```

### Dependency Injection and Architecture Rules

To keep the code testable and clean, follow the lifecycle of a request:

1. **`api/`**: The FastAPI endpoint.
   - It **MUST NOT** contain business logic or DB queries.
   - It only receives the validated payload (Schema), injects the `Service` via `Depends()`, calls the `Service`, and returns the output Schema.
2. **`services/`**: The business manager.
   - Receives the already instantiated `Repository` class and the database session (`AsyncSession`).
   - Verifies if a user exists, validates Google tokens, checks logical permissions, and calls the `Repository`.
   - Throws exceptions if the logic fails (`raise UserNotFoundError`).
3. **`repositories/`**: The data layer.
   - Raw classes that perform `.add()`, `.commit()`, `select()`.
   - They **DO NOT** import Pydantic schemas; they solely work with SQLAlchemy `models/`.
4. **`schemas/`**: The Pydantic models.
   - Classes that define the structure of the data entering and leaving the API.
   - They **MUST NOT** contain business logic or DB queries.
5. **`models/`**: The SQLAlchemy tables.
   - Classes that define the structure of the database tables.
   - They **MUST NOT** contain business logic or DB queries.
6. **`db/`**: The database configuration.
   - Classes that handle async connections and sessions using `asyncpg` and SQLAlchemy.
7. **`core/`**: The configuration and utilities core.
   - Contains Environment Settings (`config.py`), Custom Exceptions (`exceptions.py`), and Security (`security.py`).
   - `config.py` exposes `BACKEND_CORS_ORIGINS` (list of allowed frontend origins) alongside JWT/DB settings, Google OAuth credentials, and NVIDIA AI configuration.
   - **Authentication `Dependables` and RBAC** (`get_current_user`, `get_current_admin_user`, `get_user_service`) live in **`api/deps.py`**, not here.

---

# 🇪🇸 Español

## Aplicación Principal (`app/`)

Este es el corazón del proyecto. El diseño arquitectónico sigue una estricta **Arquitectura de Capas N-Tier** para asegurar escalabilidad, desacoplamiento y un mantenimiento eficiente.

Si usas herramientas de IA (identificadas en `.claude/`), están instruidas para respetar exactamente este flujo.

### Estructura de Directorios

```text
app/
├── api/          # Controladores (Routers). Reciben la request HTTP y devuelven respuestas.
├── core/         # Configuraciones vitales: Variables de entorno, Config de Seguridad (JWT), Excepciones personalizadas.
├── db/           # Configuración de inicialización de la base de datos asíncrona (Sessions).
├── models/       # Tablas de SQLAlchemy. Estas definen la DB real.
├── repositories/ # Patrón Repositorio. Aquí vive ABSOLUTAMENTE TODA la lógica que interactúa con SQL/asyncpg.
├── schemas/      # Modelos de Pydantic. Validan lo que entra (Requests) y lo que sale (Responses) garantizando Type Safety.
└── services/     # Lógica de Negocio. Unen Schemas y Repositorios. Verifican reglas, lanzan excepciones de `core/`.
```

### Reglas de Inyección de Dependencias y Arquitectura

Para mantener el código testeable y limpio, sigue el siguiente flujo de vida de una petición (Request Lifecycle):

1. **`api/`**: El endpoint en FastAPI.
   - **NO** debe contener lógica de negocio ni consultas a DB.
   - Solo recibe el payload validado (Schema), inyecta el `Service` vía `Depends()`, llama al `Service`, y retorna el Schema de salida.
2. **`services/`**: El gestor de negocio.
   - Recibe la clase `Repository` ya instanciada y la sesión de base de datos (`AsyncSession`).
   - Verifica si un usuario existe, valida tokens de Google, comprueba permisos lógicos y llama al `Repository`.
   - Lanza excepciones si la lógica falla (`raise UserNotFoundError`).
3. **`repositories/`**: La capa de datos.
   - Son clases crudas que hacen `.add()`, `.commit()`, `select()`.
   - **NO** importan schemas de Pydantic, solo trabajan con los `models/` de SQLAlchemy.
4. **`schemas/`**: Los modelos de Pydantic.
   - Son clases que definen la estructura de los datos que entran y salen de la API.
   - **NO** deben contener lógica de negocio ni consultas a DB.
5. **`models/`**: Las tablas de SQLAlchemy.
   - Son clases que definen la estructura de las tablas de la base de datos.
   - **NO** deben contener lógica de negocio ni consultas a DB.
6. **`db/`**: La configuración de la base de datos.
   - Son clases que manejan la conexión y sesión asíncrona mediante `asyncpg` y SQLAlchemy.
7. **`core/`**: El núcleo de configuración y utilidades.
   - Contiene los Ajustes de Entorno (`config.py`), Excepciones personalizadas (`exceptions.py`) y la Seguridad (`security.py`).
   - `config.py` expone `BACKEND_CORS_ORIGINS` (lista de orígenes permitidos) junto a la configuración de JWT, base de datos, credenciales de Google OAuth y configuración de NVIDIA AI.
   - Los **`Dependables` de autenticación y RBAC** (`get_current_user`, `get_current_admin_user`, `get_user_service`) viven en **`api/deps.py`**, no aquí.
