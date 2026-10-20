# Panel de servicio en CloudWatch

El dashboard nativo `travel-ai-service-metrics` complementa las métricas de negocio
de Grafana para la presentación. Su nombre usa `name_prefix`; el valor anterior
corresponde al prefijo predeterminado. Implementa la parte de métricas nativas de
TRA-297: no añade middleware, métricas personalizadas ni consultas de logs.

## Crear y abrir

El 2026-10-20 se creó manualmente `travel-ai-service-metrics` en la cuenta de
producción y se verificaron datos de Lambda y API Gateway en `eu-west-1`.
Antes de gestionarlo mediante Terraform, importar ese mismo dashboard al estado
de producción con el comando indicado más abajo. No crear un segundo dashboard
con otro nombre. Este cambio no aplica automáticamente infraestructura.

El recurso está en `infra/aws/dashboard.tf`; su cuerpo está en
`infra/aws/metric/cloudwatch/service_metrics.json.tftpl`. Terraform obtiene los
nombres reales de las funciones y del stage de los recursos existentes.

Desde `infra/aws`, con la sesión AWS y el backend de Terraform configurados según
el [runbook de infraestructura](../../infra/aws/README.md):

```bash
terraform plan -out=service-dashboard.tfplan
terraform show service-dashboard.tfplan
# Aplicar únicamente un plan revisado: no desplegar cambios ajenos al dashboard.
terraform apply service-dashboard.tfplan
terraform output -raw service_dashboard_url
```

El plan debe añadir solo `aws_cloudwatch_dashboard.service[0]`. Si aparecen otros
cambios, resolverlos antes de aplicar. No cambiar las imágenes de Lambda para
crear el panel. `service_dashboard_enabled=false` permite retirarlo mediante un
plan posterior sin eliminar las métricas de origen ni alterar las aplicaciones.

También se puede crear desde CloudWatch → Dashboards → Create dashboard y pegar
el JSON renderizado en Actions → View/edit source. La plantilla `.tftpl` requiere
resolver sus cinco variables antes de pegarla. Si se crea manualmente, importarlo
en Terraform antes del próximo apply, con el mismo nombre y configuración:

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

Se usan dimensiones `FunctionName` y `ApiName, Stage`. No se activan métricas
detalladas por método/ruta. Los nombres y estadísticas se basan en la documentación
de [Lambda](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html)
y [API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-metrics-and-dimensions.html).

No se infiere disponibilidad a partir de ausencia de errores: no hay un sondeo
sintético. Los percentiles requieren tráfico suficiente. Las series ausentes no
se convierten artificialmente a cero. La latencia de API Gateway y la duración de
Lambda no equivalen al tiempo hasta el primer token ni a la experiencia completa
en el navegador; las peticiones SSE pueden durar todo el stream.

## Guion para la presentación

1. Abrir el dashboard y seleccionar las últimas 3 horas.
2. Consultar viajes en la aplicación para generar actividad en `core_api`.
3. Generar un itinerario para mostrar la actividad y duración de `ai_api`.
4. Esperar unos minutos a la publicación de métricas y actualizar manualmente.
5. Explicar tráfico, duración y concurrencia. Mostrar errores reales si existen;
   no provocar fallos de producción ni presentar ausencia de datos como éxito.

Si está vacío, comprobar cuenta, región, dimensiones y ventana temporal. La
ausencia de tráfico no prueba una caída. Confirmar que las llamadas pasan por el
stage `prod` y no se están probando servicios locales.

## Coste y alcance pendiente

Se reutilizan métricas nativas. No se crean métricas personalizadas, alarmas,
sondeos, métricas detalladas de API Gateway ni escaneos de Logs Insights. El
dashboard contiene 19 referencias a métricas, por debajo de las 50 por dashboard
de la capa gratuita publicada por AWS (hasta 3 dashboards personalizados al mes).
Antes de añadir otros, comprobar el consumo de la cuenta y la
[tarifa de CloudWatch](https://aws.amazon.com/cloudwatch/pricing/). No se garantiza
una factura total de cero: el tráfico normal de la aplicación y los demás
recursos conservan sus costes. Mantener la actualización manual para la demo.

TRA-297 conserva el trabajo adicional: logs estructurados por petición,
latencia/5xx por ruta, cold starts, DynamoDB y CloudFront. Esta entrega no completa
esos criterios de aceptación.
