# 🇬🇧 English

## Database and Migrations with Alembic

This folder contains all the configuration and migration history of the database, managed through **Alembic**.

Since this template uses `SQLAlchemy 2.0` entirely asynchronously (`asyncpg`), Alembic is specifically configured in the `env.py` file to support *async* schemas.

### Migration Workflow

Every time you alter an SQLAlchemy model (for example, in `app/models/user.py` or when creating a new model), you must inform the database about these changes by creating a "migration".

#### 1. Generate a Migration Automatically
Alembic can compare your Python models (`Base.metadata`) with the current state of your PostgreSQL database.

To generate the migration files (which will appear in the `alembic/versions/` folder), run:

```bash
uv run alembic revision --autogenerate -m "Descriptive name of the change"
```
> **Note:** Always review the generated file in `versions/`! Autogenerate is smart, but sometimes it misses subtle changes like column renames.

#### 2. Apply Changes to the Database
Once the migration is verified, apply it to your local database:

```bash
uv run alembic upgrade head
```
*(The `head` command means you will apply all migrations until you reach the latest version).*

#### 3. Revert Changes (Rollback)
If you made a mistake or the migration broke something, you can revert to the previous version (going down one level):

```bash
uv run alembic downgrade -1
```

### Common Troubleshooting
- **`ConnectionDoesNotExistError`**: Occurs on Windows if the DB host is set to `localhost`. Change `DB_SERVER=127.0.0.1` in your `.env` file.
- **Target database is not up to date**: You are trying to generate a new revision but haven't applied the latest one (`upgrade head`).
- **Tables are not detected**: Ensure your model is imported in `app/models/__init__.py` (not `base.py`). Alembic's `env.py` imports that package with `import app.models` to register every table on `Base.metadata`.

---

# 🇪🇸 Español

## Base de Datos y Migraciones con Alembic

Esta carpeta contiene toda la configuración e historial de migraciones de la base de datos, gestionada a través de **Alembic**.

Dado que este template utiliza `SQLAlchemy 2.0` de forma completamente asíncrona (`asyncpg`), Alembic está configurado específicamente en el archivo `env.py` para soportar esquemas *async*.

### Flujo de Trabajo (Workflow) de Migraciones

Cada vez que alteres un modelo de SQLAlchemy (por ejemplo, en `app/models/user.py` o al crear un nuevo modelo), debes informarle a la base de datos sobre estos cambios creando una "migración".

#### 1. Generar una Migración Automáticamente
Alembic puede comparar tus modelos en Python (`Base.metadata`) con el estado actual de tu base de datos en PostgreSQL.

Para generar los archivos de migración (que aparecerán en la carpeta `alembic/versions/`), ejecuta:

```bash
uv run alembic revision --autogenerate -m "Nombre descriptivo del cambio"
```
> **Nota:** ¡Revisa siempre el archivo generado en `versions/`! Autogenerate es inteligente, pero a veces no detecta cambios sutiles como renombres de columnas.

#### 2. Aplicar los Cambios a la Base de Datos
Una vez verificada la migración, aplícala a tu base de datos local:

```bash
uv run alembic upgrade head
```
*(El comando `head` significa que aplicarás todas las migraciones hasta llegar a la versión más reciente).*

#### 3. Revertir Cambios (Rollback)
Si cometiste un error o la migración rompió algo, puedes volver a la versión anterior (bajando un nivel):

```bash
uv run alembic downgrade -1
```

### Solución de Problemas Comunes
- **`ConnectionDoesNotExistError`**: Ocurre en Windows si el host de DB está como `localhost`. Cambia `DB_SERVER=127.0.0.1` en tu archivo `.env`.
- **Target database is not up to date**: Intestas generar una nueva revisión pero no has aplicado la última (`upgrade head`).
- **No se detectan las tablas**: Asegúrate de que tu modelo esté importado en `app/models/__init__.py` (no en `base.py`). El `env.py` de Alembic importa ese paquete con `import app.models` para registrar cada tabla en `Base.metadata`.
