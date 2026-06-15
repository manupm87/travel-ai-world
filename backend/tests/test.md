# 🇬🇧 English

## Test Setup (`tests/`)

This Template includes a robust test suite using **Pytest** and **Pytest-Asyncio**.

### Test Environment

The test suite uses a **dedicated PostgreSQL test database** (not in-memory SQLite). The `conftest.py` automatically creates and manages it:

1. **Dedicated Test DB**: Tests connect to `<DB_NAME>_test` (derived from your `.env` `DB_NAME`). The database is created automatically if it doesn't exist.
2. **Automated Setup and Teardown**: Before each session, `Base.metadata.drop_all` + `create_all` is called — guaranteeing a pristine schema on every test run, then cleaned up after.
3. **Dependency Override**: The FastAPI `get_db` dependency is overridden per test via `app.dependency_overrides`, isolating tests from the main database.

### Useful Commands

The CI/CD pipeline is ready to reject unstable code. Verify your code beforehand with these quick commands:

#### Run all Tests

```bash
uv run pytest -v
```

#### Check Coverage

To know exactly which lines of your code are **NOT** being executed by the tests, run:

```bash
uv run pytest -v --cov=app --cov-report=term-missing
```

This will print a table indicating which files lack tests and precisely on which lines.

#### Run Specific Tests

Focus on a single test to save time during development:

```bash
uv run pytest tests/api/test_users.py::test_create_user -v
```

---

### Writing New Tests

When adding new features, follow the general pattern:

1. Create a new file in `tests/api/` with the prefix `test_*.py`.
2. Test functions must start with `test_` and must be async (`async def test_create_item()`) thanks to the config in `pyproject.toml` (`asyncio_mode = "auto"`).
3. Use the `client: AsyncClient` fixture as a dependency in your test functions to properly emulate API calls.

---

# 🇪🇸 Español

## Configuración de Tests (`tests/`)

Este Template incluye una suite de pruebas robusta usando **Pytest** y **Pytest-Asyncio**.

### Entorno de Pruebas

La suite de tests usa una **base de datos PostgreSQL dedicada** (no SQLite en memoria). El `conftest.py` la crea y gestiona automáticamente:

1. **BD de Pruebas Dedicada**: Los tests se conectan a `<DB_NAME>_test` (derivado del `DB_NAME` de tu `.env`). La base de datos se crea automáticamente si no existe.
2. **Setup y Teardown Automatizado**: Antes de cada sesión, se ejecuta `Base.metadata.drop_all` + `create_all` — garantizando un esquema limpio en cada ejecución, y eliminado al terminar.
3. **Sobreescritura de Dependencia**: La dependencia FastAPI `get_db` es sobrescrita por test vía `app.dependency_overrides`, aislando los tests de la base de datos principal.

### Comandos Útiles

El pipeline de CI/CD está preparado para rechazar código inestable. Verifica tu código antes con estos comandos rápidos:

#### Correr todos los Tests

```bash
uv run pytest -v
```

#### Comprobar la Cobertura (Coverage)

Para saber qué líneas específicas de tu código **NO** están siendo ejecutadas por los tests, corre:

```bash
uv run pytest -v --cov=app --cov-report=term-missing
```

Esto imprimirá una tabla indicando qué archivos carecen de tests y en qué números de línea específicos.

#### Correr Tests Específicos

Enfocarte de un solo test para ahorrar tiempo mientras desarrollas:

```bash
uv run pytest tests/api/test_users.py::test_create_user -v
```

---

### Escribiendo Nuevos Tests

Al añadir nuevas funcionalidades, sigue el patrón general:

1. Crea un nuevo archivo en `tests/api/` con el prefijo `test_*.py`.
2. Las funciones de test deben empezar por `test_` y deben ser asíncronas (`async def test_crear_item()`) gracias a la configuración en `pyproject.toml` (`asyncio_mode = "auto"`).
3. Utiliza la fixture `client: AsyncClient` como dependencia en tus funciones de test para emular llamadas a la API limpiamente.
