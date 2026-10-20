# Panel de infraestructura en CloudWatch

`travel-ai-infrastructure-metrics` complementa el
[panel de servicio](service-dashboard-cloudwatch.md). El nombre deriva de
`name_prefix`. Su recurso está en `infra/aws/infrastructure_dashboard.tf` y su
cuerpo en `infra/aws/metric/cloudwatch/infrastructure_metrics.json.tftpl`.

## Métricas y alcance

| Área | Métricas y estadística | Dimensiones |
|---|---|---|
| DynamoDB, consumo | ConsumedReadCapacityUnits / ConsumedWriteCapacityUnits, Sum/min | TableName de core e interactions |
| DynamoDB, eventos limitados | ReadThrottleEvents / WriteThrottleEvents, Sum/min | TableName, y GlobalSecondaryIndexName para GSI1/GSI2 |
| DynamoDB, peticiones limitadas | ThrottledRequests, Sum/min por operación | TableName y Operation |
| CloudFront, tráfico | Requests, BytesDownloaded, BytesUploaded, Sum/min | DistributionId y Region=Global |
| CloudFront, errores | 4xxErrorRate / 5xxErrorRate, Average | DistributionId y Region=Global |
| Lambda | 100 × Sum(Errors) / Sum(Invocations) por minuto | FunctionName de cada servicio |

Las métricas CloudFront se consultan en `us-east-1`, mientras que DynamoDB y
Lambda usan la región de los recursos. Los porcentajes CloudFront ya vienen en
porcentaje: no multiplicarlos por cien otra vez. Las series Lambda solo se
calculan cuando hay invocaciones; sin actividad no se inventa un cero.

Las tablas usan pago por petición. Las unidades consumidas se muestran por
minuto, no como porcentaje de una capacidad provisionada inexistente. El consumo
es de las tablas base y no suma el de los índices. Los eventos limitados de tabla
y GSI se muestran por separado: un evento no equivale a una petición única.

Se incluyen diez operaciones para ThrottledRequests: GetItem, PutItem, UpdateItem,
DeleteItem, Query, Scan, BatchGetItem, BatchWriteItem, TransactGetItems y
TransactWriteItems. Si se incorporan otras APIs, añadir sus dimensiones de forma
explícita y volver a revisar el número de métricas. Para operaciones por lotes,
ThrottledRequests solo se incrementa si todas las operaciones del lote se limitan;
los eventos de lectura/escritura permiten detectar limitaciones parciales.

## Publicación y verificación

El 2026-10-20 se creó el dashboard en la consola de producción. Se verificaron
series reales de consumo DynamoDB, tráfico/transferencia/errores CloudFront y
porcentaje de errores Lambda. Las series de throttling estaban sin datos en la
ventana revisada. La adopción de este segundo dashboard en el estado remoto de
Terraform queda pendiente de la importación indicada a continuación.

Terraform obtiene nombres de tablas, funciones y distribución de los recursos
existentes. Revisar el plan antes de aplicar siguiendo el
[runbook AWS](../../infra/aws/README.md). No desplegar cambios ajenos al dashboard.

Si el dashboard se creó antes en la consola, importarlo al mismo estado de
producción antes de aplicar, conservando el nombre:

```bash
terraform import 'aws_cloudwatch_dashboard.infrastructure[0]' travel-ai-infrastructure-metrics
```

Después, revisar el plan y comprobar la salida `infrastructure_dashboard_url`.
`infrastructure_dashboard_enabled=false` permite retirar el dashboard mediante un
plan posterior; no elimina las métricas originales.

En la consola, seleccionar tres horas y actualizar manualmente después de usar
normalmente la web y el planner. La capacidad DynamoDB y el tráfico CloudFront
deben reflejar la actividad cuando AWS publique las muestras. Las series de
throttling pueden estar ausentes si no hubo limitaciones; no generar sobrecarga
de producción para demostrarlas. Comparar las tablas y distribución con los
recursos reales de la cuenta. Los errores Lambda son errores de ejecución, no
todos los HTTP 5xx.

## Presupuesto

Este dashboard contiene 45 referencias a métricas nativas y no activa métricas
adicionales de CloudFront, Contributor Insights, alarmas, sondeos, nuevos logs ni
consultas de Logs Insights. Actualización manual; rango inicial de tres horas.
Junto con el panel de servicio serían dos dashboards personalizados. AWS publica
una capa gratuita de hasta tres dashboards con hasta 50 métricas cada uno:
comprobar el consumo total de la cuenta y las condiciones vigentes en la
[tarifa oficial](https://aws.amazon.com/cloudwatch/pricing/) antes de ampliar.
El uso normal del proyecto mantiene sus costes y la facturación puede retrasarse.

Referencias: [DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/metrics-dimensions.html),
[CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/monitoring-using-cloudwatch.html)
y [Lambda](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html).
