# Infraestructura Terraform para AWS

![Terraform](https://img.shields.io/badge/Terraform-1.6%2B-7B42BC?style=for-the-badge&logo=terraform&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-Cloud-232F3E?style=for-the-badge&logo=amazonaws&logoColor=white)
![ECS](https://img.shields.io/badge/ECS-Fargate-FF9900?style=for-the-badge&logo=amazonecs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-316192?style=for-the-badge&logo=postgresql&logoColor=white)

Esta carpeta contiene una infraestructura alternativa para ejecutar el backend de Travel AI World en **Amazon Web Services (AWS)**.

La infraestructura GCP equivalente está en `infra_terraform_gcp/`. Ambas carpetas son alternativas: el equipo debe elegir una plataforma y aplicar solamente su configuración.

## Qué crea Terraform

- Una VPC con subredes públicas para el balanceador y ECS.
- Subredes privadas para RDS PostgreSQL.
- Internet Gateway y rutas públicas.
- Amazon ECR para almacenar la imagen Docker del backend.
- Amazon RDS PostgreSQL 15, privado y cifrado.
- AWS Secrets Manager para las credenciales de la aplicación.
- ECS Fargate para ejecutar FastAPI.
- Application Load Balancer HTTP para publicar el backend.
- Security Groups para limitar el tráfico entre ALB, ECS y RDS.
- CloudWatch Logs para los logs del backend.

El backend se ejecuta en el puerto `8000`, el mismo puerto configurado en `backend/Dockerfile` y `backend/entrypoint.sh`.

## Qué no crea todavía

El frontend de Next.js usa exportación estática (`output: "export"`). Debe publicarse aparte, por ejemplo en S3 + CloudFront, AWS Amplify o Firebase Hosting.

Terraform tampoco construye automáticamente la imagen Docker. Primero crea ECR, después se construye y sube la imagen, y finalmente se aplica el resto de la infraestructura.

## Requisitos

- Cuenta AWS con permisos para VPC, ECS, ECR, RDS, ALB, IAM, Secrets Manager y CloudWatch.
- AWS CLI configurado.
- Terraform >= 1.6.
- Docker.

Configura tus credenciales mediante AWS CLI, perfil de usuario o variables de entorno. No escribas access keys en archivos Terraform.

```bash
aws configure
aws sts get-caller-identity
```

## Configuración local

Desde la raíz del proyecto:

```bash
cd infra_terraform_aws
cp terraform.tfvars.example terraform.tfvars
```

Edita `terraform.tfvars` con los valores reales:

```hcl
region        = "eu-west-1"
name_prefix   = "travel-ai"
backend_image = "123456789012.dkr.ecr.eu-west-1.amazonaws.com/travel-ai-backend:latest"

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

### 1. Inicializar y validar Terraform

```bash
cd infra_terraform_aws
terraform init
terraform fmt
terraform validate
```

### 2. Crear solamente ECR

```bash
terraform apply -target=aws_ecr_repository.backend
```

El repositorio creado se llamará `travel-ai-backend` si se mantiene el `name_prefix` predeterminado.

### 3. Autenticar Docker contra ECR

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(terraform output -raw aws_region 2>/dev/null || true)
AWS_REGION=${AWS_REGION:-eu-west-1}

aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin \
  "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
```

Si el output `aws_region` todavía no existe, el comando usa `eu-west-1`; comprueba que coincide con `region` en `terraform.tfvars`.

### 4. Construir la imagen del backend

Ejecuta desde la raíz del repositorio:

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=eu-west-1
ECR_IMAGE="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/travel-ai-backend:latest"

docker build -t "$ECR_IMAGE" ./backend
docker push "$ECR_IMAGE"
```

Actualiza `backend_image` en `terraform.tfvars` para que coincida exactamente con `$ECR_IMAGE`.

### 5. Crear el resto de la infraestructura

```bash
cd infra_terraform_aws
terraform plan
terraform apply
```

Terraform creará RDS, ECS, el ALB, los secretos y las reglas de red. El `entrypoint.sh` ejecutará las migraciones de Alembic antes de iniciar FastAPI.

Consulta la URL pública del backend:

```bash
terraform output -raw backend_url
```

Para producción, configura HTTPS con un certificado ACM y un listener HTTPS en el ALB antes de publicar el dominio.

## Frontend

Construye el frontend con la URL pública del ALB o, preferiblemente, con el dominio HTTPS del backend:

```bash
cd frontend
export NEXT_PUBLIC_API_URL="https://api.tu-dominio.com"
npm install
npm run build
```

El resultado queda en `frontend/out/`. Puedes publicarlo con S3 + CloudFront, Amplify o el servicio de hosting elegido.

Configura en IONOS el DNS del dominio para apuntar `api.tu-dominio.com` al ALB, y actualiza Google OAuth con los dominios reales.

## Secretos y estado Terraform

Las variables sensibles están marcadas como `sensitive`, pero Terraform puede almacenarlas en el estado porque crea las versiones de Secrets Manager desde variables Terraform.

- No subas `terraform.tfvars`.
- No subas `*.tfstate`.
- No compartas el estado local.
- Para trabajo en equipo, configura un backend remoto S3 con bloqueo mediante DynamoDB o el mecanismo recomendado por la versión de Terraform utilizada.
- Secrets Manager es el mecanismo de lectura de secretos por ECS en tiempo de ejecución.

El archivo `.terraform.lock.hcl` debe conservarse y puede subirse al repositorio.

## Costes y seguridad

RDS y ECS Fargate generan costes mientras están activos. Durante pruebas limita `desired_count` y elimina los recursos al terminar, con autorización del equipo.

La configuración inicial usa ECS en subredes públicas con IP pública para simplificar la salida hacia NVIDIA. El acceso de entrada al backend queda restringido al ALB mediante Security Groups, pero para producción se recomienda mover ECS a subredes privadas y añadir NAT Gateway, o usar una arquitectura equivalente aprobada por el equipo.

## Comandos habituales

```bash
terraform fmt
terraform validate
terraform plan
terraform apply
terraform output
```

No ejecutes `terraform destroy` en una cuenta compartida sin autorización.
