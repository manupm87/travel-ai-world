
# 🗺️ Travel AI World — Data Ingestion Pipeline (Scrapers por Ciudad)

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Requests](https://img.shields.io/badge/Requests-HTTP-orange?style=for-the-badge)
![BeautifulSoup](https://img.shields.io/badge/BeautifulSoup-HTML%20Parsing-green?style=for-the-badge)
![JSON](https://img.shields.io/badge/JSON-Data-blue?style=for-the-badge)

Este módulo contiene el **pipeline de ingesta de datos** utilizado por *Travel AI World* para recopilar información estructurada de diferentes ciudades.  
Cada ciudad dispone de su propio scraper independiente, responsable de:

- Extraer datos desde **Wikipedia**, **APIs públicas**, **Geoportales** y otras fuentes oficiales.
- Normalizar y limpiar la información.
- Guardarla en formato **JSON** listo para ser convertido en embeddings.
- Servir como base para la **base de datos vectorial** que alimenta la IA del proyecto.

---

## ✨ Características

- 🏗️ **Arquitectura modular por ciudad**  
  Cada ciudad tiene su propio directorio con su scraper, configuración y utilidades.

- 🔌 **Fuentes múltiples**  
  Scraping de HTML, consumo de APIs REST, y extracción desde portales de datos abiertos.

- 🧹 **Normalización automática**  
  Limpieza de texto, estandarización de campos y estructura uniforme entre ciudades.

- 💾 **Salida en JSON**  
  Los datos generados se guardan en `scraper/<ciudad>/data/` y se excluyen del repositorio mediante `.gitignore`.

- 🧠 **Preparado para IA**  
  Los JSON generados están listos para convertirse en embeddings y alimentar una base vectorial.

---

## 📂 Estructura del Proyecto

```
scraper/
│
├── madrid/
│   ├── config.py
│   ├── main.py
│   ├── sources/
│   │   ├── wikipedia_madrid.py
│   │   ├── madrid_open_data.py
│   │   └── geoportal_madrid.py
│   ├── utils/
│   │   ├── fetch.py
│   │   ├── parse.py
│   │   └── save.py
│   ├── data/        # Ignorado por Git
│   └── README.md
│
├── berlin/          
├── budapest/        
└── otras ciudades/            # (solo si da tiempo de agregar mas ciudades)
```

Cada ciudad es completamente independiente y puede evolucionar sin afectar a las demás.

---

## 🚀 Cómo ejecutar un scraper

Desde la raíz del proyecto:

```bash
cd scraper/madrid
python main.py
```

Esto ejecutará todos los scrapers definidos para la ciudad y generará los JSON en:

```
scraper/madrid/data/
```

---

## 🛠️ Dependencias

Cada scraper utiliza:

- `requests` — para descargar HTML y JSON  
- `beautifulsoup4` — para parsear HTML  
- `lxml` (opcional) — parser rápido para BeautifulSoup  
- `json` — para guardar datos  
- `os` — para manejo de rutas  

Instalación recomendada:

```bash
pip install -r requirements.txt
```

*(Cada ciudad puede tener su propio `requirements.txt` si lo necesita.)*

---

## 🧩 Cómo crear un scraper para una nueva ciudad

1. Crear una carpeta dentro de `scraper/`:

```
scraper/<ciudad>/
```

2. Copiar la estructura base:

```
config.py
main.py
sources/
utils/
data/
```

3. Configurar las URLs y endpoints en `config.py`.

4. Implementar los scrapers dentro de `sources/`.

5. Ejecutar `main.py` para generar los JSON.

---

## 🧼 `.gitignore`

Cada ciudad incluye un `.gitignore` que excluye:

```
data/
*.json
__pycache__/
*.pyc
```

Esto evita subir datos generados al repositorio.

---

## 📌 Objetivo del módulo

Este pipeline de ingesta proporciona **datos limpios, estructurados y actualizados** para alimentar la IA del proyecto.  
Es un componente clave del sistema, pero **independiente del backend y del frontend**, siguiendo buenas prácticas de arquitectura.

---

## 👥 Contribuciones

Cada miembro del equipo puede trabajar en su propia ciudad sin interferir con los demás.  
Las PR deben realizarse desde ramas individuales hacia `main`.

---

## 📄 Licencia

Este módulo forma parte del proyecto **Travel AI World**.  
Uso interno para el equipo del máster.
