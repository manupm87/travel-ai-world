# Panel de servicio en CloudWatch

El dashboard nativo `travel-ai-service-metrics` complementa las métricas de negocio
de Grafana para la presentación. Su nombre usa `name_prefix`; el valor anterior
corresponde al prefijo predeterminado. Implementa la parte de métricas nativas de
TRA-297 y añade la sección Cognito de TRA-313: no añade middleware, métricas
personalizadas ni consultas de logs.

## Crear y abrir

El 2026-10-20 se creó manualmente `travel-ai-service-metrics` en la cuenta de
producción y se verificaron datos de Lambda y API Gateway en `eu-west-1`.
El dashboard ya está importado y gestionado en el estado remoto de Terraform.
No repetir la importación en ese estado ni crear un segundo dashboard con otro
nombre. Las ampliaciones requieren revisar y aplicar el plan.

El recurso está en `infra/aws/dashboard.tf`; su cuerpo está en
`infra/aws/metric/cloudwatch/service_metrics.json.tftpl`. Terraform obtiene los
nombres reales de las funciones y del stage, y las dimensiones de Cognito, de los
recursos existentes.

Desde `infra/aws`, con la sesión AWS y el backend de Terraform configurados según
el [runbook de infraestructura](../../infra/aws/README.md):

```bash
terraform plan -out=service-dashboard.tfplan
terraform show service-dashboard.tfplan
# Aplicar únicamente un plan revisado: no desplegar cambios ajenos al dashboard.
terraform apply service-dashboard.tfplan
terraform output -raw service_dashboard_url
```

En producción el plan debe actualizar solo el cuerpo de
`aws_cloudwatch_dashboard.service[0]`. Si aparecen otros
cambios, resolverlos antes de aplicar. No cambiar las imágenes de Lambda para
ampliar el panel. `service_dashboard_enabled=false` permite retirarlo mediante un
plan posterior sin eliminar las métricas de origen ni alterar las aplicaciones.

También se puede crear desde CloudWatch → Dashboards → Create dashboard y pegar
el JSON renderizado en Actions → View/edit source. La plantilla `.tftpl` requiere
resolver sus ocho variables antes de pegarla. Solo al adoptar una copia creada
manualmente en otro estado, importarla en Terraform antes del próximo apply, con
el mismo nombre y configuración:

```bash
terraform import 'aws_cloudwatch_dashboard.service[0]' travel-ai-service-metrics
```

El acceso requiere una sesión de AWS con permisos para crear/ver dashboards y leer
las métricas. El dashboard sigue siendo privado en la consola AWS.

## Qué muestra

| Señal | Fuente y estadística | Alcance |
|---|---|---|
| Invocaciones | Lambda `Invocations`, Sum/min | Cada función |
| Duración p50/p95 | Lambda `Duration`, percentiles, ms | Cada función, sin cold start |
| Fallos de ejecución | Lambda `Errors`, Sum/min | Cada función; no todos los HTTP 5xx |
| Rechazos | Lambda `Throttles`, Sum/min | Cada función |
| Concurrencia | Lambda `ConcurrentExecutions`, Maximum/min | No es un gauge HTTP exacto |
| Peticiones/s | API Gateway `Count`, SampleCount / período | Stage completo |
| HTTP 4xx/5xx | API Gateway, Sum/min | Stage completo |
| Latencia p50/p95 | API Gateway `Latency`, ms | Stage completo |
| HTTP 5xx (%) | 100 × 5xx / peticiones por minuto | Solo cuando hay peticiones |
| Federación Google | Cognito FederationSuccesses, SampleCount/Sum; FederationThrottles, Sum/min | Pool, cliente web y proveedor Google |
| Renovación de tokens | Cognito TokenRefreshSuccesses, SampleCount/Sum por minuto | Pool y cliente web |

Se usan dimensiones `FunctionName` y `ApiName, Stage`. No se activan métricas
detalladas por método/ruta. Los nombres y estadísticas se basan en la documentación
de [Lambda](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html)
y [API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-metrics-and-dimensions.html).

No se infiere disponibilidad a partir de ausencia de errores: no hay un sondeo
sintético. Los percentiles requieren tráfico suficiente. Las series ausentes no
se convierten artificialmente a cero. La latencia de API Gateway y la duración de
Lambda no equivalen al tiempo hasta el primer token ni a la experiencia completa
en el navegador; las peticiones SSE pueden durar todo el stream.

## Cognito: interpretación y límites

El acceso de la aplicación es federado con Google, por lo que se utiliza
FederationSuccesses, no SignInSuccesses de autenticación directa. Las dimensiones
son UserPool, UserPoolClient e IdentityProvider, ligadas a los recursos existentes.
La renovación usa solo UserPool y UserPoolClient. No se cambia la autenticación.

SampleCount cuenta intentos publicados y Sum cuenta éxitos: los fallos son
SampleCount − Sum. El éxito de federación requiere que Cognito emita tokens;
los códigos de autorización sin canje y el throttling también producen muestras
sin éxito. Por eso el panel etiqueta esos fallos como «Sin emisión de tokens» y
muestra FederationThrottles como subconjunto, no como fallos adicionales.
El porcentaje es 100 × éxitos / intentos y queda vacío sin intentos.

La renovación tiene su propia serie: intentos, renovaciones correctas y fallos
(incluido throttling), con la misma resta. No se añade una serie independiente de
TokenRefreshThrottles para mantener cinco referencias nuevas. No se rellenan
las ausencias con cero. Las métricas pueden publicarse con retraso y solo cubren
muestras emitidas por AWS para este pool/cliente; no cuentan usuarios únicos,
sesiones, bloqueos de la lista de acceso de la app ni cancelaciones que no llegan
a Cognito. No son logs individuales de auditoría y no incluyen correos, tokens,
IP ni datos de cada usuario. El gráfico de federación muestra recuentos por minuto
en el eje izquierdo y porcentaje de éxito en el derecho.

Referencia: [métricas de Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/metrics-for-cognito-user-pools.html).

## Guion para la presentación

1. Abrir el dashboard y seleccionar las últimas 3 horas.
2. Consultar viajes en la aplicación para generar actividad en `core_api`.
3. Generar un itinerario para mostrar la actividad y duración de `ai_api`.
4. Esperar unos minutos a la publicación de métricas y actualizar manualmente.
5. Para Cognito, iniciar sesión normalmente con Google, esperar a que AWS publique
   las muestras y actualizar. La renovación solo aparece cuando el cliente renueva
   tokens; no equivale a una llamada de la API. No provocar fallos ni throttling.
6. Explicar tráfico, duración y concurrencia. Mostrar errores reales si existen;
   no provocar fallos de producción ni presentar ausencia de datos como éxito.

Si está vacío, comprobar cuenta, región, dimensiones y ventana temporal. La
ausencia de tráfico no prueba una caída. Confirmar que las llamadas pasan por el
stage `prod` y no se están probando servicios locales.

## Coste y alcance pendiente

Se reutilizan métricas nativas. No se crean métricas personalizadas, alarmas,
sondeos, métricas detalladas de API Gateway ni escaneos de Logs Insights. El
dashboard contiene 24 referencias a métricas nativas y 29 entradas incluyendo
expresiones matemáticas, por debajo de las 50 por dashboard
de la capa gratuita publicada por AWS (hasta 3 dashboards personalizados al mes).
Junto con los paneles de infraestructura y accesos HTTP son tres dashboards.
Cognito reutiliza el de servicio: no crea un cuarto dashboard ni activa logs de
Cognito, métricas personalizadas o protección avanzada. Antes de ampliar,
comprobar el consumo de la cuenta y la
[tarifa de CloudWatch](https://aws.amazon.com/cloudwatch/pricing/). No se garantiza
una factura total de cero: el tráfico normal de la aplicación y los demás
recursos conservan sus costes. Mantener la actualización manual para la demo.

Los paneles de [infraestructura](infrastructure-dashboard-cloudwatch.md) y
[accesos HTTP](access-logs-cloudwatch.md) cubren DynamoDB/CloudFront y los logs
estructurados por ruta e inicialización de Lambda. Esta sección Cognito no añade
métricas de negocio o IA ni alarmas.
