// ============================================================================
// GEE_02_PRIORIZACION_ESPECTRAL_CANDIDATOS_30m
// ============================================================================
// Objetivo:
// Priorizar los candidatos QGIS mediante el contraste espectral entre el
// interior de cada candidato y un anillo exterior de 30 m.
//
// Antecedente metodológico:
// El script GEE_01_Caracterizacion_Espectral_Interior_Entorno_30m evaluó un
// conjunto amplio de índices. A partir de ese análisis se seleccionaron NDVI,
// MSAVI, GLI, MSI y BSI por su utilidad y complementariedad.
//
// Metodología resumida:
// 1. Construir un compuesto mediano Sentinel-2 de 2024.
// 2. Calcular los cinco índices seleccionados.
// 3. Medir la media de cada índice dentro y alrededor de cada candidato.
// 4. Calcular el contraste: interior - entorno.
// 5. Aplicar umbrales empíricos obtenidos de los cuartiles ANH.
// 6. Puntuar y clasificar los candidatos QGIS por componentes espectrales.
//
// Importante:
// La prioridad obtenida es exclusivamente espectral. No confirma por sí sola
// un círculo de hadas ni elimina definitivamente candidatos. La evaluación
// posterior incorporará circularidad, topografía y revisión visual.
//
// Periodo analizado: 2024-01-01 a 2025-01-01
// ============================================================================


// ============================================================================
// 1. PARÁMETROS GENERALES
// ============================================================================

var fechaInicial = "2024-01-01";
var fechaFinal = "2025-01-01";

var carpetaSalida = "Resultados_Tesis";


// ============================================================================
// 2. DATOS DE ENTRADA Y ÁREA DE ESTUDIO
// ============================================================================

var areaEstudioFC = ee.FeatureCollection("projects/tesis-474203/assets/AreaEstudio");

var areaEstudio = areaEstudioFC.geometry();

// En el asset, tres nombres de campo están abreviados. Se crean alias con los
// nombres completos para que la tabla CSV exporte sus valores correctamente.
function aliasCampo(feature, nombreAbreviado, nombreCompleto) {
  var nombres = feature.propertyNames();
  return ee.Algorithms.If(
    nombres.contains(nombreAbreviado),
    feature.get(nombreAbreviado),
    feature.get(nombreCompleto)
  );
}

var candidatosQGIS = ee.FeatureCollection(
  "projects/tesis-474203/assets/CandidatosAlgoritmo"
).map(function(feature) {
  return feature.set({
    circularidad: aliasCampo(feature, "circularid", "circularidad"),
    blanqueamiento: aliasCampo(feature, "blanqueami", "blanqueamiento"),
    distancia_similitud: aliasCampo(feature, "distancia_", "distancia_similitud")
  });
});

var circulosANH = ee.FeatureCollection("projects/tesis-474203/assets/CirculosANH");

var poligonosLocales = ee.FeatureCollection("projects/tesis-474203/assets/poligonosLocalesF");

print("Registros ANH originales:", circulosANH.size());
print("Candidatos QGIS originales:", candidatosQGIS.size());

Map.addLayer(areaEstudioFC, {color: "white"}, "Área de estudio");
Map.addLayer(poligonosLocales, {color: "yellow"}, "Polígonos locales", false);
Map.addLayer(circulosANH, {color: "blue"}, "Centros ANH", false);
Map.addLayer(candidatosQGIS, {color: "red"}, "Centros QGIS", false);


// ============================================================================
// 3. CONVERTIR LOS PUNTOS EN ÁREAS CIRCULARES EQUIVALENTES
// ============================================================================
// El radio equivalente se obtiene a partir del área registrada:
// radio = sqrt(area / pi).
// Estos círculos sirven como unidades de medición espectral. No deben usarse
// para evaluar la circularidad real, porque son circulares por construcción.

function crearAreasCirculares(coleccion, campoArea) {

  return coleccion
    .filter(ee.Filter.notNull([campoArea]))
    .map(function(feature) {

      var radio = ee.Number(feature.get(campoArea))
        .divide(Math.PI)
        .sqrt();

      return feature
        .buffer(radio)
        .set("radio_m", radio);
    });
}

var areasANH = crearAreasCirculares(circulosANH, "AREA");
var areasQGIS = crearAreasCirculares(candidatosQGIS, "area_m2");

Map.addLayer(areasANH, {color: "blue"}, "Áreas ANH", false);
Map.addLayer(areasQGIS, {color: "red"}, "Áreas QGIS", false);


// ============================================================================
// 4. PREPARAR SENTINEL-2 Y CREAR EL COMPUESTO DE 2024
// ============================================================================

function limpiarS2(image) {

  var scl = image.select("SCL");

  var mascara = scl.neq(0)      // sin información
    .and(scl.neq(1))            // píxel saturado o defectuoso
    .and(scl.neq(3))            // sombra de nube
    .and(scl.neq(8))            // nube de probabilidad media
    .and(scl.neq(9))            // nube de probabilidad alta
    .and(scl.neq(10))           // cirros
    .and(scl.neq(11));          // nieve o hielo

  return image
    .select(["B2", "B3", "B4", "B8", "B11"])
    .multiply(0.0001)
    .updateMask(mascara)
    .copyProperties(image, ["system:time_start"]);
}

var coleccion2024 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(areaEstudio)
  .filterDate(fechaInicial, fechaFinal)
  .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 10))
  .map(limpiarS2);

print("Imágenes utilizadas en el compuesto:", coleccion2024.size());

var compuesto2024 = coleccion2024
  .median()
  .clip(areaEstudio);

Map.addLayer(
  compuesto2024,
  { bands: ["B4", "B3", "B2"],
    min: 0,
    max: 0.3 },
  "Compuesto RGB 2024"
);


// ============================================================================
// 5 VISUALIZAR LOS ÍNDICES EN EL MAPA
// ============================================================================
// La visualización se estira entre P5 y P95 de cada índice dentro del área.

function analizarIndice(indice, nombre, escala, paleta) {

  var estadisticas = indice.reduceRegion({
    reducer: ee.Reducer.min()
      .combine(ee.Reducer.max(), "", true)
      .combine(ee.Reducer.percentile([5, 95]), "", true),
    geometry: areaEstudio,
    scale: escala,
    maxPixels: 1e13
  });

  print(nombre + " (mínimo, máximo, P5 y P95):", estadisticas);

  estadisticas.evaluate(function(resultado) {

    if (resultado === null || resultado === undefined) {
      print("No se obtuvieron estadísticas para visualizar " + nombre);
      return;
    }

    var minVis = resultado[nombre + "_p5"];
    var maxVis = resultado[nombre + "_p95"];

    if (minVis === null || minVis === undefined ||
        maxVis === null || maxVis === undefined) {
      print("No se encontraron P5 y P95 para " + nombre, resultado);
      return;
    }

    Map.addLayer(
      indice,
      {min: minVis, max: maxVis, palette: paleta},
      nombre + " (P5-P95)",
      false
    );
  });
}


// ============================================================================
// 5.1 CALCULAR LOS ÍNDICES ESPECTRALES SELECCIONADOS
// ============================================================================

// NDVI: vigor y cobertura de la vegetación.
var ndvi = compuesto2024
  .normalizedDifference(["B8", "B4"])
  .rename("NDVI");
analizarIndice(ndvi, "NDVI", 10, ["#8B4513", "#FFFF00", "#90EE90", "#006400"]);

// MSAVI: vegetación con ajuste del efecto del suelo.
var msavi = compuesto2024.expression(
  "(2*NIR + 1 - sqrt((2*NIR + 1)*(2*NIR + 1) - 8*(NIR - RED))) / 2",
  { NIR: compuesto2024.select("B8"),
    RED: compuesto2024.select("B4") }
).rename("MSAVI");
analizarIndice(msavi, "MSAVI", 10, ["#6E3B0B", "#C97A1D", "#F2C94C", "#7CB342", "#2E7D32"]);

// GLI: verdor basado en las bandas visibles.
var gli = compuesto2024.expression(
  "(2*GREEN - RED - BLUE) / (2*GREEN + RED + BLUE)",
  { GREEN: compuesto2024.select("B3"),
    RED: compuesto2024.select("B4"),
    BLUE: compuesto2024.select("B2") }
).rename("GLI");
analizarIndice(gli, "GLI", 10, ["#6E4B1F", "#B8860B", "#E8D8A8", "#7FB069", "#2D6A4F"]);


// MSI: estrés de humedad; valores mayores suelen indicar mayor estrés.
var msi = compuesto2024.expression(
  "SWIR / NIR",
  { SWIR: compuesto2024.select("B11"),
    NIR: compuesto2024.select("B8") }
).rename("MSI");
analizarIndice(msi, "MSI", 20, ["#2C7BB6", "#ABD9E9", "#FFFFBF", "#FDAE61", "#D7191C"]);

// BSI: respuesta asociada con suelo desnudo.
var bsi = compuesto2024.expression(
  "((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))",
  { SWIR: compuesto2024.select("B11"),
    RED: compuesto2024.select("B4"),
    NIR: compuesto2024.select("B8"),
    BLUE: compuesto2024.select("B2") }
).rename("BSI");
analizarIndice(bsi, "BSI", 20, ["#556B2F", "#C2B280", "#D9C27A", "#B5651D", "#7F2704"]);

var indices = ee.Image.cat([ndvi, msavi, gli, msi, bsi]);


// ============================================================================
// 6. MEDIR EL INTERIOR Y EL ENTORNO DE CADA ÁREA
// ============================================================================

// Distancia adicional usada para construir el anillo exterior.
var distanciaEntorno = 30;
// Se usa 20 m porque MSI y BSI incluyen la banda B11 de Sentinel-2.
var escalaAnalisis = 20;

function medirIndices(feature) {

  var interior = feature.geometry();

  // Anillo exterior de 30 m que excluye la geometría interior.
  var entorno = interior
    .buffer(distanciaEntorno)
    .difference(interior, 1);

  var valoresInterior = indices.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: interior,
    scale: escalaAnalisis,
    maxPixels: 1e6
  });

  var valoresEntorno = indices.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: entorno,
    scale: escalaAnalisis,
    maxPixels: 1e6
  });

  return feature.set({
    int_NDVI: valoresInterior.get("NDVI"),
    ext_NDVI: valoresEntorno.get("NDVI"),

    int_MSAVI: valoresInterior.get("MSAVI"),
    ext_MSAVI: valoresEntorno.get("MSAVI"),

    int_GLI: valoresInterior.get("GLI"),
    ext_GLI: valoresEntorno.get("GLI"),

    int_MSI: valoresInterior.get("MSI"),
    ext_MSI: valoresEntorno.get("MSI"),

    int_BSI: valoresInterior.get("BSI"),
    ext_BSI: valoresEntorno.get("BSI")
  });
}

var camposNecesarios = [
  "int_NDVI", "ext_NDVI",
  "int_MSAVI", "ext_MSAVI",
  "int_GLI", "ext_GLI",
  "int_MSI", "ext_MSI",
  "int_BSI", "ext_BSI"
];

function obtenerMedicionesValidas(coleccion) {

  return coleccion
    .filterBounds(areaEstudio)
    .map(medirIndices)
    .filter(ee.Filter.notNull(camposNecesarios));
}

var medicionesANH = obtenerMedicionesValidas(areasANH);
var medicionesQGIS = obtenerMedicionesValidas(areasQGIS);


// ============================================================================
// 7. CALCULAR LOS CONTRASTES INTERIOR - ENTORNO
// ============================================================================
// Un contraste negativo en NDVI, MSAVI o GLI representa menor respuesta
// vegetal dentro del candidato. Un contraste positivo en MSI o BSI representa
// mayor estrés hídrico o mayor respuesta de suelo desnudo en el interior.

function calcularContrastes(feature) {

  return feature.set({
    dif_NDVI: ee.Number(feature.get("int_NDVI"))
      .subtract(feature.get("ext_NDVI")),

    dif_MSAVI: ee.Number(feature.get("int_MSAVI"))
      .subtract(feature.get("ext_MSAVI")),

    dif_GLI: ee.Number(feature.get("int_GLI"))
      .subtract(feature.get("ext_GLI")),

    dif_MSI: ee.Number(feature.get("int_MSI"))
      .subtract(feature.get("ext_MSI")),

    dif_BSI: ee.Number(feature.get("int_BSI"))
      .subtract(feature.get("ext_BSI"))
  });
}

var resultadosANH = medicionesANH.map(calcularContrastes);
var resultadosQGIS = medicionesQGIS.map(calcularContrastes);

print("Datos válidos - ANH:", resultadosANH.size());
print("Datos válidos - QGis:", resultadosQGIS.size());


// ============================================================================
// 8. RESUMIR LAS DISTRIBUCIONES DE LOS CONTRASTES
// ============================================================================
var nombresIndices = ["NDVI", "MSAVI", "GLI", "MSI", "BSI"];

var reductorDistribucion = ee.Reducer
  .percentile([5, 25, 50, 75, 95])
  .combine(ee.Reducer.mean(), "", true)
  .combine(ee.Reducer.stdDev(), "", true);

function crearResumenDistribuciones(coleccion, grupo) {

  return ee.FeatureCollection(
    nombresIndices.map(function(nombre) {

      var estadisticas = coleccion.reduceColumns({
        reducer: reductorDistribucion,
        selectors: ["dif_" + nombre]
      });

      return ee.Feature(null, estadisticas)
        .set("grupo", grupo)
        .set("indice", nombre);
    })
  );
}

var resumenANH = crearResumenDistribuciones(resultadosANH, "ANH");
var resumenQGIS = crearResumenDistribuciones(resultadosQGIS, "QGIS");
var resumenDistribuciones = resumenANH.merge(resumenQGIS);

print("Resumen de distribuciones:", resumenDistribuciones);


// ============================================================================
// 9. OBTENER LOS UMBRALES DESDE ANH
// ============================================================================
// Se utiliza P25 para NDVI, MSAVI y GLI porque se busca una
// disminución marcada de la respuesta vegetal en el interior.
//
// Se utiliza P75 para MSI y BSI porque se busca un aumento marcado
// del estrés hídrico y de la respuesta de suelo desnudo.
//
// Estos umbrales sirven para priorización espectral y no constituyen
// valores universales ni criterios definitivos de identificación.

function obtenerPercentilANH(coleccion, indice, percentil) {

  var estadisticas = coleccion.reduceColumns({
    reducer: ee.Reducer.percentile([percentil]),
    selectors: ["dif_" + indice]
  });

  return ee.Number(estadisticas.get("p" + percentil));
}

// Los umbrales se recalculan con los registros ANH válidos de esta misma
// ejecución, usando el compuesto 2024 y el filtro de nubosidad aplicado arriba.
var umbralNDVI  = obtenerPercentilANH(resultadosANH, "NDVI", 25);
var umbralMSAVI = obtenerPercentilANH(resultadosANH, "MSAVI", 25);
var umbralGLI   = obtenerPercentilANH(resultadosANH, "GLI", 25);
var umbralMSI   = obtenerPercentilANH(resultadosANH, "MSI", 75);
var umbralBSI   = obtenerPercentilANH(resultadosANH, "BSI", 75);

print("Umbrales espectrales calculados desde ANH:", ee.Dictionary({
  P25_NDVI: umbralNDVI,
  P25_MSAVI: umbralMSAVI,
  P25_GLI: umbralGLI,
  P75_MSI: umbralMSI,
  P75_BSI: umbralBSI
}));

// Los valores obtenidos se muestran en la consola y se calculan a partir de
// resultadosANH en cada ejecución; por ello pueden variar si cambian los datos,
// las escenas disponibles o los parámetros de preprocesamiento.


// ============================================================================
// 10. EVALUAR LOS CINCO CRITERIOS ESPECTRALES EN QGIS
// ============================================================================

function evaluarCriterios(feature) {

  var cumpleNDVI = ee.Number(feature.get("dif_NDVI")).lte(umbralNDVI);
  var cumpleMSAVI = ee.Number(feature.get("dif_MSAVI")).lte(umbralMSAVI);
  var cumpleGLI = ee.Number(feature.get("dif_GLI")).lte(umbralGLI);
  var cumpleMSI = ee.Number(feature.get("dif_MSI")).gte(umbralMSI);
  var cumpleBSI = ee.Number(feature.get("dif_BSI")).gte(umbralBSI);

  var puntajeIndices = ee.Number(cumpleNDVI)
    .add(cumpleMSAVI)
    .add(cumpleGLI)
    .add(cumpleMSI)
    .add(cumpleBSI);

  return feature.set({
    cumple_NDVI: cumpleNDVI,
    cumple_MSAVI: cumpleMSAVI,
    cumple_GLI: cumpleGLI,
    cumple_MSI: cumpleMSI,
    cumple_BSI: cumpleBSI,
    puntaje_indices: puntajeIndices
  });
}

var candidatosEvaluados = resultadosQGIS.map(evaluarCriterios);

print("Distribución del puntaje de cinco índices:",
  candidatosEvaluados.aggregate_histogram("puntaje_indices"));


// ============================================================================
// 11. INTEGRAR ÍNDICES RELACIONADOS EN COMPONENTES
// ============================================================================
// NDVI y MSAVI representan una familia espectral relacionada. Para evitar que
// esa señal reciba dos puntos, ambos deben coincidir y forman un único
// componente de vegetación. El puntaje integrado varía entre 0 y 4.

function calcularComponentes(feature) {

  var componenteVegetacion = ee.Number(feature.get("cumple_NDVI"))
    .multiply(ee.Number(feature.get("cumple_MSAVI")));

  var componenteVerdor = ee.Number(feature.get("cumple_GLI"));
  var componenteHumedad = ee.Number(feature.get("cumple_MSI"));
  var componenteSuelo = ee.Number(feature.get("cumple_BSI"));

  var puntajeComponentes = componenteVegetacion
    .add(componenteVerdor)
    .add(componenteHumedad)
    .add(componenteSuelo);

  return feature.set({
    comp_vegetacion: componenteVegetacion,
    comp_verdor: componenteVerdor,
    comp_humedad: componenteHumedad,
    comp_suelo: componenteSuelo,
    puntaje_componentes: puntajeComponentes
  });
}

var candidatosPuntuados = candidatosEvaluados
  .map(calcularComponentes);

print("Distribución del puntaje por componentes:",
  candidatosPuntuados.aggregate_histogram("puntaje_componentes"));


// ============================================================================
// 12. CLASIFICAR LA PRIORIDAD ESPECTRAL
// ============================================================================
// 4 = muy alta; 3 = alta; 2 = media; 1 = baja; 0 = sin señal fuerte.
// Ninguna categoría se elimina en esta etapa.

function clasificarPrioridad(feature) {

  var puntaje = ee.Number(feature.get("puntaje_componentes"));

  var prioridad = ee.String(
    ee.Algorithms.If(
      puntaje.eq(4), "Muy alta",
      ee.Algorithms.If(
        puntaje.eq(3), "Alta",
        ee.Algorithms.If(
          puntaje.eq(2), "Media",
          ee.Algorithms.If(
            puntaje.eq(1), "Baja",
            "Sin señal fuerte"
          )
        )
      )
    )
  );

  return feature.set("prioridad_espectral", prioridad);
}

var clasificacionEspectral = candidatosPuntuados
  .map(clasificarPrioridad)
  .sort("puntaje_componentes", false);

print("Cantidad de candidatos por prioridad:",
  clasificacionEspectral.aggregate_histogram("prioridad_espectral"));


// ============================================================================
// 13. VISUALIZAR LAS CATEGORÍAS
// ============================================================================

var prioridadMuyAlta = clasificacionEspectral.filter(
  ee.Filter.eq("prioridad_espectral", "Muy alta"));

var prioridadAlta = clasificacionEspectral.filter(
  ee.Filter.eq("prioridad_espectral", "Alta"));

var prioridadMedia = clasificacionEspectral.filter(
  ee.Filter.eq("prioridad_espectral", "Media"));

var prioridadBaja = clasificacionEspectral.filter(
  ee.Filter.eq("prioridad_espectral", "Baja"));

var sinSenalFuerte = clasificacionEspectral.filter(
  ee.Filter.eq("prioridad_espectral", "Sin señal fuerte"));

Map.addLayer(prioridadMuyAlta, {color: "red"}, "Prioridad muy alta");
Map.addLayer(prioridadAlta, {color: "orange"}, "Prioridad alta");
Map.addLayer(prioridadMedia, {color: "yellow"}, "Prioridad media", false);
Map.addLayer(prioridadBaja, {color: "cyan"}, "Prioridad baja", false);
Map.addLayer(sinSenalFuerte, {color: "gray"}, "Sin señal fuerte", false);

Map.centerObject(areaEstudioFC, 10);


// ============================================================================
// 14. EXPORTAR LOS RESULTADOS PARA DOCUMENTACIÓN Y ANÁLISIS
// ============================================================================

// 14.1 Contrastes individuales ANH y QGIS.
var tablaANH = resultadosANH.map(function(feature) {
  return feature.set("grupo", "ANH");
});

var tablaQGIS = resultadosQGIS.map(function(feature) {
  return feature.set("grupo", "QGIS");
});

var tablaContrastes = tablaANH.merge(tablaQGIS);

Export.table.toDrive({
  collection: tablaContrastes,
  description: "GEE_02_Contrastes_indices_seleccionados_30m",
  folder: carpetaSalida,
  fileNamePrefix: "GEE_02_Contrastes_indices_seleccionados_30m",
  fileFormat: "CSV",
  selectors: [
    "grupo", "radio_m",
    "dif_NDVI", "dif_MSAVI", "dif_GLI", "dif_MSI", "dif_BSI"
  ]
});

// 14.2 Percentiles, media y desviación estándar por grupo e índice.
Export.table.toDrive({
  collection: resumenDistribuciones,
  description: "GEE_02_Distribuciones_indices_seleccionados_30m",
  folder: carpetaSalida,
  fileNamePrefix: "GEE_02_Distribuciones_indices_seleccionados_30m",
  fileFormat: "CSV",
  selectors: [
    "grupo", "indice", "p5", "p25", "p50", "p75", "p95", "mean", "stdDev"
  ]
});

// 14.3 Resultado geográfico completo para QGIS.
Export.table.toDrive({
  collection: clasificacionEspectral,
  description: "GEE_02_Candidatos_clasificacion_espectral_30m",
  folder: carpetaSalida,
  fileNamePrefix: "GEE_02_Candidatos_clasificacion_espectral_30m",
  fileFormat: "GeoJSON"
});

// 14.4 Tabla final con las variables de clasificación.
Export.table.toDrive({
  collection: clasificacionEspectral,
  description: "GEE_02_Tabla_clasificacion_espectral_30m",
  folder: carpetaSalida,
  fileNamePrefix: "GEE_02_Tabla_clasificacion_espectral_30m",
  fileFormat: "CSV",
  selectors: [
    "id_cand", "zona", "confianza", "confusor",
    "coord_x", "coord_y",
    "area_m2", "circularidad", "blanqueamiento", "vari",
    "distancia_similitud", "radio_m",
    "dif_NDVI", "dif_MSAVI", "dif_GLI", "dif_MSI", "dif_BSI",
    "cumple_NDVI", "cumple_MSAVI", "cumple_GLI",
    "cumple_MSI", "cumple_BSI",
    "comp_vegetacion", "comp_verdor", "comp_humedad", "comp_suelo",
    "puntaje_indices", "puntaje_componentes", "prioridad_espectral"
  ]
});


// ============================================================================
// 15. GUARDAR LA CLASIFICACIÓN DIRECTAMENTE COMO ASSET
// ============================================================================

Export.table.toAsset({
  collection: clasificacionEspectral,
  description: "GEE_02_ClasificacionEspectral_30m_asset",
  assetId: "projects/tesis-474203/assets/ClasificacionEspectral30m"
});