# Realiza el Scraper de Google Places (New) para estaciones de Cercanías Madrid.
# Realiza búsquedas por zonas y búsquedas textuales, deduplica resultados y genera el archivo 'cercanias_madrid.json' con los datos obtenidos.


import os
import json
import time
import requests

from config.env import GOOGLE_API_KEY as API_KEY

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

HEADERS = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": API_KEY,
    "X-Goog-FieldMask": (
        "places.id,places.displayName,places.formattedAddress,"
        "places.location,places.rating,places.userRatingCount,"
        "places.types"
    )
}

ZONAS = [
    (40.4168, -3.7038),
    (40.42, -3.71),
    (40.425, -3.69),
    (40.41, -3.695),
    (40.43, -3.72),
    (40.45, -3.69),
    (40.405, -3.7),
    (40.47, -3.58)
]

def buscar_cercanias_google():
    print(">> Buscando estaciones de Cercanías en Google Places…")

    resultados = {}

    # 1) Búsqueda por zonas
    for lat, lon in ZONAS:
        payload = {
            "textQuery": "Cercanías Madrid train station",
            "locationBias": {
                "circle": {
                    "center": {"latitude": lat, "longitude": lon},
                    "radius": 5000
                }
            }
        }

        resp = requests.post(SEARCH_URL, headers=HEADERS, json=payload)
        if resp.status_code != 200:
            print(f"   !! Error {resp.status_code} en zona {lat},{lon}")
            continue

        data = resp.json()
        places = data.get("places", [])
        print(f"   >> Zona {lat},{lon} → {len(places)} resultados")

        for p in places:
            nombre = p["displayName"]["text"]
            resultados[nombre] = p

        time.sleep(0.3)

    # 2) Búsqueda textual adicional
    for query in ["Cercanías Madrid", "Renfe Cercanías Madrid", "train station Madrid"]:
        payload = {"textQuery": query}
        resp = requests.post(SEARCH_URL, headers=HEADERS, json=payload)
        if resp.status_code != 200:
            print(f"   !! Error {resp.status_code} en búsqueda '{query}'")
            continue

        data = resp.json()
        places = data.get("places", [])
        print(f"   >> Búsqueda '{query}' → {len(places)} resultados")

        for p in places:
            nombre = p["displayName"]["text"]
            resultados[nombre] = p

        time.sleep(0.3)

    # Convertir a formato limpio
    items = []
    for nombre, p in resultados.items():
        items.append({
            "id": p.get("id"),
            "nombre": nombre,
            "direccion": p.get("formattedAddress"),
            "lat": p["location"]["latitude"],
            "lon": p["location"]["longitude"],
            "rating": p.get("rating"),
            "reviews": p.get("userRatingCount"),
            "amenities": p.get("types", []),
            "fuente": "Google Places (New)"
        })

    os.makedirs("data", exist_ok=True)

    with open("data/cercanias_madrid.json", "w", encoding="utf-8") as f:
        json.dump({
            "city": "Madrid",
            "category": "cercanias",
            "count": len(items),
            "items": items
        }, f, indent=4, ensure_ascii=False)

    print(f">> Estaciones guardadas: {len(items)}")
    return items


def get_cercanias_google():
    return buscar_cercanias_google()
