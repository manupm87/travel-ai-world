# Memoria del proyecto (LaTeX)

`main.tex` es la memoria del Proyecto Júpiter (TFM del Máster en IA, Cloud Computing y DevOps;
guion en `docs/Guion PJ IA.pdf`). Está escrita en español, a dos
columnas, y sigue los apartados a–i del guion: resumen e introducción, caso de negocio, equipo y
contribución individual, arquitectura técnica (actual y objetivo), solución de IA, DevOps, modelos,
evaluación y conclusiones. [`main.pdf`](main.pdf) es la versión compilada.

## Estructura

| Ruta | Contenido |
|---|---|
| `main.tex` | Preámbulo, estilos de TikZ, portada y orden de las secciones |
| `sections/` | Una sección por fichero (`00-resumen.tex` … `09-conclusiones.tex`) |
| `figs/*.tex` | Diagramas TikZ (vista de software, niveles agénticos, recuperación, ingesta, secuencia de un turno, entorno de desarrollo) |
| `figs/aws-actual.*`, `figs/aws-objetivo.*` | Arquitectura AWS actual y objetivo: fuente editable en draw.io (`.es.drawio`) y PDF vectorial que usa la memoria |
| `figs/prod_*.jpg` | Capturas del producto |
| `referencias.bib` | Bibliografía (biblatex, estilo IEEE) |

## Compilar

Hace falta una distribución de LaTeX con `pdflatex` y `biber` (TeX Live, o MiKTeX con instalación
automática de paquetes):

```bash
./build.sh   # pdflatex → biber → pdflatex ×2; deja main.pdf y build.log
```

Los ficheros intermedios (`.aux`, `.bbl`, `.log`…) no se versionan. Si se cambia un diagrama de
AWS, se edita el `.drawio` y se exporta de nuevo a PDF con el mismo nombre.

Las cifras salen del repositorio, de la evaluación y de las métricas de producción en el momento
de la redacción (octubre de 2026); las de mercado, de las fuentes citadas en la bibliografía.
