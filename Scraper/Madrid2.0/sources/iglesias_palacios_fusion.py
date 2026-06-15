# Fusiona los datos de Iglesias y Palacios obtenidos desde Google Places (New) con la información enriquecida extraída desde Wikipedia.

import json
import unicodedata
import re
import difflib
import os


def normalizar(nombre):
    if not nombre:
        return ""
    nombre = nombre.lower()
    nombre = ''.join(
        c for c in unicodedata.normalize('NFD', nombre)
        if unicodedata.category(c) != 'Mn'
    )
    nombre = re.sub(r"\s+", " ", nombre)
    return nombre.strip()


def fusionar_iglesias_palacios(
        path_google="data/iglesias_palacios_google.json",
        path_wiki="data/iglesias_palacios_wiki.json",
        path_salida="data/iglesias_palacios_final.json"):

    print(">> Fusionando Iglesias y Palacios…")

    with open(path_google, "r", encoding="utf-8") as f:
        google_items = json.load(f)["items"]

    with open(path_wiki, "r", encoding="utf-8") as f:
        wiki = json.load(f)

    items_final = []

    # Fusionar Google + Wikipedia
    for g in google_items:
        g_norm = normalizar(g["nombre"])

        # Matching Wikipedia
        candidatos = difflib.get_close_matches(
            g_norm,
            [normalizar(k) for k in wiki.keys()],
            n=1,
            cutoff=0.6
        )

        datos_wiki = None
        if candidatos:
            for k in wiki.keys():
                if normalizar(k) == candidatos[0]:
                    datos_wiki = wiki[k]
                    break

        g["historia"] = datos_wiki.get("historia") if datos_wiki else None
        g["estilo"] = datos_wiki.get("estilo") if datos_wiki else None
        g["año_construccion"] = datos_wiki.get("año_construccion") if datos_wiki else None
        g["arquitecto"] = datos_wiki.get("arquitecto") if datos_wiki else None

        items_final.append(g)

    # Deduplicar
    dedupe = {}
    for item in items_final:
        key = normalizar(item["nombre"])
        if key not in dedupe:
            dedupe[key] = item
        else:
            actual = dedupe[key]
            score_actual = (actual.get("rating") or 0) + (actual.get("reviews") or 0)
            score_nuevo = (item.get("rating") or 0) + (item.get("reviews") or 0)
            if score_nuevo > score_actual:
                dedupe[key] = item

    items_final = list(dedupe.values())

    salida = {
        "city": "Madrid",
        "category": "iglesias_palacios",
        "count": len(items_final),
        "items": items_final
    }

    os.makedirs("data", exist_ok=True)

    with open(path_salida, "w", encoding="utf-8") as f:
        json.dump(salida, f, indent=4, ensure_ascii=False)

    print(f">> Fusión completada. Total final: {len(items_final)}")
    return salida
