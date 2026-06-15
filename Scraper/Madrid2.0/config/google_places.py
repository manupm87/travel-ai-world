# Define los endpoints de la API de Google Places que se utilizaron para obtener los datos de los POIs. Se han actualizado a los nuevos endpoints de la API v1, se mantienen los antiguos para referencia.

# Antiguos endpoints de Google Places API

#GOOGLE_NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
#GOOGLE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"

# Nuevo endpoint de Google Places API

GOOGLE_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"
GOOGLE_TEXT_URL = "https://places.googleapis.com/v1/places:searchText"
