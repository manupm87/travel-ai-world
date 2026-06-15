# Configuracion de los modulos documentales extraidos desde Wikipedia, se definen las urls de las paginas a scrapear, en este caso usamos Wikipedia.


DOCUMENTALES = {
    "historia": {
        "url": "https://es.wikipedia.org/api/rest_v1/page/html/Historia_de_Madrid",
        "category": "historia",
        "output": "historia_madrid.json",
        "modo": "all",
        "section_name": None
    },

    "cultura": {
        "url": "https://es.wikipedia.org/api/rest_v1/page/html/Madrid",
        "category": "cultura",
        "output": "cultura_madrid.json",
        "modo": "single",
        "section_name": "Cultura"
    },

    "gastronomia": {
        "url": "https://es.wikipedia.org/api/rest_v1/page/html/Gastronomía_de_Madrid",
        "category": "gastronomia",
        "output": "gastronomia_madrid.json",
        "modo": "all",
        "section_name": None
    },

    "clima": {
        "url": "https://es.wikipedia.org/api/rest_v1/page/html/Clima_de_Madrid",
        "category": "clima",
        "output": "clima_madrid.json",
        "modo": "all",
        "section_name": None
    }
}
