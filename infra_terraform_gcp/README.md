# Infraestructura Terraform para Travel AI World

![Terraform](https://img.shields.io/badge/Terraform-1.6%2B-7B42BC?style=for-the-badge&logo=terraform&logoColor=white)
![Google Cloud](https://img.shields.io/badge/Google%20Cloud-GCP-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)
![Cloud Run](https://img.shields.io/badge/Cloud%20Run-Serverless-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-316192?style=for-the-badge&logo=postgresql&logoColor=white)

Esta carpeta contiene la infraestructura de **Google Cloud Platform (GCP)** para ejecutar el backend de Travel AI World.

La configuración está pensada para separar la infraestructura de producción del `.devcontainer`, que solo se utiliza para desarrollo local.

## Qué crea Terraform

- APIs de GCP necesarias.
- Una VPC con acceso privado a servicios gestionados.
- Una subred y un Serverless VPC Access Connector para Cloud Run.
- Una instancia privada de Cloud SQL PostgreSQL 15.
- La base de datos y el usuario de la aplicación.
- Un repositorio Docker en Artifact Registry.
- Secretos en Secret Manager:
  - `NVIDIA_API_KEY`
  - `SECRET_KEY`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `DB_PASSWORD`
- Una cuenta de servicio para el backend.
- Un servicio Cloud Run para FastAPI.
- Permisos para que Cloud Run lea los secretos.
- Acceso público al endpoint de Cloud Run.

El backend se conecta a Cloud SQL mediante la IP privada de la instancia y el VPC Access Connector.

## Qué no crea todavía

El frontend de Next.js utiliza exportación estática (`output: "export"`). Su publicación se hará aparte, por ejemplo mediante Firebase Hosting o Cloud Storage + CDN.

Terraform tampoco construye automáticamente la imagen Docker del backend. Primero se crea el repositorio de Artifact Registry, después se construye y se sube la imagen, y finalmente se crea o actualiza Cloud Run con esa imagen.

## Requisitos

Instala o configura:

- Una cuenta de Google Cloud con un proyecto activo.
- Facturación habilitada en ese proyecto.
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install).
- Terraform >= 1.6.
- Docker.
- Permisos suficientes para crear recursos de GCP.

La cuenta debe poder crear, como mínimo, recursos de Cloud Run, Cloud SQL, VPC, Artifact Registry, Secret Manager y cuentas de servicio.

## Autenticación inicial

Ejecuta estos comandos una vez en tu equipo:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project TU_PROJECT_ID
```

`application-default login` permite que el proveedor de Terraform utilice tus credenciales locales.

## Configuración local

Desde esta carpeta:

```bash
cd infra_terraform_gcp
cp terraform.tfvars.example terraform.tfvars
```

Edita `terraform.tfvars` y sustituye todos los valores de ejemplo:

```hcl
project_id    = "tu-project-id"
region        = "europe-west1"
zone          = "europe-west1-b"
name_prefix   = "travel-ai"
backend_image = "europe-west1-docker.pkg.dev/tu-project-id/travel-ai-images/backend:latest"

db_password          = "una-password-segura"
nvidia_api_key       = "tu-api-key-de-nvidia"
secret_key           = "una-clave-jwt-segura"
google_client_id     = "tu-client-id.apps.googleusercontent.com"
google_client_secret = "tu-client-secret"

frontend_url         = "https://www.tu-dominio.com"
backend_cors_origins = "[\"https://www.tu-dominio.com\"]"
```

`terraform.tfvars` está excluido por `.gitignore`. No debe subirse al repositorio.

## Despliegue inicial

### 1. Inicializar Terraform

```bash
cd infra_terraform_gcp
terraform init
terraform validate
terraform plan
```

`plan` todavía puede mostrar que Cloud Run necesita una imagen existente. Por eso el primer despliegue se hace en dos fases.

### 2. Crear solamente Artifact Registry

El nombre del repositorio será `${name_prefix}-images`.

```bash
terraform apply -target=google_artifact_registry_repository.backend
```

Confirma la operación cuando Terraform lo solicite.

### 3. Autenticar Docker contra Artifact Registry

Usa la misma región configurada en `terraform.tfvars`:

```bash
gcloud auth configure-docker europe-west1-docker.pkg.dev
```

Si utilizas otra región, reemplaza `europe-west1` en el comando.

### 4. Construir la imagen del backend

Ejecuta el comando desde la raíz del repositorio:

```bash
docker build \
  -t europe-west1-docker.pkg.dev/TU_PROJECT_ID/travel-ai-images/backend:latest \
  ./backend
```

El `Dockerfile` del backend ya contiene las dependencias, las migraciones de Alembic y el arranque de Uvicorn.

### 5. Subir la imagen

```bash
docker push \
  europe-west1-docker.pkg.dev/TU_PROJECT_ID/travel-ai-images/backend:latest
```

Asegúrate de que la variable `backend_image` de `terraform.tfvars` coincide exactamente con esa imagen.

### 6. Crear el resto de la infraestructura

Desde `infra_terraform_gcp`:

```bash
terraform plan
terraform apply
```

Terraform creará Cloud SQL, la red privada, Secret Manager y Cloud Run. El `entrypoint.sh` del backend ejecutará las migraciones de Alembic antes de iniciar FastAPI.

Al finalizar, consulta la URL de Cloud Run:

```bash
terraform output -raw cloud_run_url
```

## Frontend

Construye el frontend usando la URL pública del backend. Durante el desarrollo inicial puedes utilizar la URL de Cloud Run:

```bash
cd frontend
export NEXT_PUBLIC_API_URL="$(cd ../infra_terraform_gcp && terraform output -raw cloud_run_url)"
npm install
npm run build
```

El resultado estático queda en `frontend/out/`. Después debe publicarse mediante Firebase Hosting o el servicio de hosting/CDN elegido.

Cuando el backend tenga un dominio definitivo, por ejemplo `https://api.tu-dominio.com`, usa ese valor en `NEXT_PUBLIC_API_URL` y vuelve a construir el frontend.

También debes configurar en Google OAuth los orígenes y redirecciones del dominio real, y mantener `frontend_url` y `backend_cors_origins` sincronizados con él.

## Secretos y estado Terraform

Aunque las variables sensibles están marcadas como `sensitive`, Terraform puede almacenar sus valores en el estado local porque crea las versiones de Secret Manager desde variables Terraform.

Por eso:

- No subas `terraform.tfvars`.
- No subas archivos `*.tfstate`.
- No compartas el estado local.
- Para trabajo en equipo, configura posteriormente un backend remoto de Terraform en un bucket GCS con acceso restringido y versionado.
- Usa Secret Manager para consumir los secretos desde Cloud Run; no los escribas en los archivos `.tf`.

El archivo `.terraform.lock.hcl` sí debe conservarse y puede subirse al repositorio.

## Comandos habituales

```bash
terraform fmt
terraform validate
terraform plan
terraform apply
terraform output
```

Para eliminar la infraestructura, primero revisa la protección de Cloud SQL. La variable `deletion_protection` está activada por defecto para evitar borrados accidentales.

```bash
terraform destroy
```

No ejecutes `destroy` en un proyecto compartido sin autorización del equipo.

## Arquitectura

```text
Usuarios
   |
   +-- Frontend estático publicado aparte
   |
   +-- Cloud Run (FastAPI)
          |
          +-- VPC Access Connector
          +-- Cloud SQL PostgreSQL privado
          +-- Secret Manager
          +-- NVIDIA API
```
