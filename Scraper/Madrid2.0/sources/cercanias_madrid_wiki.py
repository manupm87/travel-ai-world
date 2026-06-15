# Scraper de Wikipedia para obtener las estaciones oficiales de Cercanías Madrid.
# Extrae las tablas de cada línea (C1–C10), limpia los nombres y genera los archivos 'cercanias_wiki_estaciones.json' y 'cercanias_wiki_colores.json'. Estos datos se usan en la fase de fusión.

import os
import json
import requests

from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}

LINEAS = {
    "C1": "https://es.wikipedia.org/wiki/L%C3%ADnea_C-1_(Cercan%C3%ADas_Madrid)",
    "C2": "https://es.wikipedia.org/wiki/L%C3%ADnea_C-2_(Cercan%C3%ADas_Madrid)",
    "C3": "https://es.wikipedia.org/wiki/L%C3%ADnea_C-3_(Cercan%C3%ADas_Madrid)",
    "C4": "https://es.wikipedia.org/wiki/L%C3%ADnea_C-4_(Cercan%C3%ADas_Madrid)",
    "C5": "https://es.wikipedia.org/wiki/L%C3%ADnea_C-5_(Cercan%C3%ADas_Madrid)",
    "C7": "https://es.wikipedia.org/wiki/L%C3%ADnea_C-7_(Cercan%C3%ADas_Madrid)",
    "C8": "https://es.wikipedia.org/wiki/L%C3%ADnea_C-8_(Cercan%C3%ADas_Madrid)",
    "C9": "https://es.wikipedia.org/wiki/L%C3%ADnea_C-9_(Cercan%C3%ADas_Madrid)",
    "C10": "https://es.wikipedia.org/wiki/L%C3%ADnea_C-10_(Cercan%C3%ADas_Madrid)"
}

COLORES = {
    "C1": "#0072CE",
    "C2": "#E2231A",
    "C3": "#F28E00",
    "C4": "#009739",
    "C5": "#FFD700",
    "C7": "#8B008B",
    "C8": "#00A3E0",
    "C9": "#6F4E37",
    "C10": "#003DA5"
}


def limpiar(nombre):
    return nombre.replace("(Madrid)", "").strip()


def get_cercanias_wiki():
    print(">> Scrapeando Wikipedia (líneas individuales de Cercanías)…")

    estaciones = {}

    for linea, url in LINEAS.items():
        print(f"   >> Línea {linea} → {url}")

        resp = requests.get(url, headers=HEADERS)
        if resp.status_code != 200:
            print(f"      !! Error {resp.status_code} en {url}")
            continue

        soup = BeautifulSoup(resp.text, "html.parser")

        # Buscar la primera tabla wikitable
        tabla = soup.find("table", class_="wikitable")
        if not tabla:
            print(f"      !! No se encontró tabla en {linea}")
            continue

        filas = tabla.find_all("tr")[1:]  # saltar cabecera

        for fila in filas:
            cols = fila.find_all("td")
            if not cols:
                continue

            estacion = limpiar(cols[0].get_text(strip=True))
            if not estacion:
                continue

            estaciones.setdefault(estacion, [])
            if linea not in estaciones[estacion]:
                estaciones[estacion].append(linea)

    os.makedirs("data", exist_ok=True)

    with open("data/cercanias_wiki_estaciones.json", "w", encoding="utf-8") as f:
        json.dump(estaciones, f, indent=4, ensure_ascii=False)

    with open("data/cercanias_wiki_colores.json", "w", encoding="utf-8") as f:
        json.dump(COLORES, f, indent=4, ensure_ascii=False)

    print(f">> Estaciones extraídas (Wikipedia): {len(estaciones)}")
    return estaciones
