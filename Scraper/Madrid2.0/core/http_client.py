# Cliente HTTP simple para realizar peticiones GET.

import requests

def http_get(url, headers=None, params=None):
    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()
    return response.json()
