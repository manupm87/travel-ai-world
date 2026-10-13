# Métrica de viajes creados

`trips_created_total` es un contador Prometheus con la etiqueta `city_slug`.
Cuenta viajes nuevos guardados correctamente, desglosados por ciudad.

Instala la dependencia con `python -m pip install -r workspace/infra/aws/metric/requirements.txt`.

## Integración en la API

Importa `record_trip_created` desde este módulo y llama a la función después
de confirmar la escritura de un viaje nuevo:

```python
record_trip_created(city_slug="budapest")
```

Usa el slug del catálogo de destinos; no uses texto libre del usuario, IDs de
usuario o IDs de viaje como etiquetas. No incrementes en actualizaciones,
escrituras fallidas ni reintentos que devuelvan un viaje ya existente.

El endpoint `/metrics` del servicio debe exponer el registro por defecto de
`prometheus_client`. Este módulo no crea un endpoint ni configura el scraping.
La integración queda pendiente de disponer del código de la API.

## Consultas PromQL

Viajes creados en las últimas 24 horas, por ciudad:

```promql
sum by (city_slug) (increase(trips_created_total[24h]))
```

Total de viajes creados en las últimas 24 horas:

```promql
sum(increase(trips_created_total[24h]))
```

El contador vive en memoria y se reinicia con el proceso. Prometheus conserva
las muestras y `increase` tiene en cuenta los reinicios; sus resultados son
estimaciones para observabilidad, no un registro contable exacto. En despliegues
con varios workers debe configurarse el modo multiproceso de prometheus_client.
