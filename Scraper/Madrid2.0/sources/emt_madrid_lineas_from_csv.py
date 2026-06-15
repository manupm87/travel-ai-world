# Procesa el archivo CSV oficial de líneas EMT y determina qué líneas pasan por cada intercambiador. Normaliza nombres, compara patrones y devuelve un diccionario con las líneas asociadas a cada intercambiador. 

import csv
import unicodedata
import re

from collections import defaultdict

INTERCAMBIADORES = {
    "Intercambiador de Moncloa": ["moncloa"],
    "Intercambiador de Avenida de América": ["avenida de america", "avda de america"],
    "Intercambiador de Príncipe Pío": ["principe pio", "príncipe pío"],
    "Intercambiador de Plaza de Castilla": ["plaza de castilla"],
    "Intercambiador de Conde de Casal": ["conde de casal"],
    "Intercambiador de Méndez Álvaro": ["mendez alvaro", "méndez álvaro"],
    "Intercambiador de Canillejas": ["canillejas"],
    "Intercambiador de Ciudad Lineal": ["ciudad lineal"],
    "Intercambiador de Plaza Elíptica": ["plaza eliptica", "plaza elíptica"],
}

def _norm(s: str) -> str:
    if not s:
        return ""
    s = s.lower()
    s = ''.join(
        c for c in unicodedata.normalize('NFD', s)
        if unicodedata.category(c) != 'Mn'
    )
    s = re.sub(r"\s+", " ", s)
    return s.strip()

def cargar_lineas_emt(path_csv: str) -> dict:
    """
    Devuelve: { 'Intercambiador de Moncloa': ['016','061',...], ... }
    usando nameFrom / nameTo del CSV.
    """
    lineas_por_inter = defaultdict(set)

    with open(path_csv, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            linea = row.get("line")
            name_from = _norm(row.get("nameFrom", ""))
            name_to = _norm(row.get("nameTo", ""))

            if not linea:
                continue

            for nombre_inter, patrones in INTERCAMBIADORES.items():
                for p in patrones:
                    if p in name_from or p in name_to:
                        lineas_por_inter[nombre_inter].add(linea)
                        break

    # convertir sets a listas ordenadas
    return {k: sorted(v, key=lambda x: (len(x), x)) for k, v in lineas_por_inter.items()}
