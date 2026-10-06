# ============================================================
# DETECCIÓN DE CANDIDATOS EN LOS SECTORES LOCALES
#
# Aplica el perfil obtenido durante la calibración para
# identificar y ordenar estructuras potencialmente compatibles
# con los candidatos de referencia.
#
# Requiere:
# rasterio, geopandas, opencv-python, numpy y pandas
# ============================================================

import gc
import geopandas as gpd
import rasterio
from rasterio.mask import mask
from rasterio.features import geometry_mask
import numpy as np
import cv2
import pandas as pd


# ============================================================
# 1. PARÁMETROS DE ENTRADA
# ============================================================

ruta_imagen = (
    r"C:\Users\Yuritza\Downloads\ortoimagen\Estudio.tif"
)

ruta_poligonos_locales = (
    r"C:\Users\Yuritza\Downloads\TESISQGis\PoligonosLocales.gpkg"
)

ruta_salida = (
    r"C:\Users\Yuritza\Downloads\CodigoQGisPython"
    r"\candidatos_finales.geojson"
)


# ============================================================
# 2. PERFIL DE REFERENCIA
#
# Reemplazar estos valores únicamente si la nueva ejecución
# del bloque de calibración produce resultados diferentes.
# ============================================================

circularidad_minima = 0.0601

blanqueamiento_media = 92.9212
blanqueamiento_std = 31.6956

vari_media = -0.0132
vari_std = 0.0256

area_min_m2 = 937.4
area_max_m2 = 26574.9


# ============================================================
# 3. LECTURA DE LOS SECTORES LOCALES
# ============================================================

poligonos = gpd.read_file(ruta_poligonos_locales)
todos_candidatos = []


# ============================================================
# 4. PROCESAMIENTO POR SECTOR LOCAL
# ============================================================

with rasterio.open(ruta_imagen) as src:

    # Homologación del sistema de referencia.
    if poligonos.crs != src.crs:
        poligonos = poligonos.to_crs(src.crs)

    resolucion = src.res[0]

    for idx_zona, fila_zona in poligonos.iterrows():

        print(f"\n--- Procesando sector {idx_zona} ---")

        geometria_zona = fila_zona.geometry

        try:
            imagen_zona, transform_zona = mask(
                src,
                [geometria_zona],
                crop=True,
                filled=True
            )

        except Exception as e:
            print(f"Error al recortar el sector {idx_zona}: {e}")
            continue

        mascara_zona = geometry_mask(
            [geometria_zona],
            transform=transform_zona,
            invert=True,
            out_shape=(
                imagen_zona.shape[1],
                imagen_zona.shape[2]
            )
        )

        # ----------------------------------------------------
        # Índice de blanqueamiento
        # ----------------------------------------------------

        rgb = np.transpose(
            imagen_zona[:3],
            (1, 2, 0)
        ).astype(np.uint8)

        hsv = cv2.cvtColor(
            rgb,
            cv2.COLOR_RGB2HSV
        )

        value = hsv[:, :, 2].astype(np.float32)
        saturation = hsv[:, :, 1].astype(np.float32)

        blanqueamiento = (
            value - saturation
        ) * mascara_zona

        # ----------------------------------------------------
        # VARI
        # ----------------------------------------------------

        red = imagen_zona[0].astype(np.float32)
        green = imagen_zona[1].astype(np.float32)
        blue = imagen_zona[2].astype(np.float32)

        denominador = green + red - blue

        vari = np.divide(
            green - red,
            denominador + 1e-6,
            out=np.zeros_like(green, dtype=np.float32),
            where=denominador != 0
        )

        # ----------------------------------------------------
        # Segmentación de las superficies blanqueadas
        # ----------------------------------------------------

        umbral = np.percentile(
            blanqueamiento[mascara_zona],
            80
        )

        binaria = (
            (blanqueamiento > umbral)
            & mascara_zona
        ).astype(np.uint8)

        kernel = np.ones((5, 5), dtype=np.uint8)

        binaria = cv2.morphologyEx(
            binaria,
            cv2.MORPH_CLOSE,
            kernel,
            iterations=2
        )

        contornos, _ = cv2.findContours(
            binaria,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )

        print(f"Formas detectadas: {len(contornos)}")

        aceptados = 0

        # ----------------------------------------------------
        # Evaluación morfométrica y espectral
        # ----------------------------------------------------

        for contorno in contornos:

            area_pixeles = cv2.contourArea(contorno)
            perimetro_pixeles = cv2.arcLength(
                contorno,
                True
            )

            if perimetro_pixeles == 0 or area_pixeles < 5:
                continue

            area_m2 = area_pixeles * resolucion**2

            # Filtro por área.
            if not (
                area_min_m2
                <= area_m2
                <= area_max_m2
            ):
                continue

            circularidad = (
                4 * np.pi * area_pixeles
            ) / (perimetro_pixeles**2)

            # Filtro por circularidad.
            if circularidad < circularidad_minima:
                continue

            momentos = cv2.moments(contorno)

            if momentos["m00"] == 0:
                continue

            centro_x = momentos["m10"] / momentos["m00"]
            centro_y = momentos["m01"] / momentos["m00"]

            mascara_forma = np.zeros(
                binaria.shape,
                dtype=np.uint8
            )

            cv2.drawContours(
                mascara_forma,
                [contorno],
                -1,
                1,
                -1
            )

            mascara_forma_bool = (
                mascara_forma.astype(bool)
                & mascara_zona
            )

            blanqueamiento_candidato = float(
                blanqueamiento[
                    mascara_forma_bool
                ].mean()
            )

            vari_candidato = float(
                vari[
                    mascara_forma_bool
                ].mean()
            )

            # Distancias estandarizadas respecto al perfil.
            z_blanqueamiento = (
                blanqueamiento_candidato
                - blanqueamiento_media
            ) / blanqueamiento_std

            z_vari = (
                vari_candidato
                - vari_media
            ) / vari_std

            distancia_similitud = np.sqrt(
                z_blanqueamiento**2
                + z_vari**2
            )

            coordenada_x, coordenada_y = (
                transform_zona
                * (centro_x, centro_y)
            )

            todos_candidatos.append({
                "zona": int(idx_zona),
                "coord_x": float(coordenada_x),
                "coord_y": float(coordenada_y),
                "area_m2": round(float(area_m2), 1),
                "circularidad": round(
                    float(circularidad),
                    4
                ),
                "blanqueamiento": round(
                    blanqueamiento_candidato,
                    4
                ),
                "vari": round(
                    vari_candidato,
                    4
                ),
                "distancia_similitud": round(
                    float(distancia_similitud),
                    3
                )
            })

            aceptados += 1

        print(
            "Candidatos que superan los filtros de área "
            f"y circularidad: {aceptados}"
        )

        # Liberación de los arreglos más pesados antes de
        # continuar con el siguiente sector.
        del imagen_zona
        del mascara_zona
        del rgb
        del hsv
        del value
        del saturation
        del blanqueamiento
        del red
        del green
        del blue
        del denominador
        del vari
        del binaria
        del contornos

        gc.collect()

    crs_final = poligonos.crs


# ============================================================
# 5. ORGANIZACIÓN Y EXPORTACIÓN DE LOS RESULTADOS
# ============================================================

if len(todos_candidatos) == 0:

    print("\n=== TOTAL FINAL: 0 candidatos ===")
    print("No se generó el archivo de salida.")

else:

    df_final = pd.DataFrame(todos_candidatos)

    df_final = df_final.sort_values(
        "distancia_similitud",
        ascending=True
    ).reset_index(drop=True)

    print(
        f"\n=== TOTAL FINAL: "
        f"{len(df_final)} candidatos ==="
    )

    print(df_final.head(20))

    gdf_final = gpd.GeoDataFrame(
        df_final,
        geometry=gpd.points_from_xy(
            df_final["coord_x"],
            df_final["coord_y"]
        ),
        crs=crs_final
    )

    gdf_final.to_file(
        ruta_salida,
        driver="GeoJSON"
    )

    print(f"\nArchivo guardado en: {ruta_salida}")