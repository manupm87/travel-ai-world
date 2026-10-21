# Logs de acceso HTTP y dashboard

El dashboard `travel-ai-access-logs` complementa los paneles de
[servicio](service-dashboard-cloudwatch.md) e
[infraestructura](infrastructure-dashboard-cloudwatch.md). Su nombre deriva de
`name_prefix`; el recurso y la activación están en `infra/aws/access_logs.tf`.
La [decisión](../architecture/adr/0035-structured-http-access-logs.md) documenta la
semántica y el límite de privacidad.

## Activación y rollback

ACCESS_LOG_ENABLED es false por defecto en CommonSettings. Para pruebas locales,
poner `ACCESS_LOG_ENABLED=true` en el `.env` del servicio y reiniciarlo.
Terraform pasa `ACCESS_LOG_ENABLED` a ambas Lambdas a partir de
`access_logs_enabled` (true por defecto). También hay que desplegar imágenes que
contengan el nuevo middleware: cambiar solo el entorno de una imagen antigua no
genera los registros.

Seguir el [runbook de despliegue](deploy.md): construir las imágenes del commit
revisado, revisar el plan y desplegar. No aplicar modificaciones ajenas a este
cambio. Verificar `access_logs_dashboard_url` y tráfico real antes de dar la
entrega de producción por completada. No se crean registros históricos.

Para parar la ingesta adicional, poner `access_logs_enabled=false`, revisar el
plan y desplegar el entorno actualizado. Los registros existentes siguen sujetos
a la retención de su grupo. `access_logs_dashboard_enabled=false` elimina solo el
dashboard tras aplicar el plan; no detiene por sí mismo los logs de aplicación.
Cuando el observador está activo, el entrypoint desactiva el access log de
Uvicorn para no duplicar URL y query strings sin normalizar.

## Contrato y límites

Una línea de log con prefijo `access_log=` seguida de JSON compacto versión 1.
El formato de logging habitual puede añadir fecha, nivel y nombre de logger antes
del marcador. No parsear la línea completa como JSON: extraer primero el payload.

| Campo | Significado |
|---|---|
| route | Plantilla del router; `__unmatched__` para rutas no resueltas |
| method | Método HTTP estándar; desconocidos se agrupan |
| status | Estado enviado, o 500 si falla antes de iniciar respuesta |
| duration_ms | Tiempo hasta preparar el mensaje terminal ASGI |
| request_id | UUID de invocación Lambda validado; null si no está disponible |
| cold_start | Primera petición Lambda observada por el proceso; no mide Init Duration |
| outcome | `response_ready` o `interrupted` |
| version | 1 |

No incluye URL completa, parámetros, cabeceras, cuerpo, identidad, email o token.
El contexto Lambda solo aporta el UUID validado, nunca se registra completo. La
privacidad anterior corresponde a estas líneas nuevas: no redefine otros logs
existentes de auditoría o excepciones.

El registro se emite antes de entregar el último body/trailers al servidor, para
que Lambda no congele el trabajo tras responder. En SSE incluye el tiempo de
generación del stream, sin medir entrega final al navegador ni primer token. Un
fallo al enviar el mensaje terminal puede ocurrir después del registro
`response_ready`: ese valor indica preparación, no recepción por el cliente.
Una interrupción anterior conserva el estado ya enviado; una respuesta 200
interrumpida no se cuenta como 5xx. Los sondeos internos de readiness sin contexto
de invocación no consumen el marcador de primera petición Lambda.

## Consultas y verificación

Cada widget del JSON en
`infra/aws/metric/cloudwatch/access_logs.json.tftpl` contiene una consulta copiable.
En Logs Insights, seleccionar explícitamente el grupo del servicio y omitir la
línea SOURCE del widget si se usa el selector de grupos de la consola.

Resumen de rutas para un grupo seleccionado:

```text
filter @message like /access_log=/
| parse @message "access_log=*" as payload
| fields jsonParse(payload) as a
| filter a.version = 1
| stats count(*) as peticiones,
    sum(if(a.status >= 500 and a.status < 600, 1, 0)) as respuestas_5xx,
    pct(a.duration_ms, 95) as p95_ms by a.method, a.route
| sort peticiones desc
| limit 50
```

Inicializaciones de Lambda a partir del reporte de runtime:

```text
filter @type = "REPORT"
| stats count(*) as invocaciones_reportadas,
    count(@initDuration) as arranques_con_init,
    pct(@initDuration, 95) as init_p95_ms
```

REPORT/Init Duration es independiente de los eventos de acceso y puede estar
disponible antes del nuevo despliegue. Si no hay muestras, los percentiles quedan
vacíos. Para verificar accesos, usar normalmente la aplicación y consultar un
intervalo corto; comprobar plantillas y ausencia de identificadores concretos.
Una tabla vacía antes del despliegue no demuestra una caída ni ausencia de errores.
Los resúmenes muestran las 50 rutas de mayor volumen; no representan toda ruta si
se supera ese límite.

## Coste

El dashboard ejecuta seis consultas: resumen HTTP, tráfico/5xx por 5 minutos e
inicialización REPORT, para cada servicio. Abre por defecto tres horas, sin
actualización automática. Cada apertura o refresh escanea los datos del grupo en
esa ventana; el filtro `access_log=` no evita escanear otros mensajes del grupo.
Cerrar la pestaña después de usarla y no activar refresco periódico.

Se conservan los grupos existentes con retención predeterminada de 14 días. No se
añaden métricas personalizadas, filtros de métricas, agentes, exportadores ni
alarmas. La capa gratuita de dashboards y logs se comparte con el resto de la
cuenta; no garantiza un coste cero. La ingesta y las consultas se facturan según
la [tarifa regional vigente](https://aws.amazon.com/cloudwatch/pricing/).

Referencias: [Logs Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html),
[funciones JSON y condicionales](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-operations-functions.html)
y [formato de widgets](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Dashboard-Body-Structure.html).
