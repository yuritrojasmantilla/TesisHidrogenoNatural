# ============================================================
# CALIBRACIÓN DEL PERFIL DE REFERENCIA
#
# Caracteriza la respuesta espectral visible y la geometría
# de las estructuras reportadas por la ANH utilizadas como
# datos de referencia.
#
# Requiere:
# rasterio, geopandas, opencv-python, numpy y pandas
# ============================================================

import geopandas as gpd
import rasterio
from rasterio.windows import from_bounds
import numpy as np
import cv2
import pandas as pd


# ============================================================
# 1. PARÁMETROS DE ENTRADA
# ============================================================

ruta_imagen = r"C:\Users\Yuritza\Downloads\ortoimagen\Estudio.tif"
ruta_puntos_referencia = r"C:\Users\Yuritza\Downloads\GEE\CirculosANH.shp"

# Radio utilizado para extraer el entorno de cada punto.
radio_referencia_m = 47

# Se consideran los píxeles situados por encima del percentil 80
# del índice de blanqueamiento.
percentil_umbral = 80

# Se conserva el 40 % de las estructuras con mayor circularidad.
porcentaje_a_conservar = 0.40


# ============================================================
# 2. LECTURA DE LOS DATOS DE REFERENCIA
# ============================================================

puntos_referencia = gpd.read_file(ruta_puntos_referencia)
resultados = []


# ============================================================
# 3. CARACTERIZACIÓN DE LAS ESTRUCTURAS DE REFERENCIA
# ============================================================

with rasterio.open(ruta_imagen) as src:

    # Homologación del sistema de referencia.
    if puntos_referencia.crs != src.crs:
        puntos_referencia = puntos_referencia.to_crs(src.crs)

    resolucion = src.res[0]

    for idx, fila in puntos_referencia.iterrows():

        x = fila.geometry.x
        y = fila.geometry.y
        margen_m = radio_referencia_m * 1.8

        try:
            ventana = from_bounds(
                x - margen_m,
                y - margen_m,
                x + margen_m,
                y + margen_m,
                transform=src.transform
            )

            parche = src.read(window=ventana)

        except Exception as e:
            print(f"Error en el punto {idx}: {e}")
            continue

        # Se descartan ventanas demasiado pequeñas.
        if parche.shape[1] < 10 or parche.shape[2] < 10:
            print(f"Punto {idx}: ventana insuficiente.")
            continue

        # ----------------------------------------------------
        # Índice de blanqueamiento
        # Brillo alto y saturación baja en el espacio HSV.
        # ----------------------------------------------------

        rgb = np.transpose(parche[:3], (1, 2, 0)).astype(np.uint8)
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)

        value = hsv[:, :, 2].astype(np.float32)
        saturation = hsv[:, :, 1].astype(np.float32)

        blanqueamiento = value - saturation

        # ----------------------------------------------------
        # VARI
        # Índice de vegetación basado en bandas visibles.
        # ----------------------------------------------------

        red = parche[0].astype(np.float32)
        green = parche[1].astype(np.float32)
        blue = parche[2].astype(np.float32)

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

        umbral_local = np.percentile(
            blanqueamiento,
            percentil_umbral
        )

        binaria = (
            blanqueamiento > umbral_local
        ).astype(np.uint8)

        kernel = np.ones((5, 5), dtype=np.uint8)

        binaria = cv2.morphologyEx(
            binaria,
            cv2.MORPH_CLOSE,
            kernel,
            iterations=2
        )

        # ----------------------------------------------------
        # Identificación del contorno que contiene el punto
        # de referencia
        # ----------------------------------------------------

        contornos, _ = cv2.findContours(
            binaria,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )

        centro_y = parche.shape[1] / 2
        centro_x = parche.shape[2] / 2

        for contorno in contornos:

            contiene_punto = cv2.pointPolygonTest(
                contorno,
                (centro_x, centro_y),
                False
            )

            if contiene_punto < 0:
                continue

            area_pixeles = cv2.contourArea(contorno)
            perimetro_pixeles = cv2.arcLength(contorno, True)

            if perimetro_pixeles <= 0 or area_pixeles <= 5:
                break

            circularidad = (
                4 * np.pi * area_pixeles
            ) / (perimetro_pixeles**2)

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

            mascara_bool = mascara_forma.astype(bool)

            resultados.append({
                "idx": idx,
                "circularidad": float(circularidad),
                "area_m2": float(
                    area_pixeles * resolucion**2
                ),
                "blanqueamiento": float(
                    blanqueamiento[mascara_bool].mean()
                ),
                "vari": float(
                    vari[mascara_bool].mean()
                )
            })

            break


# ============================================================
# 4. OBTENCIÓN DEL PERFIL DE REFERENCIA
# ============================================================

df_todos = pd.DataFrame(resultados)

print(
    f"\nEstructuras detectadas: {len(df_todos)} "
    f"de {len(puntos_referencia)} puntos de referencia"
)

if df_todos.empty:

    print(
        "No se detectaron manchas asociadas con los puntos de "
        "referencia. Revisa percentil_umbral, "
        "radio_referencia_m y la correspondencia espacial."
    )

else:

    print("\n--- ESTADÍSTICAS DE LOS CASOS DETECTADOS ---")
    print(df_todos.describe())

    # Se conserva el 40 % de los objetos con mayor circularidad.
    cuantil_corte = 1 - porcentaje_a_conservar

    umbral_circularidad_corte = (
        df_todos["circularidad"].quantile(cuantil_corte)
    )

    df_curado = df_todos[
        df_todos["circularidad"]
        >= umbral_circularidad_corte
    ].copy()

    print(
        f"\n--- CONJUNTO DE REFERENCIA CURADO "
        f"({porcentaje_a_conservar * 100:.0f} % con mayor "
        f"circularidad; {len(df_curado)} casos) ---"
    )

    print(df_curado.describe())

    if len(df_curado) < 2:
        print(
            "\nAdvertencia: el conjunto curado contiene menos "
            "de dos estructuras. La desviación estándar no "
            "podrá calcularse adecuadamente."
        )

    print("\n=== PERFIL DE REFERENCIA FINAL ===")

    print(
        "circularidad_minima = "
        f"{df_curado['circularidad'].min():.4f}"
    )

    print(
        "blanqueamiento_media = "
        f"{df_curado['blanqueamiento'].mean():.4f}"
    )

    print(
        "blanqueamiento_std = "
        f"{df_curado['blanqueamiento'].std():.4f}"
    )

    print(
        "vari_media = "
        f"{df_curado['vari'].mean():.4f}"
    )

    print(
        "vari_std = "
        f"{df_curado['vari'].std():.4f}"
    )

    print(
        "area_min_m2 = "
        f"{df_curado['area_m2'].min():.1f}"
    )

    print(
        "area_max_m2 = "
        f"{df_curado['area_m2'].max():.1f}"
    )