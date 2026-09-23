# Memoria técnica (LaTeX)

`main.tex` es la memoria del Proyecto Júpiter (TFM del máster en IA, Cloud Computing y DevOps; guion en `docs/Guion PJ IA.pdf`): producto, mercado y viabilidad, arquitectura de
software, IA (corpus, RAG, spike Qdrant vs S3 Vectors, orquestador), nube, entorno de desarrollo,
CI/CD y proceso con agentes, SRE y análisis crítico. Doble columna, ≤ 20 páginas (hoy 18), en español; autores: Manuel Pérez, Alexander De Sousa, Joaquín Castro Salas, David Baos.

- Una sección por archivo en `sections/`; bibliografía compartida en `referencias.bib`.
- Compilar: `tectonic main.tex` (XeTeX; descarga los paquetes la primera vez) o
  `latexmk -xelatex main.tex` con una TeX Live completa. Fuentes: TeX Gyre (en el bundle).
- `check-section.sh <NN-slug> [...]` compila solo esas secciones para localizar errores.
- `main.pdf` se regenera; no se versionan los intermedios (`.log`, `.blg`, `.aux`).

Las cifras salen del repositorio (ADR, `docs/architecture/vector-store-spike.md`, recuentos con
`git`/`gh`/`wc`) y del estudio de mercado citado en la bibliografía; el texto distingue lo medido,
lo estimado y lo contado.
