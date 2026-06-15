# 🏙️ Madrid 2.0 — Scraper Oficial de Travel AI World

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python)
![Google Places](https://img.shields.io/badge/Google%20Places-API-blue?style=for-the-badge)
![Wikipedia](https://img.shields.io/badge/Wikipedia-Scraper-black?style=for-the-badge)
![JSON](https://img.shields.io/badge/JSON-Data-green?style=for-the-badge)


**Madrid 2.0 (Unified)** es la versión optimizada del scraper oficial de *Travel AI World*, diseñado para generar datos limpios, completos y estructurados sobre la ciudad de Madrid **o cualquier otra ciudad del mundo**, cambiando únicamente las coordenadas.

Esta versión introduce mejoras clave respecto a la versión original:

- Menos archivos  
- Más lógica centralizada  
- Un motor unificado para Google Places  
- Un motor unificado para documentales  
- Un pipeline mucho más fácil de mantener y escalar  

---

# 🚀 ¿Qué cambia en esta versión?

## 🟩 1. Unificación y eliminación de scrapers duplicados  
En versiones anteriores, cada categoría tenía su propio archivo:

```
hoteles_madrid.py
restaurantes_madrid.py
bares_madrid.py
...
```

Ahora todo eso se reemplaza por un **único motor universal**:

```
sources/scraper_general.py
```

Este motor puede scrapear cualquier categoría definida en:

```
config/categories.py
```

---

## 🟩 2. Configuración centralizada mediante variables  
Toda la lógica de scraping está ahora en archivos de configuración:

- `config/categories.py` → categorías de Google Places  
- `config/documentales.py` → módulos documentales de Wikipedia  
- `config/city_zones.py` → coordenadas de la ciudad a scrapear  

Esto permite:

### ✔ Scrapear otra ciudad cambiando solo las coordenadas  
### ✔ Añadir nuevas categorías sin modificar el scraper  
### ✔ Mantener el proyecto limpio, modular y escalable  

---

## 🟩 3. Motor documental unificado  
Los scrapers de:

- historia  
- cultura  
- gastronomía  
- clima  

antes eran 4 archivos independientes.  
Ahora están unificados en:

```
sources/documental_general.py
```

Y se ejecutan mediante:

```
sources/documentales.py
```

Esto elimina duplicación y facilita añadir nuevos módulos narrativos.

---

## 📂 4. Estructura del proyecto simplificada y profesional

```
Madrid2.0/
│
├── main.py                     # Orquestador del pipeline completo
│
├── config/                     # Configuración centralizada
│   ├── categories.py           # Categorías de Google Places
│   ├── city_zones.py           # Coordenadas de la ciudad
│   ├── env.py                  # API Key de Google
│   ├── google_places.py        # URLs del API de Google
│   └── documentales.py         # Configuración de documentales
│
├── core/
│   ├── utils.py                # Utilidades generales
│   └── http_client.py          # Cliente HTTP centralizado
│
├── sources/                    # Motores y scrapers
│   ├── scraper_general.py      # Motor universal Google Places
│   ├── documental_general.py   # Motor universal Wikipedia
│   ├── documentales.py         # Ejecutor documental
│   ├── metro_*                 # Metro (Wiki + Google + fusión)
│   ├── cercanias_*             # Cercanías (Wiki + Google + fusión)
│   ├── emt_*                   # EMT (Wiki + Google + fusión)
│   ├── iglesias_palacios_*     # Iglesias/Palacios (Google + Wiki + fusión)
│   └── resources/              # CSV internos (ej. EMT)
│
├── data/                       # Datos generados (solo JSON finales)
│
└── README.md
```

### ✔ `/data` contiene solo resultados finales  
### ✔ `/sources` contiene toda la lógica  
### ✔ `/config` controla el comportamiento del scraper  

---

## 🟦 Google Places API (New)

El scraper utiliza:

- **Nearby Search**  
- **Text Search**  
- **Place Details**  

Para obtener:

- nombre  
- dirección  
- coordenadas  
- rating  
- reseñas  
- tipos  
- horarios  
- teléfono  
- website  

Todo normalizado y listo para IA.

---

## 🟦 Wikipedia (REST API)

El motor documental extrae:

- Historia  
- Cultura  
- Gastronomía  
- Clima  

Cada módulo se guarda como JSON independiente, ideal para:

- embeddings  
- bases vectoriales  
- sistemas RAG  
- modelos LLM  

---

## 🌍 ¿Cómo scrapear otras ciudades?

Solo cambia las coordenadas en:

```
config/city_zones.py
```

El scraper hará el resto:

- zonas  
- nearby search  
- text search  
- filtrado  
- normalización  
- JSON final  

No se necesita modificar nada más.

---

## 🧠 ¿Qué aporta esta versión unificada?

### ✔ Código más limpio  
### ✔ Arquitectura más profesional  
### ✔ Menos archivos, más lógica centralizada  
### ✔ Preparado para scrapear cualquier ciudad  
### ✔ Datos listos para embeddings y RAG  
### ✔ Pipeline estable y reproducible  

---

## ▶️ Cómo ejecutar

Desde una consola Bash o PowerShell (Python 3.10+):

```bash
python main.py
```

Esto ejecuta:

- todos los scrapers  
- todas las fusiones  
- todos los documentales  
- y genera todos los JSON finales  

---

# 📈 Diferencias clave con Madrid 2.0 original

| Característica    | Madrid 2.0 Original | Madrid 2.0 Unificado |
|------------------|---------------------|------------------------|
| Scrapers         | Muchos archivos     | Motor único           |
| Configuración    | Dispersa            | Centralizada          |
| Escalabilidad    | Limitada            | Global (cualquier ciudad) |
| Documentales     | 4 scrapers          | Motor único           |
| Mantenimiento    | Alto                | Muy bajo              |
| Código duplicado | Mucho               | Eliminado             |
| Uso para IA      | Bueno               | Óptimo                |

---
