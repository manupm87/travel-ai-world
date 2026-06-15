# Scraper de Wikipedia para Iglesias y Palacios de Madrid. Extrae historia, estilo arquitectónico, arquitecto y año de construcción desde la página oficial de cada POI.

import json
import requests

from bs4 import BeautifulSoup

import unicodedata
import re
import os
import difflib

from sources.iglesias_palacios_wiki_names import WIKI_NOMBRES


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


def extraer_wikipedia(nombre):
    url = f"https://es.wikipedia.org/wiki/{nombre.replace(' ', '_')}"
    r = requests.get(url)

    if r.status_code != 200:
        return None

    soup = BeautifulSoup(r.text, "html.parser")

    # Primer párrafo largo
    historia = None
    for p in soup.select("p"):
        txt = p.get_text().strip()
        if len(txt) > 120:
            historia = txt
            break

    estilo = None
    arquitecto = None
    anio = None

    infobox = soup.select_one(".infobox")
    if infobox:
        for fila in infobox.select("tr"):
            th = fila.find("th")
            td = fila.find("td")
            if not th or not td:
                continue

            campo = normalizar(th.get_text())
            valor = td.get_text().strip()

            if "estilo" in campo:
                estilo = valor
            if "arquitect" in campo:
                arquitecto = valor
            if "constru" in campo or "fund" in campo:
                anio = valor

    return {
        "historia": historia,
        "estilo": estilo,
        "año_construccion": anio,
        "arquitecto": arquitecto
    }


def generar_wiki_iglesias_palacios(path_google="data/iglesias_palacios_google.json",
                                   path_salida="data/iglesias_palacios_wiki.json"):

    print(">> Extrayendo información de Wikipedia para Iglesias y Palacios…")

    with open(path_google, "r", encoding="utf-8") as f:
        google_items = json.load(f)["items"]

    salida = {}

    # Pre-normalizamos nombres de Wikipedia
    wiki_norm = {normalizar(w): w for w in WIKI_NOMBRES}

    for item in google_items:
        nombre_google = item["nombre"]
        nombre_original = item.get("nombre_original", nombre_google)

        nombre_original_norm = normalizar(nombre_original)

        # Matching difuso usando el nombre ORIGINAL
        candidato = difflib.get_close_matches(
            nombre_original_norm,
            wiki_norm.keys(),
            n=1,
            cutoff=0.4
        )

        if not candidato:
            print(f"   >> No match para: {nombre_original}")
            continue

        nombre_wiki = wiki_norm[candidato[0]]

        datos = extraer_wikipedia(nombre_wiki)
        if datos:
            salida[nombre_google] = datos

    os.makedirs("data", exist_ok=True)

    with open(path_salida, "w", encoding="utf-8") as f:
        json.dump(salida, f, indent=4, ensure_ascii=False)

    print(f">> Wikipedia procesada. Entradas: {len(salida)}")
    return salida
