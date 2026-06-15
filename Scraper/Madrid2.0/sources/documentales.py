# Orquestador del sistema documental. Recibe el nombre de un módulo documental (historia, cultura, gastronomía, clima), valida que exista en la configuración definida en 'config/info_documental.py' y ejecuta el motor 'extraer_documental()' con los parámetros correspondientes generando los archivos JSON finales.

from config.info_documental import DOCUMENTALES
from sources.documental_general import extraer_documental


def ejecutar_documental(nombre):

    if nombre not in DOCUMENTALES:
        print(f"Documental desconocido: {nombre}")
        print(f"Disponibles: {list(DOCUMENTALES.keys())}")
        return

    cfg = DOCUMENTALES[nombre]

    return extraer_documental(
        url=cfg["url"],
        category=cfg["category"],
        output_path=f"data/{cfg['output']}",
        modo=cfg["modo"],
        section_name=cfg["section_name"]
    )
