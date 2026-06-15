# Estas seran las categorias que se van a scrapear por cada zona de la ciudad definida en city_zones.py

from config.city_zones import ZONAS_BASE



CATEGORIES = {
    
    "bares": {
        "included_types": ["bar"],
        "valid_types": [
            "bar", "pub", "cocktail_bar", "wine_bar", "tapas_bar",
            "brewpub", "beer_bar", "lounge", "restaurant"
        ],
        "invalid_types": [
            "night_club", "shopping_mall", "stadium", "arena",
            "supermarket", "grocery_store", "hotel", "lodging",
            "event_venue", "sports_complex"
        ],
        "type_map": {
            "bar": "Bar",
            "pub": "Pub",
            "cocktail_bar": "Coctelería",
            "wine_bar": "Wine Bar",
            "tapas_bar": "Tapas",
            "brewpub": "Brewpub",
            "beer_bar": "Cervecería",
            "lounge": "Lounge"
        },
        "text_queries": [
            "bars in Madrid",
            "pubs in Madrid",
            "cocktail bars Madrid",
            "wine bars Madrid",
            "bares Madrid centro"
        ],
        "zones": list(ZONAS_BASE.values()),
        "normalizer": "normalize_restaurante",
        "output": "bares_madrid.json"
    },

    "hoteles": {
        "included_types": ["lodging"],
        "valid_types": ["lodging", "hotel"],
        "invalid_types": ["stadium", "shopping_mall"],
        "type_map": {},
        "text_queries": [
            "hotels in Madrid",
            "lodging Madrid",
            "accommodation Madrid",
            "hotel Madrid centro"
        ],
        "zones": list(ZONAS_BASE.values()),
        "normalizer": "normalize_hotel",
        "output": "hoteles_madrid.json"
    },

    "metro": {
        "included_types": ["subway_station"],
        "valid_types": ["subway_station", "transit_station"],
        "invalid_types": [
            "bus_station", "light_rail_station", "airport",
            "parking", "taxi_stand", "tram_station"
        ],
        "type_map": {},
        "text_queries": [
            "metro station Madrid",
            "estación de metro Madrid",
            "subway Madrid",
            "metro Madrid"
        ],
        "zones": [
            ZONAS_BASE["centro"],
            ZONAS_BASE["atocha"],
            ZONAS_BASE["moncloa"],
            ZONAS_BASE["chamartin"],
            ZONAS_BASE["vallecas"],
            ZONAS_BASE["barajas"],
        ],
        "normalizer": "normalize_metro",
        "output": "metro_madrid.json"
    },

    "monumentos": {
        "included_types": ["tourist_attraction"],
        "valid_types": [
            "monument", "landmark", "historical_landmark", "tourist_attraction"
        ],
        "invalid_types": [
            "museum", "art_gallery", "park", "natural_feature", "square",
            "church", "cathedral", "stadium", "shopping_mall", "university",
            "library", "lodging", "hotel"
        ],
        "type_map": {
            "monument": "Monumento",
            "landmark": "Lugar Emblemático",
            "historical_landmark": "Lugar Histórico",
            "tourist_attraction": "Atracción Turística"
        },
        "text_queries": [
            "monuments in Madrid",
            "historical landmarks Madrid",
            "statues Madrid",
            "monumentos Madrid",
            "lugares históricos Madrid"
        ],
        "zones": [
            ZONAS_BASE["centro"],
            ZONAS_BASE["atocha"],
            ZONAS_BASE["moncloa"],
            ZONAS_BASE["chamartin"],
            ZONAS_BASE["conde_duque"],
            ZONAS_BASE["castellana"],
        ],
        "normalizer": "normalize_monumento",
        "output": "monumentos_madrid.json"
    },

    "museos": {
        "included_types": ["museum", "art_gallery"],
        "valid_types": ["museum", "art_gallery"],
        "invalid_types": [
            "church", "cathedral", "stadium", "shopping_mall", "park",
            "university", "library", "tourist_attraction", "lodging", "hotel"
        ],
        "type_map": {
            "museum": "Museo",
            "art_gallery": "Galería de Arte"
        },
        "text_queries": [
            "museums in Madrid",
            "art galleries Madrid",
            "museos Madrid",
            "galerías de arte Madrid"
        ],
        "zones": [
            ZONAS_BASE["centro"],
            ZONAS_BASE["prado"],
            ZONAS_BASE["retiro"],
            ZONAS_BASE["atocha"],
            ZONAS_BASE["conde_duque"],
            ZONAS_BASE["castellana"],
        ],
        "normalizer": "normalize_museo",
        "output": "museos_madrid.json"
    },

    "parques": {
        "included_types": ["park"],
        "valid_types": ["park", "natural_feature", "square"],
        "invalid_types": [
            "museum", "art_gallery", "church", "cathedral", "stadium",
            "shopping_mall", "university", "library", "lodging", "hotel"
        ],
        "type_map": {
            "park": "Parque",
            "natural_feature": "Espacio Natural",
            "square": "Plaza"
        },
        "text_queries": [
            "parks in Madrid",
            "gardens Madrid",
            "plazas Madrid",
            "parques Madrid",
            "jardines Madrid"
        ],
        "zones": [
            ZONAS_BASE["centro"],
            ZONAS_BASE["prado"],
            ZONAS_BASE["retiro"],
            ZONAS_BASE["atocha"],
            ZONAS_BASE["conde_duque"],
            ZONAS_BASE["castellana"],
        ],
        "normalizer": "normalize_parque",
        "output": "parques_madrid.json"
    },

    "restaurantes": {
        "included_types": ["restaurant"],
        "valid_types": [
            "restaurant", "italian_restaurant", "japanese_restaurant",
            "mexican_restaurant", "chinese_restaurant", "burger_restaurant",
            "pizza_restaurant", "seafood_restaurant", "steak_house",
            "tapas_bar", "barbecue_restaurant", "vegan_restaurant",
            "vegetarian_restaurant", "thai_restaurant", "indian_restaurant",
            "korean_restaurant", "mediterranean_restaurant",
            "middle_eastern_restaurant", "spanish_restaurant",
            "latin_american_restaurant", "breakfast_restaurant",
            "coffee_shop", "cafe"
        ],
        "invalid_types": [
            "shopping_mall", "stadium", "arena", "supermarket",
            "grocery_store", "hotel", "lodging", "night_club",
            "event_venue", "sports_complex"
        ],
        "type_map": {
            "italian_restaurant": "Italiana",
            "japanese_restaurant": "Japonesa",
            "mexican_restaurant": "Mexicana",
            "chinese_restaurant": "China",
            "burger_restaurant": "Hamburguesas",
            "pizza_restaurant": "Pizza",
            "seafood_restaurant": "Mariscos",
            "steak_house": "Carnes",
            "tapas_bar": "Tapas",
            "barbecue_restaurant": "Barbacoa",
            "vegan_restaurant": "Vegana",
            "vegetarian_restaurant": "Vegetariana",
            "thai_restaurant": "Tailandesa",
            "indian_restaurant": "India",
            "korean_restaurant": "Coreana",
            "mediterranean_restaurant": "Mediterránea",
            "middle_eastern_restaurant": "Oriente Medio",
            "spanish_restaurant": "Española",
            "latin_american_restaurant": "Latinoamericana",
            "breakfast_restaurant": "Desayunos",
            "coffee_shop": "Cafetería",
            "cafe": "Café"
        },
        "text_queries": [
            "restaurants in Madrid",
            "best restaurants Madrid",
            "food Madrid",
            "comida Madrid centro"
        ],
        "zones": list(ZONAS_BASE.values()),
        "normalizer": "normalize_restaurante",
        "output": "restaurantes_madrid.json"
    }
}
