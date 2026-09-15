# Runbook — Frontend Manual en AWS (S3 + CloudFront + Route 53)

Este documento detalla el despliegue manual del frontend estático de Travel AI World en AWS, realizado el 15 de septiembre de 2026. Para la versión automatizada con Terraform, ver [`infra/aws/frontend.tf`](../../infra/aws/frontend.tf).

## Arquitectura resultante

```text
Usuario → Route 53 (kyrian-world.com) → CloudFront (HTTPS) → S3 (privado, OAC)
                ↓
         ACM Certificate (us-east-1)
```

## Recursos creados

| Recurso | Nombre/ID | Región | Estado |
|:---|:---|:---|:---|
| ACM Certificate | `kyrian-world.com` + `*.kyrian-world.com` | us-east-1 | ✅ Emitido |
| CloudFront Distribution | `d30ecrvgx9jgud.cloudfront.net` | Global | ✅ Enabled |
| S3 Bucket | `kyrian-world.com` | eu-west-1 | ✅ Configurado |
| Route 53 Hosted Zone | `kyrian-world.com` | Global | ✅ Activa |

---

## Paso 1: Solicitar Certificado SSL en ACM

**Importante:** El certificado debe solicitarse en `us-east-1` (N. Virginia) para ser compatible con CloudFront.

1. Ir a **AWS Certificate Manager (ACM)** en la consola.
2. Cambiar región a **US East (N. Virginia) `us-east-1`**.
3. **Request certificate** → **Request a public certificate**.
4. **Fully qualified domain name:**
   - `kyrian-world.com`
   - `*.kyrian-world.com` (o `www.kyrian-world.com`)
5. **Validation method:** DNS validation.
6. **Request** → Entrar al certificado → **Create records in Route 53**.
7. Esperar a que el estado cambie a **Issued** (2-10 minutos).

---

## Paso 2: Verificar/Crear Bucket S3

1. Ir a **S3** → Crear bucket (si no existe):
   - **Bucket name:** `kyrian-world.com`
   - **Object Ownership:** ACLs disabled
   - **Block all public access:** ✅ Activado
2. Subir el contenido de `src/frontend/out/` (debe haber `index.html` en la raíz).

---

## Paso 3: Crear Distribución CloudFront

1. Ir a **CloudFront** → **Create distribution**.
2. Seleccionar **Free plan (0$)**.
3. Configuración inicial:
   - **Distribution name:** `kyrian-world.com-frontend`
   - **Description:** Travel AI World Frontend
   - **Distribution type:** Single website configuration
   - **Domain:** Dejar vacío (configurar manualmente después)
4. **Origin:**
   - **Origin domain:** Seleccionar bucket `kyrian-world.com.s3.eu-west-1.amazonaws.com`
   - **Origin access:** Origin access control settings (recommended) → **Create new OAC** → Sign requests (recommended)
5. **Settings:**
   - **Price class:** Use all edge locations (o solo N. America/Europe para ahorrar)
   - **Default root object:** `index.html`
   - **Alternate domain name (CNAME):** `kyrian-world.com`
   - **Custom SSL certificate:** Seleccionar el certificado ACM de `kyrian-world.com`
   - **Security policy:** `TLSv1.2_2021 (recommended)`
6. **Create distribution**.

---

## Paso 4: Configurar Behaviors (Comportamientos)

1. En la distribución, ir a pestaña **Behaviors**.
2. Seleccionar `Default (*)` → **Edit**.
3. **Viewer protocol policy:** **Redirect HTTP to HTTPS**.
4. **Allowed HTTP methods:** `GET, HEAD`.
5. **Save changes**.

---

## Paso 5: Configurar Error Pages (SPA Routing)

Next.js exporta estáticamente; las rutas internas devuelven 404/403 si se recargan.

1. Pestaña **Error pages** → **Create custom error response**.
2. Configuración 403:
   - **HTTP error code:** `403: Forbidden`
   - **Customize error response:** Yes
   - **Response page path:** `/index.html`
   - **HTTP response code:** `200: OK`
3. Configuración 404 (igual):
   - **HTTP error code:** `404: Not Found`
   - **Customize error response:** Yes
   - **Response page path:** `/index.html`
   - **HTTP response code:** `200: OK`

---

## Paso 6: Aplicar Política de Bucket (OAC)

CloudFront genera automáticamente la política. Verificar que existe en S3:

1. Ir a **S3** → Bucket `kyrian-world.com` → **Permissions** → **Bucket policy**.
2. Debe contener una política con:

   ```json
   {
     "Effect": "Allow",
     "Principal": { "Service": "cloudfront.amazonaws.com" },
     "Action": "s3:GetObject",
     "Resource": "arn:aws:s3:::kyrian-world.com/*",
     "Condition": {
       "ArnLike": {
         "AWS:SourceArn": "arn:aws:cloudfront::745600963688:distribution/E1XBRW2S81XUZ2"
       }
     }
   }
   ```

3. (Opcional) Activar **Block all public access** en el bucket.

---

## Paso 7: Configurar Route 53

1. Ir a **Route 53** → **Hosted zones** → `kyrian-world.com`.
2. Si existe un registro A antiguo apuntando a S3 (`s3-website-...`), **eliminarlo**.
3. **Create record**:
   - **Record name:** Dejar vacío (dominio raíz)
   - **Record type:** `A - Routes traffic to an IPv4 address and some AWS resources`
   - **Alias:** ✅ Activado
   - **Route traffic to:** **Alias to CloudFront distribution** → Seleccionar `d30ecrvgx9jgud.cloudfront.net`
   - **Create records**
4. (Opcional) Crear registro `AAAA` idéntico para IPv6.

---

## Verificación

```bash
# Comprobar que el DNS resuelve a CloudFront (no a S3)
nslookup kyrian-world.com

# Debe devolver IPs de CloudFront (13.224.x.x, 99.84.x.x, etc.)
```

**Prueba en navegador:**

- `http://kyrian-world.com` → Redirige a `https://kyrian-world.com` ✅
- Candado SSL válido ✅
- Carga la aplicación Travel AI World ✅

---

## Configuraciones cruzadas pendientes (Backend)

| Tarea | Descripción |
|:---|:---|
| `NEXT_PUBLIC_API_URL` | Rebuild frontend con URL del backend (ALB/API Gateway) |
| CORS Backend | Añadir `https://kyrian-world.com` a `BACKEND_CORS_ORIGINS` |
| Google OAuth | Añadir `https://kyrian-world.com` a orígenes autorizados |

---

## Notas

- **Coste estimado:** ~0$ (CloudFront Free Tier: 1 TB + 10M peticiones/mes por 12 meses).
- **Propagación DNS:** Inmediata en Route 53; global puede tardar hasta 48h (normalmente minutos).
- **Invalidación de caché:** Si se actualiza el frontend, crear invalidación en CloudFront para `/*`.
