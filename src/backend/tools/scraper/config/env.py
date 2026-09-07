# Carga la API key de Google desde el archivo .env para mantenerla segura y no exponerla en el codigo fuente.


import os

from dotenv import load_dotenv

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
