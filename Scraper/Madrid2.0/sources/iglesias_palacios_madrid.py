# Scraper de Google Places (New) para Iglesias y Palacios importantes de Madrid. Realiza búsquedas textuales específicas para cada POI

import os
import json
import requests

from config.env import GOOGLE_API_KEY
from core.utils import normalize_iglesias_palacios


TEXT_URL = "https://places.googleapis.com/v1/places:searchText"



# LISTA OFICIAL DE POIs IMPORTANTES

LUGARES = [
    # Iglesias / Catedrales / Basílicas
    "Catedral de la Almudena Madrid",
    "Basílica de San Francisco el Grande Madrid",
    "Iglesia de San Ginés Madrid",
    "Iglesia de San Jerónimo el Real Madrid",
    "Iglesia de San Antonio de los Alemanes Madrid",
    "Iglesia de San Andrés Madrid",
    "Iglesia de San Nicolás de los Servitas Madrid",
    "Iglesia de Santa Bárbara Madrid",

    # Palacios
    "Palacio Real de Madrid",
    "Palacio de Cibeles Madrid",
    "Palacio de Linares Madrid",
    "Palacio de Liria Madrid",
    "Palacio de Buenavista Madrid",
    "Palacio de Cristal Madrid",
    "Palacio de Velázquez Madrid",
    "Palacio de Longoria Madrid"
]


def get_iglesias_palacios_madrid():
    print(">> Buscando Iglesias y Palacios importantes de Madrid (Text Search)…")

    resultados = []
    ids_vistos = set()

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask": (
            "places.id,places.displayName,places.formattedAddress,"
            "places.location,places.rating,places.userRatingCount,places.types"
        )
    }

    for nombre in LUGARES:
        print(f">> Buscando: {nombre}")

        payload = {
            "textQuery": nombre,
            "pageSize": 1
        }

        response = requests.post(TEXT_URL, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()

        encontrados = data.get("places", [])
        if not encontrados:
            print(f"   >> No encontrado en Google: {nombre}")
            continue

        place = encontrados[0]
        place_id = place.get("id")

        if place_id in ids_vistos:
            continue

        ids_vistos.add(place_id)

        # Inferir tipo según el nombre
        if "Palacio" in nombre:
            tipo = ["Palacio"]
        else:
            tipo = ["Iglesia"]

        item = normalize_iglesias_palacios(place, tipo)
        item["nombre_original"] = nombre  # ← nombre a buscar

        resultados.append(item)

    
    # Guardar resultado final
    
    output = {
        "city": "Madrid",
        "category": "iglesias_palacios",
        "count": len(resultados),
        "items": resultados,
        "source": "Google Places API (New)"
    }

    os.makedirs("data", exist_ok=True)

    with open("data/iglesias_palacios_google.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=4, ensure_ascii=False)

    print(f">> Iglesias y Palacios guardados: {len(resultados)}")
    return resultados
