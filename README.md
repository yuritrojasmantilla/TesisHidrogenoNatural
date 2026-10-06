# TesisHidrogenoNatural

Repositorio de códigos y resultados para la identificación y caracterización de candidatos a círculos de hadas mediante anomalías vegetacionales en la Alta Guajira, Colombia.

**Trabajo de Grado para Optar al Título de Geólogo**

Universidad Industrial de Santander (UIS)

**Autores**

- Yuritza Juliana Rojas Mantilla (1)
- Álvaro Daniel Peña Bello (2)

**Director:** Dilan Arturo Martínez Sánchez — Geólogo, MSc.

**Codirector:** Carlos Alberto Tavera Sanabria — Geólogo, MSc.

## 1. Propósito y alcance

El proyecto integra el procesamiento de una ortoimagen RGB en Python, la caracterización espectral con Sentinel-2 en Google Earth Engine (GEE) y el análisis de resultados en Google Colab. Los registros de la Agencia Nacional de Hidrocarburos (ANH) se utilizan como referencia para la calibración y la comparación.

La detección y la priorización se basan en características visibles, métricas de forma y contrastes espectrales entre el interior de cada estructura y su entorno. Los scripts no incorporan fallas, litologías u otras variables geológicas como criterios de selección.

**Los resultados identifican anomalías y candidatos de interés; no constituyen una confirmación de emanaciones de hidrógeno natural.** La prioridad espectral y la confianza de la revisión visual son atributos diferentes.

## 2. Organización del repositorio

| Carpeta o archivo | Contenido y función |
| --- | --- |
| [Código/Python-QGis](Código/Python-QGis/) | Scripts Python para calibrar el perfil de referencia y detectar candidatos en la ortoimagen. |
| [Código/GEE/GEE_01](Código/GEE/GEE_01/) | Scripts JavaScript de caracterización espectral interior–entorno de los quince índices iniciales. |
| [Código/GEE/GEE_02](Código/GEE/GEE_02/) | Scripts JavaScript de priorización espectral con los cinco índices seleccionados. |
| [Código/GEE/GEE_03](Código/GEE/GEE_03/) | Scripts JavaScript de resumen de circularidad de ANH y QGIS. |
| [Código/Colab](Código/Colab/) | Cuaderno de análisis y dos ZIP con las exportaciones originales de GEE, separados por escenario. |
| [Resultados/QGIS](Resultados/QGIS/) | Capa de candidatos con atributos morfométricos y de revisión visual. |
| [Resultados/GEE/GEE_01](Resultados/GEE/GEE_01/) | Contrastes de los quince índices iniciales. |
| [Resultados/GEE/GEE_02](Resultados/GEE/GEE_02/) | Contrastes de los cinco índices seleccionados, distribuciones y clasificación espectral. |
| [Resultados/GEE/GEE_03](Resultados/GEE/GEE_03/) | Resúmenes de circularidad de ANH y QGIS, incluidos los grupos de prioridad espectral. |
| `README.md` | Instrucciones de ejecución y descripción de los datos. |

En cada etapa de `Resultados/GEE`, las subcarpetas `Anillo_30m` y `Anillo_60m` corresponden a dos escenarios de análisis del entorno. **30 y 60 m son el ancho del anillo exterior**, medido desde el borde del círculo equivalente. La escala nominal del análisis Sentinel-2 es de **20 m en ambos escenarios**.

Los archivos `.py` contienen código Python; los `.js`, código JavaScript; el `.ipynb` es un cuaderno con celdas ejecutables; los `.csv` son tablas; los `.geojson` y `.gpkg` contienen geometrías y atributos; los `.zip` agrupan archivos para su carga o descarga.

## 3. Orden de ejecución

| Paso | Archivo o actividad | Resultado utilizado en el paso siguiente |
| --- | --- | --- |
| 1 | `QGIS_01_Calibración.py` | Perfil de referencia impreso en la consola. |
| 2 | `QGIS_02_Detección.py` | Puntos candidatos, ordenados por similitud con el perfil. |
| 3 | Revisión visual y preparación de atributos en QGIS | Capa con identificadores, confianza y posibles confusores; preparación de los assets de GEE. |
| 4 | `GEE_01_Caracterizacion_Espectral_Interior_Entorno_*` | CSV de contrastes de quince índices para ANH y QGIS. |
| 5 | `GEE_02_Priorizacion_Espectral_Candidatos_*` | Cuatro exportaciones a Drive y un asset con la clasificación. |
| 6 | `GEE_03_Analisis_Morfologico_Circularidad_*` | CSV de resumen de circularidad. Requiere el asset generado en el paso 5. |
| 7 | `Cuaderno_AnalisisFC.ipynb` | Tablas, figuras, mapa interactivo, reporte y archivos de trazabilidad. |

El asterisco representa la versión de 30 o 60 m. Se debe mantener el mismo escenario en las etapas GEE_01, GEE_02, GEE_03 y Colab.

Este es el orden metodológico del proyecto. GEE_01 y GEE_02 calculan sus mediciones a partir de los assets y del compuesto Sentinel-2; **GEE_02 no lee el CSV de GEE_01**. GEE_03 sí depende del asset de clasificación exportado por GEE_02.

**Para analizar las exportaciones ya incluidas, se puede comenzar directamente en Colab**, utilizando uno de los ZIP originales. Para repetir la detección y los cálculos desde los insumos, seguir el flujo completo.

### 3.1. Preparar los assets

Los scripts publicados utilizan las siguientes rutas:

| Asset | Función |
| --- | --- |
| `projects/tesis-474203/assets/AreaEstudio` | Polígono del área de estudio. |
| `projects/tesis-474203/assets/CandidatosAlgoritmo` | Puntos candidatos con atributos de detección y revisión visual. |
| `projects/tesis-474203/assets/CirculosANH` | Registros de referencia ANH. |
| `projects/tesis-474203/assets/poligonosLocalesF` | Polígonos de los sectores locales. |
| `users/yuritrojasmantilla/Departamentos` | Capa departamental declarada en GEE_01. |
| `projects/tesis-474203/assets/ClasificacionEspectral30m` | Asset generado por GEE_02 para el escenario de 30 m; entrada de GEE_03. |
| `projects/tesis-474203/assets/ClasificacionEspectral60m` | Asset generado por GEE_02 para el escenario de 60 m; entrada de GEE_03. |

Estas rutas pertenecen al proyecto de trabajo de los autores. La publicación de los scripts en GitHub no concede permisos sobre los assets. Quien ejecute el flujo debe contar con acceso o sustituir las rutas por las de su propio proyecto, incluida la ruta de salida de `Export.table.toAsset`.

### 3.2 Significado de las exportaciones

En los nombres siguientes, `[escenario]` se sustituye por `30m` o `60m`.

| Archivo | Contenido y uso |
| --- | --- |
| `GEE_01_Contrastes_indices_[escenario].csv` | Contrastes de los quince índices, con una fila por registro válido de ANH o QGIS. Se utiliza para estadísticos y correlaciones por grupo. |
| `GEE_02_Contrastes_indices_seleccionados_[escenario].csv` | Contrastes de NDVI, MSAVI, GLI, MSI y BSI para ambos grupos. |
| `GEE_02_Distribuciones_indices_seleccionados_[escenario].csv` | Percentiles, media y desviación estándar por grupo e índice. Permite consultar los umbrales de referencia utilizados en GEE. |
| `GEE_02_Tabla_clasificacion_espectral_[escenario].csv` | Inventario de candidatos QGIS: identificador, atributos originales, contrastes, criterios cumplidos, componentes, puntajes y prioridad. |
| `GEE_02_Candidatos_clasificacion_espectral_[escenario].geojson` | Geometrías circulares de muestreo y atributos de los candidatos, incluidos los valores interiores y exteriores de los cinco índices. |
| `GEE_03_Resumen_Circularidad_QGIS_ANH_[escenario].csv` | Estadísticos de circularidad para ANH, QGIS y las categorías de prioridad espectral de QGIS. |

En las exportaciones incluidas hay **227 candidatos QGIS y 77 registros ANH** con contrastes en cada escenario, para un total de 304 filas en cada tabla de contrastes. Estos conteos describen los archivos publicados y no equivalen al número inicial de registros del antecedente ANH.

Repositorio: [yuritrojasmantilla/TesisHidrogenoNatural](https://github.com/yuritrojasmantilla/TesisHidrogenoNatural).
