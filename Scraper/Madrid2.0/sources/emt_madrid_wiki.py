# Scraper de Wikipedia para obtener información de los intercambiadores EMT de Madrid.
# Extrae tablas de las páginas oficiales, obtiene líneas y coordenadas, y genera los archivos 'emt_wiki_estaciones.json' y 'emt_wiki_colores.json'. Estos datos se usan en la fase de fusión EMT.


import os
import json
import requests

from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}

COLORES = {
    "EMT": "#007BC0"
}

PAGINAS = {
    "Intercambiador de Avenida de América": "https://es.wikipedia.org/wiki/Estaci%C3%B3n_de_Avenida_de_Am%C3%A9rica",
    "Intercambiador de Moncloa": "https://es.wikipedia.org/wiki/Estaci%C3%B3n_de_Moncloa",
    "Intercambiador de Príncipe Pío": "https://es.wikipedia.org/wiki/Estaci%C3%B3n_de_Pr%C3%ADncipe_P%C3%ADo",
    "Intercambiador de Plaza de Castilla": "https://es.wikipedia.org/wiki/Estaci%C3%B3n_de_Plaza_de_Castilla",
    "Intercambiador de Conde de Casal": "https://es.wikipedia.org/wiki/Estaci%C3%B3n_de_Conde_de_Casal",
    "Intercambiador de Méndez Álvaro": "https://es.wikipedia.org/wiki/Estaci%C3%B3n_de_M%C3%A9ndez_%C3%81lvaro",
    "Intercambiador de Canillejas": "https://es.wikipedia.org/wiki/Estaci%C3%B3n_de_Canillejas",
    "Intercambiador de Ciudad Lineal": "https://es.wikipedia.org/wiki/Estaci%C3%B3n_de_Ciudad_Lineal",
    "Intercambiador de Plaza Elíptica": "https://es.wikipedia.org/wiki/Estaci%C3%B3n_de_Plaza_El%C3%ADptica"
}

def get_emt_wiki():
    print(">> Scrapeando Wikipedia (Intercambiadores EMT Madrid)…")

    estaciones = {}

    for nombre, url in PAGINAS.items():
        print(f"   >> {nombre} → {url}")

        resp = requests.get(url, headers=HEADERS)
        if resp.status_code != 200:
            print(f"      !! Error {resp.status_code} en {url}")
            continue

        soup = BeautifulSoup(resp.text, "html.parser")

        # Coordenadas
        lat = lon = None
        geo = soup.find("span", class_="geo")
        if geo:
            try:
                lat, lon = geo.get_text(strip=True).split(";")
                lat = float(lat)
                lon = float(lon)
            except:
                pass

        # Líneas EMT (si aparecen en la tabla)
        lineas = ["EMT"]

        estaciones[nombre] = {
            "lineas": lineas,
            "lat": lat,
            "lon": lon
        }

    os.makedirs("data", exist_ok=True)

    with open("data/emt_wiki_estaciones.json", "w", encoding="utf-8") as f:
        json.dump(estaciones, f, indent=4, ensure_ascii=False)

    with open("data/emt_wiki_colores.json", "w", encoding="utf-8") as f:
        json.dump(COLORES, f, indent=4, ensure_ascii=False)

    print(f">> Intercambiadores EMT extraídos: {len(estaciones)}")
    return estaciones
