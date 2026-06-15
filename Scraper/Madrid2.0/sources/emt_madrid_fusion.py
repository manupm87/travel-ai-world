# Fusiona los datos de los intercambiadores EMT obtenidos desde Google Places, Wikipedia y el CSV oficial de líneas

import json
import difflib
import unicodedata
import re

from sources.emt_madrid_lineas_from_csv import cargar_lineas_emt


def normalizar(nombre):
    if not nombre:
        return ""
    nombre = nombre.lower()
    nombre = ''.join(
        c for c in unicodedata.normalize('NFD', nombre)
        if unicodedata.category(c) != 'Mn'
    )
    reemplazos = [
        "intercambiador de", "estacion de autobuses", "estacion de", "estacion",
        "madrid"
    ]
    for r in reemplazos:
        nombre = nombre.replace(r, "")
    nombre = nombre.replace("-", " ")
    nombre = re.sub(r"\s+", " ", nombre)
    return nombre.strip()


def fusionar_emt():
    print(">> Fusionando datos de EMT…")

    
    # 1._ Cargar Google Places
    
    with open("data/emt_madrid.json", "r", encoding="utf-8") as f:
        google_items = json.load(f)["items"]

    
    # 2._ Cargar Wikipedia
    
    with open("data/emt_wiki_estaciones.json", "r", encoding="utf-8") as f:
        wiki = json.load(f)

    
    # 3._ Cargar colores
    
    with open("data/emt_wiki_colores.json", "r", encoding="utf-8") as f:
        colores = json.load(f)

    
    # 4._ Cargar líneas reales desde CSV
    
    print(">> Cargando líneas reales desde CSV EMT…")
    lineas_csv = cargar_lineas_emt("sources/resources/linesemt.csv")
    # El archivo linesemt.csv se obtuvo desde https://datos.madrid.es/dataset/?groups=transporte 
    
    # 5._ Normalizar Wikipedia
    
    wiki_norm = {}
    for k, v in wiki.items():
        nombre_real = k
        lineas_wiki = v.get("lineas", [])

        # Si el CSV tiene líneas reales para este intercambiador, las usamos
        lineas_finales = lineas_csv.get(nombre_real, lineas_wiki)

        wiki_norm[normalizar(k)] = {
            "nombre": nombre_real,
            "lineas": lineas_finales,
            "lat": v.get("lat"),
            "lon": v.get("lon")
        }

    items_final = []


    
    # 6._ Procesar Google Places
    
    for g in google_items:
        g_norm = normalizar(g["nombre"])

        # Matching con Wikipedia
        if g_norm in wiki_norm:
            info = wiki_norm[g_norm]
        else:
            candidatos = difflib.get_close_matches(g_norm, wiki_norm.keys(), n=1, cutoff=0.6)
            info = wiki_norm[candidatos[0]] if candidatos else None

        # Coordenadas
        lat = g.get("lat")
        lon = g.get("lon")

        if (lat is None or lon is None) and info:
            lat = info.get("lat")
            lon = info.get("lon")

        # Líneas reales
        lineas = info["lineas"] if info else ["EMT"]

        g["lineas"] = lineas
        g["colores"] = [colores.get("EMT")]

        items_final.append(g)


    
    # 7._ Añadir intercambiadores faltantes
    
    for w_norm, info in wiki_norm.items():
        if not any(normalizar(i["nombre"]) == w_norm for i in items_final):

            items_final.append({
                "id": None,
                "nombre": info["nombre"],
                "direccion": None,
                "lat": info.get("lat"),
                "lon": info.get("lon"),
                "rating": None,
                "reviews": None,
                "amenities": [],
                "fuente": "Wikipedia",
                "lineas": info["lineas"],
                "colores": [colores.get("EMT")]
            })

    
    # 8._ Deduplicar por nombre normalizado
    
    dedupe = {}
    for item in items_final:
        key = normalizar(item["nombre"])

        if key not in dedupe:
            dedupe[key] = item
        else:
            actual = dedupe[key]
            score_actual = (actual.get("rating") or 0) + (actual.get("reviews") or 0)
            score_nuevo = (item.get("rating") or 0) + (item.get("reviews") or 0)

            # Preferimos el que tenga más información útil
            if score_nuevo > score_actual:
                dedupe[key] = item

    items_final = list(dedupe.values())

    
    # 9._ Guardar salida final
    
    salida = {
        "city": "Madrid",
        "category": "emt",
        "count": len(items_final),
        "items": items_final
    }

    with open("data/emt_madrid_final.json", "w", encoding="utf-8") as f:
        json.dump(salida, f, indent=4, ensure_ascii=False)

    print(f">> Fusión completada. Intercambiadores finales: {len(items_final)}")
    return salida
