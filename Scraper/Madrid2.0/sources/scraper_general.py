# Este archivo es sel Scraper universal para categorías basadas en Google Places API (New).
# Lee la configuración de cada categoría desde 'config/categories.py' y ejecutaautomáticamente Nearby Search y Text Search, aplicando filtros por tipos, normalización específica por categoría y deduplicación. 
# Genera un archivo JSON estructurado en la carpeta 'data/' con los POIs encontrados para la categoría seleccionada. Este módulo es el motor principal del scraping de POIs en Madrid.

import os
import json
import requests
import sys

from config.env import GOOGLE_API_KEY
from config.google_places import GOOGLE_NEARBY_URL, GOOGLE_TEXT_URL
from config.categories import CATEGORIES
from core import utils


def ejecutar_scraper(categoria):
   
    # 1._  Validación de las categorías 
    
    if categoria not in CATEGORIES:
        print(f"Categoría desconocida: {categoria}")
        print(f"Categorías disponibles: {list(CATEGORIES.keys())}")
        return

    cfg = CATEGORIES[categoria]

    print(f">> Buscando {categoria} en Madrid con Google Places (New)…")

    
    # 2._ Cargar configuración de las zonas de la ciudad y tipos validos/invalidos para cada categoria a extraer
    
    zonas = cfg["zones"]
    valid_types = cfg["valid_types"]
    invalid_types = cfg["invalid_types"]
    type_map = cfg["type_map"]
    text_queries = cfg["text_queries"]
    included_types = cfg["included_types"]
    normalizer_name = cfg["normalizer"]
    output_file = cfg["output"]

    # Obtener función normalizadora real desde core/utils.py

    normalizer = getattr(utils, normalizer_name)

    resultados = []
    ids_vistos = set()

    
    # 3._  Nearby Search
    
    for idx, zona in enumerate(zonas, start=1):
        print(f">> Zona {idx}: {zona['lat']}, {zona['lng']}")

        payload = {
            "includedTypes": included_types,
            "maxResultCount": 20,
            "locationRestriction": {
                "circle": {
                    "center": {
                        "latitude": zona["lat"],
                        "longitude": zona["lng"]
                    },
                    "radius": 7000
                }
            }
        }

        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_API_KEY,
            "X-Goog-FieldMask": (
                "places.id,places.displayName,places.formattedAddress,"
                "places.location,places.rating,places.userRatingCount,places.types"
            )
        }

        response = requests.post(GOOGLE_NEARBY_URL, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()

        encontrados = data.get("places", [])
        print(f"   >> Resultados encontrados: {len(encontrados)}")

        for place in encontrados:
            types = place.get("types", [])

            # Filtro general
            if any(t in invalid_types for t in types):
                continue
            if not any(t in valid_types for t in types):
                continue

            place_id = place.get("id")
            if place_id in ids_vistos:
                continue

            ids_vistos.add(place_id)

            # Inferir tipo si hay mapa
            if type_map:
                tipos = [type_map[t] for t in types if t in type_map]
            else:
                tipos = []
            

            # Caso especial de categoria: METRO → siempre requiere lineas=[]
            # Metro de madrid no tiene tipos especificos en Google Places. Por eso se le pasa una lista vacia al normalizador.
            if categoria == "metro":
                item = normalizer(place, [])

            # Categorías con type_map (bares, restaurantes, museos, monumentos…)
            elif type_map:
                item = normalizer(place, tipos)

            # Categorías sin type_map (hoteles, parques…)
            else:
                item = normalizer(place)


            resultados.append(item)

    
    # 4._ Text Search
   
    for query in text_queries:
        print(f">> Búsqueda textual: '{query}'")

        payload = {
            "textQuery": query,
            "pageSize": 20
        }

        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_API_KEY,
            "X-Goog-FieldMask": (
                "places.id,places.displayName,places.formattedAddress,"
                "places.location,places.rating,places.userRatingCount,places.types"
            )
        }

        response = requests.post(GOOGLE_TEXT_URL, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()

        encontrados = data.get("places", [])
        print(f"   >> Resultados por texto: {len(encontrados)}")

        for place in encontrados:
            types = place.get("types", [])

            if any(t in invalid_types for t in types):
                continue
            if not any(t in valid_types for t in types):
                continue

            place_id = place.get("id")
            if place_id in ids_vistos:
                continue

            ids_vistos.add(place_id)

            if type_map:
                tipos = [type_map[t] for t in types if t in type_map]
            else:
                tipos = []

            # Caso especial de categoria: METRO → siempre requiere lineas=[]
            # Metro de madrid no tiene tipos especificos en Google Places. Por eso se le pasa una lista vacia al normalizador.

            if categoria == "metro":
                item = normalizer(place, [])
            # Categorías con type_map (bares, restaurantes, museos, monumentos…)
            elif type_map:
                item = normalizer(place, tipos)
            # Categorías sin type_map (hoteles, parques…)
            else:
                item = normalizer(place)


            resultados.append(item)


    # 5._ Guardar resultado final en archivos .json estructuradoss y normalizados dentro de /data

    output = {
        "city": "Madrid",
        "category": categoria,
        "count": len(resultados),
        "items": resultados,
        "source": "Google Places API (New)"
    }

    os.makedirs("data", exist_ok=True)

    with open(f"data/{output_file}", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=4, ensure_ascii=False)

    print(f">> {categoria.capitalize()} guardados: {len(resultados)}")
    return resultados
