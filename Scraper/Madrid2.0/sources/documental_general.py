# Es el motor universal para extraer contenido documental desde Wikipedia usando la REST API.
# Descarga el HTML del artículo, identifica secciones (h2) y párrafos (p), y genera un JSON estructurado con las secciones narrativas. 
# Este módulo es utilizado por 'documentales.py' para generar los datasets narrativos de Historia, Cultura, Gastronomía y Clima.

import requests

from bs4 import BeautifulSoup

import json
import os


def extraer_documental(url, category, output_path, modo="all", section_name=None):

    print(f">> {category.capitalize()} de Madrid - Wikipedia REST API…")

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/123.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html"
    }

    r = requests.get(url, headers=headers)
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")

    sections = []
    current_title = None
    current_text = []
    capture = False

    for elem in soup.find_all(["h2", "p"]):

        # MODO SINGLE
        if modo == "single":
            if elem.name == "h2":
                title = elem.get_text(strip=True)

                if section_name in title:
                    capture = True
                    current_title = section_name
                    continue

                if capture:
                    break

            if capture and elem.name == "p":
                txt = elem.get_text(strip=True)
                if txt:
                    current_text.append(txt)

        # MODO ALL
        else:
            if elem.name == "h2":
                if current_title and current_text:
                    sections.append({
                        "title": current_title,
                        "summary": " ".join(current_text).strip(),
                        "source": "Wikipedia REST API"
                    })
                    current_text = []

                current_title = elem.get_text(strip=True)

            elif elem.name == "p":
                txt = elem.get_text(strip=True)
                if txt:
                    current_text.append(txt)

    # Última sección
    if current_title and current_text:
        sections.append({
            "title": current_title,
            "summary": " ".join(current_text).strip(),
            "source": "Wikipedia REST API"
        })

    os.makedirs("data", exist_ok=True)

    final = {
        "city": "Madrid",
        "category": category,
        "sections": sections
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(final, f, indent=4, ensure_ascii=False)

    print(f">> {category.capitalize()} de Madrid guardado. Secciones: {len(sections)}")
    return final
