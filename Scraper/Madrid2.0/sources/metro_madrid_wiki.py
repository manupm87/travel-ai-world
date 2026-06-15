# Scraper de Wikipedia para obtener las estaciones oficiales del Metro de Madrid.

import os
import json
import requests

from bs4 import BeautifulSoup

WIKI_BASE = "https://es.wikipedia.org"
LINEAS = {
    "L1": "/wiki/L%C3%ADnea_1_(Metro_de_Madrid)",
    "L2": "/wiki/L%C3%ADnea_2_(Metro_de_Madrid)",
    "L3": "/wiki/L%C3%ADnea_3_(Metro_de_Madrid)",
    "L4": "/wiki/L%C3%ADnea_4_(Metro_de_Madrid)",
    "L5": "/wiki/L%C3%ADnea_5_(Metro_de_Madrid)",
    "L6": "/wiki/L%C3%ADnea_6_(Metro_de_Madrid)",
    "L7": "/wiki/L%C3%ADnea_7_(Metro_de_Madrid)",
    "L8": "/wiki/L%C3%ADnea_8_(Metro_de_Madrid)",
    "L9": "/wiki/L%C3%ADnea_9_(Metro_de_Madrid)",
    "L10": "/wiki/L%C3%ADnea_10_(Metro_de_Madrid)",
    "L11": "/wiki/L%C3%ADnea_11_(Metro_de_Madrid)",
    "L12": "/wiki/L%C3%ADnea_12_(Metro_de_Madrid)",
    "R": "/wiki/Ramal_Opera-Pr%C3%ADncipe_P%C3%ADo"
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/123.0 Safari/537.36"
}

COLORES = {
    "L1": "#00A1E0", "L2": "#E41A1C", "L3": "#FFD700", "L4": "#8B4513",
    "L5": "#008000", "L6": "#808080", "L7": "#FF7F00", "L8": "#800080",
    "L9": "#FF1493", "L10": "#00008B", "L11": "#006400", "L12": "#FFD700",
    "R": "#000000"
}


def limpiar(nombre):
    return nombre.replace("(Metro de Madrid)", "").replace("(Madrid)", "").strip()


def get_metro_wiki():
    print(">> Scrapeando Wikipedia (líneas individuales)…")

    estaciones = {}

    for linea, path in LINEAS.items():
        url = WIKI_BASE + path
        print(f"   >> Línea {linea}")

        resp = requests.get(url, headers=HEADERS)
        if resp.status_code != 200:
            print(f"      !! Error {resp.status_code} en {url}")
            continue

        soup = BeautifulSoup(resp.text, "html.parser")

        tablas = soup.find_all("table", class_="wikitable")
        if not tablas:
            print(f"      !! No se encontraron tablas en {linea}")
            continue

        tabla = max(tablas, key=lambda t: len(t.find_all("tr")))

        for fila in tabla.find_all("tr")[1:]:
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

    with open("data/metro_wiki_estaciones.json", "w", encoding="utf-8") as f:
        json.dump(estaciones, f, indent=4, ensure_ascii=False)

    with open("data/metro_wiki_colores.json", "w", encoding="utf-8") as f:
        json.dump(COLORES, f, indent=4, ensure_ascii=False)

    print(f">> Estaciones extraídas (Wikipedia): {len(estaciones)}")
    return estaciones
