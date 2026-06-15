# Funciones de normalización para los datos obtenidos desde Google Places API (New).
# Cada función transforma la respuesta cruda de Google en un diccionario uniforme, limpio y consistente, adaptado a cada categoría (hoteles, restaurantes, museos, parques, monumentos, metro, iglesias/palacios). 
# Este módulo centraliza toda la lógica de estandarización para garantizar que los JSON finales tengan la misma estructura y calidad de datos.

def normalize_hotel(place):
    return {
        "id": place.get("id"),
        "nombre": place.get("displayName", {}).get("text"),
        "direccion": place.get("formattedAddress"),
        "lat": place.get("location", {}).get("latitude"),
        "lon": place.get("location", {}).get("longitude"),
        "estrellas": None,  # Google Places (New) no da estrellas
        "amenities": place.get("types", []),
        "rating": place.get("rating"),
        "reviews": place.get("userRatingCount"),
        "descripcion": "",
        "fotos": [],
        "fuente": "Google Places (New)"
    }

def normalize_restaurante(r, tipos_comida):
    return {
        "id": r.get("id"),
        "nombre": r.get("displayName", {}).get("text"),
        "direccion": r.get("formattedAddress"),
        "lat": r.get("location", {}).get("latitude"),
        "lon": r.get("location", {}).get("longitude"),
        "rating": r.get("rating"),
        "reviews": r.get("userRatingCount"),
        "tipo_comida": tipos_comida,
        "amenities": r.get("types", []),
        "fuente": "Google Places (New)"
    }

def normalize_museo(place, tipos_museo):
    return {
        "id": place.get("id"),
        "nombre": place.get("displayName", {}).get("text"),
        "direccion": place.get("formattedAddress"),
        "lat": place.get("location", {}).get("latitude"),
        "lon": place.get("location", {}).get("longitude"),
        "rating": place.get("rating"),
        "reviews": place.get("userRatingCount"),
        "tipo_museo": tipos_museo,
        "amenities": place.get("types", []),
        "fuente": "Google Places (New)"
    }

def normalize_parque(place, tipos_parque):
    return {
        "id": place.get("id"),
        "nombre": place.get("displayName", {}).get("text"),
        "direccion": place.get("formattedAddress"),
        "lat": place.get("location", {}).get("latitude"),
        "lon": place.get("location", {}).get("longitude"),
        "rating": place.get("rating"),
        "reviews": place.get("userRatingCount"),
        "tipo_parque": tipos_parque,
        "amenities": place.get("types", []),
        "fuente": "Google Places (New)"
    }

def normalize_monumento(place, tipos_monumento):
    return {
        "id": place.get("id"),
        "nombre": place.get("displayName", {}).get("text"),
        "direccion": place.get("formattedAddress"),
        "lat": place.get("location", {}).get("latitude"),
        "lon": place.get("location", {}).get("longitude"),
        "rating": place.get("rating"),
        "reviews": place.get("userRatingCount"),
        "tipo_monumento": tipos_monumento,
        "amenities": place.get("types", []),
        "fuente": "Google Places (New)"
    }

def normalize_metro(place, lineas):
    return {
        "id": place.get("id"),
        "nombre": place.get("displayName", {}).get("text"),
        "direccion": place.get("formattedAddress"),
        "lat": place.get("location", {}).get("latitude"),
        "lon": place.get("location", {}).get("longitude"),
        "rating": place.get("rating"),
        "reviews": place.get("userRatingCount"),
        "lineas": lineas,  # se rellenará después con Wikipedia
        "amenities": place.get("types", []),
        "fuente": "Google Places (New)"
    }

def normalize_iglesias_palacios(place, tipos):
    return {
        "id": place.get("id"),
        "nombre": place.get("displayName", {}).get("text"),
        "direccion": place.get("formattedAddress"),
        "lat": place.get("location", {}).get("latitude"),
        "lon": place.get("location", {}).get("longitude"),
        "rating": place.get("rating"),
        "reviews": place.get("userRatingCount"),
        "amenities": place.get("types", []),
        "tipo": tipos,  # ["Iglesia"] o ["Palacio"]
        "fuente": "Google Places (New)"
    }
