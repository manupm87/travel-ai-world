"""Normalize the final Madrid scraper datasets into retrieval-ready JSONL."""

import json
import re
import unicodedata
from collections.abc import Iterable
from pathlib import Path
from typing import Any


DATA_DIR = Path(__file__).parent / "data"
OUTPUT_FILE = DATA_DIR / "documents_madrid.jsonl"
SOURCE_FILES = (
    "hoteles_madrid.json",
    "restaurantes_madrid.json",
    "bares_madrid.json",
    "museos_madrid.json",
    "parques_madrid.json",
    "monumentos_madrid.json",
    "metro_madrid_final.json",
    "cercanias_madrid_final.json",
    "emt_madrid_final.json",
    "iglesias_palacios_final.json",
    "historia_madrid.json",
    "cultura_madrid.json",
    "gastronomia_madrid.json",
    "clima_madrid.json",
)
RECORD_LABELS = {
    "direccion": "Direccion",
    "rating": "Valoracion",
    "reviews": "Resenas",
    "amenities": "Servicios",
    "lineas": "Lineas",
    "tipo": "Tipo",
    "tipo_comida": "Tipo de comida",
    "tipo_monumento": "Tipo de monumento",
    "tipo_parque": "Tipo de parque",
    "estrellas": "Estrellas",
    "historia": "Historia",
    "estilo": "Estilo arquitectonico",
    "año_construccion": "Ano de construccion",
    "arquitecto": "Arquitecto",
}
METADATA_FIELDS = {
    "direccion": "address",
    "lat": "latitude",
    "lon": "longitude",
    "rating": "rating",
    "reviews": "reviews",
    "amenities": "amenities",
    "lineas": "lines",
    "colores": "line_colors",
    "tipo": "type",
    "tipo_comida": "food_type",
    "tipo_monumento": "monument_type",
    "tipo_parque": "park_type",
    "estrellas": "stars",
    "historia": "history",
    "estilo": "architectural_style",
    "año_construccion": "construction_year",
    "arquitecto": "architect",
}


def serialize(value: Any) -> str:
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return str(value)


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", ascii_value).strip("-")


def build_record_document(
    record: dict[str, Any], dataset: dict[str, Any], source_file: str
) -> dict[str, Any]:
    city = str(dataset["city"])
    category = str(dataset["category"])
    source = str(record["fuente"])
    place_id = record.get("id")
    name = str(record["nombre"])
    record_id = (
        f"{slugify(category)}-{place_id}"
        if place_id
        else "-".join(
            (
                slugify(category),
                slugify(name),
                slugify(serialize(record.get("lat", ""))),
                slugify(serialize(record.get("lon", ""))),
            )
        )
    )

    content_parts = [f"{name} es un lugar de categoria {category} en {city}."]
    for field, label in RECORD_LABELS.items():
        value = record.get(field)
        if value not in (None, "", []):
            content_parts.append(f"{label}: {serialize(value)}.")

    metadata = {
        "city": city,
        "category": category,
        "source": source,
        "source_file": source_file,
        "name": name,
    }
    for field, metadata_key in METADATA_FIELDS.items():
        value = record.get(field)
        if value not in (None, "", []):
            metadata[metadata_key] = serialize(value)

    if place_id:
        metadata["place_id"] = str(place_id)
    return {
        "id": record_id,
        "content": " ".join(content_parts),
        "metadata": metadata,
    }


def build_section_document(
    section: dict[str, Any], dataset: dict[str, Any], source_file: str
) -> dict[str, Any]:
    city = str(dataset["city"])
    category = str(dataset["category"])
    title = str(section["title"])
    summary = str(section["summary"])
    source = str(section["source"])
    section_slug = slugify(title)
    if not section_slug:
        raise ValueError(f"Section title has no usable ID in {source_file}: {title!r}")

    return {
        "id": f"{slugify(city)}-{slugify(category)}-{section_slug}",
        "content": f"{category.capitalize()} de {city}. {title}: {summary}",
        "metadata": {
            "city": city,
            "category": category,
            "source": source,
            "source_file": source_file,
            "title": title,
            "language": "es",
        },
    }


def normalize_dataset(path: Path) -> Iterable[dict[str, Any]]:
    with path.open(encoding="utf-8") as dataset_file:
        dataset = json.load(dataset_file)

    if not isinstance(dataset, dict):
        raise ValueError(f"Dataset must be an object: {path.name}")
    if "items" in dataset:
        return [
            build_record_document(record, dataset, path.name)
            for record in dataset["items"]
        ]
    if "sections" in dataset:
        return [
            build_section_document(section, dataset, path.name)
            for section in dataset["sections"]
        ]
    raise ValueError(f"Dataset has neither items nor sections: {path.name}")


def validate_document(document: dict[str, Any], known_ids: set[str]) -> None:
    document_id = document["id"]
    if not document_id or not document["content"].strip():
        raise ValueError(f"Document requires a non-empty id and content: {document_id!r}")
    if document_id in known_ids:
        raise ValueError(f"Duplicate document ID: {document_id}")
    required_metadata = {"city", "category", "source", "source_file"}
    missing_metadata = required_metadata - document["metadata"].keys()
    if missing_metadata:
        raise ValueError(
            f"Document {document_id} has missing metadata: {sorted(missing_metadata)}"
        )
    empty_metadata = sorted(
        key for key in required_metadata if not str(document["metadata"][key]).strip()
    )
    if empty_metadata:
        raise ValueError(
            f"Document {document_id} has empty metadata: {empty_metadata}"
        )
    known_ids.add(document_id)


def main() -> None:
    documents: list[dict[str, Any]] = []
    known_ids: set[str] = set()

    for source_file in SOURCE_FILES:
        source_path = DATA_DIR / source_file
        if not source_path.is_file():
            raise FileNotFoundError(f"Required dataset not found: {source_path}")
        for document in normalize_dataset(source_path):
            validate_document(document, known_ids)
            documents.append(document)

    with OUTPUT_FILE.open("w", encoding="utf-8") as output_file:
        for document in documents:
            output_file.write(json.dumps(document, ensure_ascii=False))
            output_file.write("\n")

    print(f"Generated {len(documents)} documents in {OUTPUT_FILE}")


if __name__ == "__main__":
    main()