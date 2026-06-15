# Este es el controlador principal del pipeline de scraping y generación de datasets de Travel AI World - Madrid 2.0. 
# Ejecuta de forma secuencial todos los módulos de extracción (Google Places y Wikipedia), fusión de datos y generación de documentales. 
# Cada bloque se ejecuta de manera segura mediante 'run_safe()' para garantizar que un error en un módulo no detenga el pipeline completo.
# Produce todos los archivos JSON finales en la carpeta 'data/'.

from sources.scraper_general import ejecutar_scraper

from sources.metro_madrid_wiki import get_metro_wiki
from sources.metro_fusion import fusionar_metro

from sources.cercanias_madrid_wiki import get_cercanias_wiki
from sources.cercanias_madrid_google import get_cercanias_google
from sources.cercanias_madrid_fusion import fusionar_cercanias

from sources.emt_madrid_wiki import get_emt_wiki
from sources.emt_madrid_google import get_emt_google
from sources.emt_madrid_fusion import fusionar_emt

from sources.iglesias_palacios_madrid import get_iglesias_palacios_madrid
from sources.iglesias_palacios_wiki import generar_wiki_iglesias_palacios
from sources.iglesias_palacios_fusion import fusionar_iglesias_palacios

from sources.documentales import ejecutar_documental

import traceback


def run_safe(nombre, funcion):
    print("\n----------------------------------------")
    print(f"   Ejecutando: {nombre}")
    print("----------------------------------------")

    try:
        funcion()
        print(f">> {nombre}: OK")
    except Exception as e:
        print(f">> ERROR en {nombre}: {e}")
        traceback.print_exc()
        print(">> Continuando con el siguiente módulo…")


def main():
    print("========================================")
    print("   Travel AI World - Madrid 2.0 (Unified)")
    print("========================================\n")

    
    # POIs (Google Places)
    
    run_safe("Hoteles", lambda: ejecutar_scraper("hoteles"))
    run_safe("Restaurantes", lambda: ejecutar_scraper("restaurantes"))
    run_safe("Bares", lambda: ejecutar_scraper("bares"))
    run_safe("Museos", lambda: ejecutar_scraper("museos"))
    run_safe("Parques", lambda: ejecutar_scraper("parques"))
    run_safe("Monumentos", lambda: ejecutar_scraper("monumentos"))

    
    # METRO
    
    run_safe("Metro - Wikipedia", get_metro_wiki)
    run_safe("Metro - Google Places", lambda: ejecutar_scraper("metro"))
    run_safe("Metro - Fusionar", fusionar_metro)

    
    # CERCANÍAS
    
    run_safe("Cercanías - Wikipedia", get_cercanias_wiki)
    run_safe("Cercanías - Google Places", get_cercanias_google)
    run_safe("Cercanías - Fusionar", fusionar_cercanias)

    
    # EMT
    
    run_safe("EMT - Wikipedia", get_emt_wiki)
    run_safe("EMT - Google Places", get_emt_google)
    run_safe("EMT - Fusionar", fusionar_emt)

    
    # IGLESIAS Y PALACIOS
    
    run_safe("Iglesias/Palacios - Google Places", get_iglesias_palacios_madrid)
    run_safe("Iglesias/Palacios - Wikipedia", generar_wiki_iglesias_palacios)
    run_safe("Iglesias/Palacios - Fusionar", fusionar_iglesias_palacios)

    
    # DOCUMENTALES (Wikipedia)
    
    print("\n========================================")
    print("   MÓDULO DOCUMENTALES - MADRID")
    print("========================================")

    run_safe("Historia de Madrid", lambda: ejecutar_documental("historia"))
    run_safe("Cultura de Madrid", lambda: ejecutar_documental("cultura"))
    run_safe("Gastronomía de Madrid", lambda: ejecutar_documental("gastronomia"))
    run_safe("Clima de Madrid", lambda: ejecutar_documental("clima"))

    print("\n========================================")
    print("   PIPELINE COMPLETO FINALIZADO")
    print("========================================")


if __name__ == "__main__":
    main()
