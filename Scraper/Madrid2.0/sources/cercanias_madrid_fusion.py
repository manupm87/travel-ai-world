# Fusiona los datos de Cercanías obtenidos desde Google Places (New) y Wikipedia.
# Normaliza nombres, empareja estaciones, añade líneas y colores, y genera el archivo 'cercanias_madrid_final.json'.

import os
import json
import difflib
import unicodedata
import re

def normalizar(nombre):
    nombre = nombre.lower()
    nombre = ''.join(
        c for c in unicodedata.normalize('NFD', nombre)
        if unicodedata.category(c) != 'Mn'
    )

    reemplazos = [
        "estacion de", "estacion", "renfe", "cercanias", "cercanias station",
        "station", "train station", "puerta de", "almudena grandes", "madrid"
    ]
    for r in reemplazos:
        nombre = nombre.replace(r, "")

    nombre = nombre.replace("-", " ")
    nombre = re.sub(r"\s+", " ", nombre)
    return nombre.strip()


def fusionar_cercanias():
    print(">> Fusionando datos de Cercanías…")

    # Google Places
    with open("data/cercanias_madrid.json", "r", encoding="utf-8") as f:
        google_items = json.load(f)["items"]

    # Wikipedia
    with open("data/cercanias_wiki_estaciones.json", "r", encoding="utf-8") as f:
        wiki = json.load(f)

    with open("data/cercanias_wiki_colores.json", "r", encoding="utf-8") as f:
        colores = json.load(f)

    # Normalizar claves de Wikipedia
    wiki_norm = {normalizar(k): v for k, v in wiki.items()}

    # Normalizar Google
    google_norm = {normalizar(g["nombre"]): g for g in google_items}

    items_final = []

    # 1) Fusionar estaciones que Google sí encontró
    for g_norm, g in google_norm.items():
        if g_norm in wiki_norm:
            lineas = wiki_norm[g_norm]
        else:
            candidatos = difflib.get_close_matches(g_norm, wiki_norm.keys(), n=1, cutoff=0.6)
            lineas = wiki_norm[candidatos[0]] if candidatos else []

        g["lineas"] = lineas
        g["colores"] = [colores.get(l) for l in lineas if l in colores]
        items_final.append(g)

    # 2) Añadir estaciones que NO están en Google
    for w_norm, lineas in wiki_norm.items():
        if w_norm not in google_norm:
            items_final.append({
                "id": None,
                "nombre": next(k for k in wiki if normalizar(k) == w_norm),
                "direccion": None,
                "lat": None,
                "lon": None,
                "rating": None,
                "reviews": None,
                "amenities": [],
                "fuente": "Wikipedia",
                "lineas": lineas,
                "colores": [colores.get(l) for l in lineas if l in colores]
            })

    salida = {
        "city": "Madrid",
        "category": "cercanias",
        "count": len(items_final),
        "items": items_final
    }

    with open("data/cercanias_madrid_final.json", "w", encoding="utf-8") as f:
        json.dump(salida, f, indent=4, ensure_ascii=False)

    print(f">> Fusión completada. Estaciones finales: {len(items_final)}")
    return salida
