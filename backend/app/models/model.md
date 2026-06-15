# 🇬🇧 English

## Database Models (`app/models/`)

This directory contains the SQLAlchemy models that define the strict schema of our PostgreSQL database. Every file here represents a table (or highly related tables) and their direct relationships. 

### Core Concepts & Logic

1. **`Base` (`base.py`)**: 
   - All models must inherit from this declarative base. 
   - This ensures that Alembic and SQLAlchemy can discover every table in a centralized registry (`Base.metadata`).

2. **Primary Keys (`id`)**:
   - `User` uses standard `Integer` auto-incrementing IDs because it's the core system entity. It includes Google OAuth fields (`auth_provider`, `google_id`, `name`, `picture`) — there is no `hashed_password` column since authentication is exclusively via Google.
   - All travel-related entities (`Trip`, `Destination`, `ItineraryDay`, etc.) use `UUID`s. This perfectly matches the frontend TypeScript interfaces (`id: string`), obfuscates URLs, and facilitates offline creation or merging of records.

3. **Entity Relationships**:
   - **`User` ↔ `Trip` (1:N)**: A user owns many trips. Handled via `ForeignKey("users.id")` in `Trip`. If a User is deleted, their Trips are `CASCADE` deleted.
   - **`Trip` ↔ `Destination` (1:N)**: A trip contains multiple destinations (e.g., "Eurotrip: Paris, Rome").
   - **`Trip` ↔ `ItineraryDay` (1:N)**: A trip has a structured day-by-day plan.
   - **`Destination` ↔ `ItineraryDay` (1:N)**: A specific day in the itinerary usually belongs to one destination (though it can be null if it's a travel day without a fixed destination yet).
   - **`ItineraryDay` ↔ `Activity` & `Meal` (1:N)**: A single day contains a list of activities and meals. Deleting a day automatically deletes its linked activities and meals (`CASCADE`).
   - **`Trip` ↔ `Accommodation` & `Transportation` (1:N)**: Bookings and transport are generally tied to the entire trip context rather than a specific day.

4. **Inline Columns vs. New Tables**:
   - Entities like `Budget`, `Travelers`, and `AIInsights` are defined as inline columns in the `Trip` table (e.g., `budget_total`, `travelers_adults`, `ai_local_tips`). Since they have a strict 1-to-1 relationship with a Trip, separating them into different tables would only add unnecessary `JOIN` overhead.
   - Arrays and lists (like `accommodation.amenities` or `trip.travel_style`) use PostgreSQL's native `ARRAY` type. Flexible/unstructured data (like `ai_local_tips`) uses the `JSON` type.

5. **`__init__.py`**:
   - Acts as the central hub. It imports all individual model files so that they are registered in memory. When Alembic runs, it just imports `app.models`, discovering the entire database schema at once.

---

# 🇪🇸 Español

## Modelos de Base de Datos (`app/models/`)

Este directorio contiene los modelos de SQLAlchemy que definen el esquema estricto de nuestra base de datos PostgreSQL. Cada archivo aquí representa una tabla (o tablas estrechamente relacionadas) y sus relaciones directas.

### Conceptos Centrales y Lógica

1. **`Base` (`base.py`)**: 
   - Todos los modelos deben heredar de esta base declarativa. 
   - Esto asegura que Alembic y SQLAlchemy puedan descubrir cada tabla en un registro centralizado (`Base.metadata`).

2. **Claves Primarias (`id`)**:
   - `User` usa `Integer` auto-incremental estándar porque es la entidad base del sistema. Incluye campos de Google OAuth (`auth_provider`, `google_id`, `name`, `picture`) — no existe columna `hashed_password` ya que la autenticación es exclusivamente vía Google.
   - Todas las entidades relacionadas con los viajes (`Trip`, `Destination`, `ItineraryDay`, etc.) usan `UUID`s. Esto concuerda perfectamente con las interfaces de TypeScript del frontend (`id: string`), ofusca las URLs y facilita la creación offline de registros.

3. **Relaciones entre Entidades**:
   - **`User` ↔ `Trip` (1:N)**: Un usuario posee muchos viajes. Se maneja mediante `ForeignKey("users.id")` en `Trip`. Si se elimina un usuario, sus viajes se borran en cascada (`CASCADE`).
   - **`Trip` ↔ `Destination` (1:N)**: Un viaje contiene múltiples destinos (ej. "Eurotrip: París, Roma").
   - **`Trip` ↔ `ItineraryDay` (1:N)**: Un viaje tiene un plan estructurado día a día.
   - **`Destination` ↔ `ItineraryDay` (1:N)**: Un día específico en el itinerario pertenece generalmente a un destino (aunque puede ser nulo si es un día de viaje sin un destino fijo aún).
   - **`ItineraryDay` ↔ `Activity` & `Meal` (1:N)**: Un solo día contiene una lista de actividades y comidas. Eliminar un día elimina automáticamente sus actividades y comidas vinculadas (`CASCADE`).
   - **`Trip` ↔ `Accommodation` & `Transportation` (1:N)**: Los alojamientos y el transporte están vinculados al contexto del viaje completo en lugar de a un día específico.

4. **Columnas en línea vs. Nuevas Tablas**:
   - Entidades como `Budget`, `Travelers` y `AIInsights` se definen como columnas integradas (inline) en la tabla `trips` (ej. `budget_total`, `travelers_adults`, `ai_local_tips`). Dado que tienen una relación estricta 1-a-1 con un Viaje, separarlas en otras tablas solo añadiría sobrecarga innecesaria de `JOIN`s en consultas SQL.
   - Los arrays y listas (como `accommodation.amenities` o `trip.travel_style`) usan el tipo `ARRAY` nativo de PostgreSQL. Datos flexibles/no estructurados (como `ai_local_tips`) usan el tipo `JSON`.

5. **`__init__.py`**:
   - Actúa como el centro neurálgico. Importa todos los archivos de modelos individuales para que se registren en memoria. Cuando Alembic se ejecuta, simplemente importa `app.models`, descubriendo todo el esquema de la base de datos de una sola vez.
