# Fusiona los datos del Metro de Madrid obtenidos desde Google Places (New) con la información oficial extraída desde Wikipedia.
# Realiza matching difuso para asignar líneas y colores a cada estación, y genera el archivo'metro_madrid_final.json'.

import json
import os

from difflib import get_close_matches


def fusionar_metro():
    print(">> Fusionando Google Places + Wikipedia…")

    with open("data/metro_madrid.json", "r", encoding="utf-8") as f:
        google_data = json.load(f)["items"]

    with open("data/metro_wiki_estaciones.json", "r", encoding="utf-8") as f:
        wiki_estaciones = json.load(f)

    with open("data/metro_wiki_colores.json", "r", encoding="utf-8") as f:
        wiki_colores = json.load(f)

    resultado = []

    for est in google_data:
        nombre = est["nombre"]

        # Matching tolerante
        match = get_close_matches(nombre, wiki_estaciones.keys(), n=1, cutoff=0.6)
        if match:
            lineas = wiki_estaciones[match[0]]
            colores = [wiki_colores[l] for l in lineas if l in wiki_colores]
        else:
            lineas = []
            colores = []

        est["lineas"] = lineas
        est["colores"] = colores

        resultado.append(est)

    output = {
        "city": "Madrid",
        "category": "metro",
        "count": len(resultado),
        "items": resultado,
        "source": "Google Places + Wikipedia"
    }

    with open("data/metro_madrid_final.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=4, ensure_ascii=False)

    print(">> Fusión completada.")
    return resultado
