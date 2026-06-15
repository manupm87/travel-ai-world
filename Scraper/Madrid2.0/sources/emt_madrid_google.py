# Scraper de Google Places (New) para obtener los intercambiadores EMT de Madrid.

import os
import json
import requests

from config.env import GOOGLE_API_KEY as API_KEY

PLACES_URL = "https://places.googleapis.com/v1/places:searchText"

HEADERS = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": API_KEY,
    "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types"
}

def buscar(query):
    body = {
        "textQuery": query,
        "languageCode": "es",
        "regionCode": "ES"
    }
    resp = requests.post(PLACES_URL, headers=HEADERS, json=body)
    if resp.status_code != 200:
        print(f"   !! Error {resp.status_code} en búsqueda '{query}'")
        return []

    data = resp.json()
    return data.get("places", [])


def get_emt_google():
    print(">> Buscando intercambiadores EMT en Google Places…")

    queries = [
        "Intercambiador de Moncloa",
        "Intercambiador de Avenida de América",
        "Intercambiador de Plaza de Castilla",
        "Intercambiador de Príncipe Pío",
        "Intercambiador de Plaza Elíptica",
        "Estación Sur de Autobuses Madrid",
        "Estación de autobuses Méndez Álvaro",
        "Estación de autobuses Moncloa",
        "Estación de autobuses Avenida de América",
        "Estación de autobuses Plaza de Castilla"
    ]

    items = []
    vistos = set()

    for q in queries:
        print(f"   >> Búsqueda '{q}'…")
        places = buscar(q)
        for p in places:
            pid = p.get("id")
            if not pid or pid in vistos:
                continue
            vistos.add(pid)

            loc = p.get("location", {})
            items.append({
                "id": pid,
                "nombre": p.get("displayName", {}).get("text"),
                "direccion": p.get("formattedAddress"),
                "lat": loc.get("latitude"),
                "lon": loc.get("longitude"),
                "rating": p.get("rating"),
                "reviews": p.get("userRatingCount"),
                "amenities": p.get("types", []),
                "fuente": "Google Places (New)"
            })

    os.makedirs("data", exist_ok=True)

    salida = {
        "city": "Madrid",
        "category": "emt",
        "count": len(items),
        "items": items
    }

    with open("data/emt_madrid.json", "w", encoding="utf-8") as f:
        json.dump(salida, f, indent=4, ensure_ascii=False)

    print(f">> Intercambiadores EMT guardados (Google): {len(items)}")
    return salida
