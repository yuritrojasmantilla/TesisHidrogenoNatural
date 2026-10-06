// ============================================================================
// GEE 01 - CARACTERIZACIÓN ESPECTRAL INTERIOR–ENTORNO (SENTINEL-2, 2024)
// ============================================================================
// Propósito:
// Caracterizar estadísticamente los círculos reportados por la ANH y los
// candidatos generados en QGIS mediante el contraste entre el valor medio
// dentro de cada círculo y el valor medio de un anillo exterior de 30 m.
//
// Fuente satelital:
// COPERNICUS/S2_SR_HARMONIZED. Se genera un compuesto anual de mediana para
// 2024 después de enmascarar píxeles sin datos, defectuosos, sombras, nubes,
// cirros, nieve y hielo mediante la banda SCL.
//
// Índices evaluados (15):
// NDVI, EVI, GNDVI, CIG, OSAVI, ARVI, GLI, MSAVI, SAVI, MSI, GVMI, NDWI,
// BSI, NBR y NDBI.
//
// Cálculo principal:
// contraste = media del índice en el interior - media en el entorno.
// Un contraste negativo en los índices de vegetación indica menor respuesta
// vegetal dentro del círculo respecto a sus alrededores.
//
// Producto:
// Archivo CSV "GEE_01_Contrastes_indices_30m", con un registro por círculo y los
// contrastes espectrales de los grupos ANH y QGIS. Este archivo se utiliza
// posteriormente para estudiar correlaciones, redundancia y selección de
// variables. La selección provisional conserva NDVI, MSAVI, GLI, MSI y BSI.
//
// Alcance:
// El análisis identifica patrones espectrales compatibles con anomalías de
// vegetación. No confirma por sí mismo emanaciones de hidrógeno natural.
// ============================================================================

// ============================================================
// 1. ÁREA DE ESTUDIO
// ============================================================

var LaGuajira = ee.FeatureCollection("users/yuritrojasmantilla/Departamentos")
  .filter(ee.Filter.stringContains("DeNombre", "La Guajira"));

var areaEstudioFC = ee.FeatureCollection("projects/tesis-474203/assets/AreaEstudio");
var areaEstudio = areaEstudioFC.geometry();

Map.addLayer(areaEstudio, {color: "white"}, "Área de estudio");


// ============================================================
// 2. DATOS DE LA ANH Y QGIS
// ============================================================

var candidatosQGIS = ee.FeatureCollection("projects/tesis-474203/assets/CandidatosAlgoritmo");

var circulosANH = ee.FeatureCollection("projects/tesis-474203/assets/CirculosANH");

var poligonosLocales = ee.FeatureCollection("projects/tesis-474203/assets/poligonosLocalesF");

Map.addLayer(poligonosLocales, {color: "yellow"}, "Polígonos locales");
Map.addLayer(circulosANH, {color: "blue"}, "Centros ANH", false);
Map.addLayer(candidatosQGIS, {color: "red"}, "Centros QGIS", false);

print("Cantidad círculos ANH:", circulosANH.size());
print("Cantidad candidatos QGIS:", candidatosQGIS.size());


// ============================================================
// 3. CONVERTIR LOS PUNTOS EN ÁREAS CIRCULARES
// ============================================================

// Eliminar temporalmente el registro ANH sin área
var anhConArea = circulosANH.filter(ee.Filter.notNull(["AREA"]));

// Crear áreas ANH
var areasANH = anhConArea.map(function(feature) {

  var radio = ee.Number(
    feature.get("AREA")
  ).divide(Math.PI).sqrt();

  return feature
    .buffer(radio)
    .set("radio_m", radio);
});

// Eliminar temporalmente candidatos sin información de área
var qgisConArea = candidatosQGIS.filter(ee.Filter.notNull(["area_m2"]));

// Crear áreas QGIS
var areasQGIS = qgisConArea.map(function(feature) {

  var radio = ee.Number(
    feature.get("area_m2")
  ).divide(Math.PI).sqrt();

  return feature
    .buffer(radio)
    .set("radio_m", radio);
});

Map.addLayer(areasANH, {color: "blue"}, "Áreas ANH");
Map.addLayer(areasQGIS, {color: "red"}, "Áreas QGIS");


// ============================================================
// 4. LIMPIAR LAS IMÁGENES SENTINEL-2
// ============================================================

function limpiarS2(image) {

  var scl = image.select("SCL");

  var mascara = scl.neq(0)      // sin información
    .and(scl.neq(1))            // píxel defectuoso
    .and(scl.neq(3))            // sombra de nube
    .and(scl.neq(8))            // nube media
    .and(scl.neq(9))            // nube alta
    .and(scl.neq(10))           // cirros
    .and(scl.neq(11));          // nieve o hielo

  return image
    .select(["B2", "B3", "B4", "B8", "B11", "B12"])
    .multiply(0.0001)
    .updateMask(mascara)
    .copyProperties(image, ["system:time_start"]);
}


// ============================================================
// 5. CREAR EL COMPUESTO DE 2024
// ============================================================

var coleccion2024 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(areaEstudio)
  .filterDate("2024-01-01", "2025-01-01")
  .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 10))
  .map(limpiarS2);

print("Cantidad de imágenes utilizadas:", coleccion2024.size());

// Mediana de todas las imágenes limpias
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


// ============================================================
// 6. CALCULAR ÍNDICES SOBRE EL COMPUESTO
// ============================================================

// NDVI  (Normalized Difference Vegetation Index)
var ndvi = compuesto2024
  .normalizedDifference(["B8", "B4"])
  .rename("NDVI");

// EVI (Enhanced Vegetation Index)
var evi = compuesto2024.expression(
  "2.5 * ((NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1))",
  { NIR: compuesto2024.select("B8"),
    RED: compuesto2024.select("B4"),
    BLUE: compuesto2024.select("B2") }
).rename("EVI");

// GNDVI (Green Normalized Difference Vegetation Index)
var gndvi = compuesto2024
  .normalizedDifference(["B8", "B3"])
  .rename("GNDVI");
  
// CIG (Chlorophyll Index Green)
var cig = compuesto2024.expression(
  "(NIR / GREEN) - 1",
  { NIR: compuesto2024.select("B8"),
    GREEN: compuesto2024.select("B3") }
).rename("CIG");

// OSAVI (Optimized Soil-Adjusted Vegetation Index)
var osavi = compuesto2024.expression(
  "(NIR - RED) / (NIR + RED + 0.16)",
  { NIR: compuesto2024.select("B8"),
    RED: compuesto2024.select("B4") }
).rename("OSAVI");

// ARVI (Atmospherically Resistant Vegetation Index)
var arvi = compuesto2024.expression(
  "(NIR - (2*RED - BLUE)) / (NIR + (2*RED - BLUE))",
  { NIR: compuesto2024.select("B8"),
    RED: compuesto2024.select("B4"),
    BLUE: compuesto2024.select("B2") }
).rename("ARVI");

// GLI (Green Leaf Index)
var gli = compuesto2024.expression(
  "(2*GREEN - RED - BLUE) / (2*GREEN + RED + BLUE)",
  { GREEN: compuesto2024.select("B3"),
    RED: compuesto2024.select("B4"),
    BLUE: compuesto2024.select("B2") }
).rename("GLI");
  
// MSAVI (Modified Soil-Adjusted Vegetation Index)
var msavi = compuesto2024.expression(
  "(2 * NIR + 1 - sqrt((2 * NIR + 1) * (2 * NIR + 1) - 8 * (NIR - RED))) / 2",
  { NIR: compuesto2024.select("B8"),
    RED: compuesto2024.select("B4") }
).rename("MSAVI");

// SAVI (Soil-Adjusted Vegetation Index)
var savi = compuesto2024.expression(
  "1.5 * ((NIR - RED) / (NIR + RED + 0.5))",
  { NIR: compuesto2024.select("B8"),
    RED: compuesto2024.select("B4") }
).rename("SAVI");

// MSI (Moisture Stress Index)
var msi = compuesto2024.expression(
  "SWIR / NIR",
  { SWIR: compuesto2024.select("B11"),
    NIR: compuesto2024.select("B8") }
).rename("MSI");

// GVMI (Global Vegetation Moisture Index)
var gvmi = compuesto2024.expression(
  "((NIR + 0.1) - (SWIR + 0.02)) / ((NIR + 0.1) + (SWIR + 0.02))",
  { NIR: compuesto2024.select("B8"),
    SWIR: compuesto2024.select("B11") }
).rename("GVMI");

// NDWI (Normalized Difference Water Index)
var ndwi = compuesto2024
  .normalizedDifference(["B3", "B8"])
  .rename("NDWI");

// BSI
var bsi = compuesto2024.expression(
  "((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))",
  { SWIR: compuesto2024.select("B11"),
    RED: compuesto2024.select("B4"),
    NIR: compuesto2024.select("B8"),
    BLUE: compuesto2024.select("B2") }
).rename("BSI");

// NBR (Normalized Burn Ratio)
var nbr = compuesto2024
  .normalizedDifference(["B8", "B12"])
  .rename("NBR");
  
// NDBI (Normalized Difference Built-up Index)
var ndbi = compuesto2024
  .normalizedDifference(["B11", "B8"])
  .rename("NDBI");

// Una imagen con todos los índices
var indices = ee.Image.cat([
  ndvi, evi, gndvi, cig, osavi, arvi, gli, 
  msavi, savi, 
  msi, gvmi, ndwi, 
  bsi, nbr, ndbi ]);


// ============================================================
// 7. MEDIR INTERIOR Y EXTERIOR
// ============================================================

var distanciaEntorno = 30;
var escalaAnalisis = 20;

function medirIndices(feature) {

  var interior = feature.geometry();

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
    "int_NDVI": valoresInterior.get("NDVI"),
    "ext_NDVI": valoresEntorno.get("NDVI"),
    
    "int_EVI": valoresInterior.get("EVI"),
    "ext_EVI": valoresEntorno.get("EVI"),
    
    "int_GNDVI": valoresInterior.get("GNDVI"),
    "ext_GNDVI": valoresEntorno.get("GNDVI"),
    
    "int_CIG": valoresInterior.get("CIG"),
    "ext_CIG": valoresEntorno.get("CIG"),
    
    "int_OSAVI": valoresInterior.get("OSAVI"),
    "ext_OSAVI": valoresEntorno.get("OSAVI"),
    
    "int_ARVI": valoresInterior.get("ARVI"),
    "ext_ARVI": valoresEntorno.get("ARVI"),
    
    "int_GLI": valoresInterior.get("GLI"),
    "ext_GLI": valoresEntorno.get("GLI"),

    "int_MSAVI": valoresInterior.get("MSAVI"),
    "ext_MSAVI": valoresEntorno.get("MSAVI"),
    
    "int_SAVI": valoresInterior.get("SAVI"),
    "ext_SAVI": valoresEntorno.get("SAVI"),

    "int_MSI": valoresInterior.get("MSI"),
    "ext_MSI": valoresEntorno.get("MSI"),
    
    "int_GVMI": valoresInterior.get("GVMI"),
    "ext_GVMI": valoresEntorno.get("GVMI"),
    
    "int_NDWI": valoresInterior.get("NDWI"),
    "ext_NDWI": valoresEntorno.get("NDWI"),

    "int_BSI": valoresInterior.get("BSI"),
    "ext_BSI": valoresEntorno.get("BSI"),
    
    "int_NBR": valoresInterior.get("NBR"),
    "ext_NBR": valoresEntorno.get("NBR"),
    
    "int_NDBI": valoresInterior.get("NDBI"),
    "ext_NDBI": valoresEntorno.get("NDBI")
  });
}


// ============================================================
// 8. ELIMINAR REGISTROS SIN DATOS
// ============================================================

var camposNecesarios = [
  "int_NDVI", "ext_NDVI",
  "int_EVI", "ext_EVI",
  "int_GNDVI", "ext_GNDVI",
  "int_CIG", "ext_CIG",
  "int_OSAVI", "ext_OSAVI",
  "int_ARVI", "ext_ARVI",
  "int_GLI", "ext_GLI",
  "int_MSAVI", "ext_MSAVI",
  "int_SAVI", "ext_SAVI",
  "int_MSI", "ext_MSI",
  "int_GVMI", "ext_GVMI",
  "int_NDWI", "ext_NDWI",
  "int_BSI", "ext_BSI",
  "int_NBR", "ext_NBR",
  "int_NDBI", "ext_NDBI"
];

var medicionesANH = areasANH
  .filterBounds(areaEstudio)
  .map(medirIndices)
  .filter(ee.Filter.notNull(camposNecesarios));

var medicionesQGIS = areasQGIS
  .filterBounds(areaEstudio)
  .map(medirIndices)
  .filter(ee.Filter.notNull(camposNecesarios));


// ============================================================
// 9. CALCULAR CONTRASTES
// ============================================================

function calcularContrastes(feature) {

  return feature.set({
    "dif_NDVI": ee.Number(feature.get("int_NDVI"))
      .subtract(feature.get("ext_NDVI")),
      
    "dif_EVI": ee.Number(feature.get("int_EVI"))
      .subtract(feature.get("ext_EVI")),
      
    "dif_GNDVI": ee.Number(feature.get("int_GNDVI"))
      .subtract(feature.get("ext_GNDVI")),
      
    "dif_CIG": ee.Number(feature.get("int_CIG"))
      .subtract(feature.get("ext_CIG")),
      
    "dif_OSAVI": ee.Number(feature.get("int_OSAVI"))
      .subtract(feature.get("ext_OSAVI")),
      
    "dif_ARVI": ee.Number(feature.get("int_ARVI"))
      .subtract(feature.get("ext_ARVI")),
      
    "dif_GLI": ee.Number(feature.get("int_GLI"))
      .subtract(feature.get("ext_GLI")),

    "dif_MSAVI": ee.Number(feature.get("int_MSAVI"))
      .subtract(feature.get("ext_MSAVI")),
      
    "dif_SAVI": ee.Number(feature.get("int_SAVI"))
      .subtract(feature.get("ext_SAVI")),

    "dif_MSI": ee.Number(feature.get("int_MSI"))
      .subtract(feature.get("ext_MSI")),
      
    "dif_GVMI": ee.Number(feature.get("int_GVMI"))
      .subtract(feature.get("ext_GVMI")),
      
    "dif_NDWI": ee.Number(feature.get("int_NDWI"))
      .subtract(feature.get("ext_NDWI")),

    "dif_BSI": ee.Number(feature.get("int_BSI"))
      .subtract(feature.get("ext_BSI")),
      
    "dif_NBR": ee.Number(feature.get("int_NBR"))
      .subtract(feature.get("ext_NBR")),
      
    "dif_NDBI": ee.Number(feature.get("int_NDBI"))
      .subtract(feature.get("ext_NDBI"))
  });
}

var resultadosANH = medicionesANH.map(calcularContrastes);
var resultadosQGIS = medicionesQGIS.map(calcularContrastes);


// ============================================================
// 10. MOSTRAR RESULTADOS PRINCIPALES
// ============================================================

print("Cantidad válida ANH:", resultadosANH.size());
print("Cantidad válida QGIS:", resultadosQGIS.size());

print("Contraste NDVI ANH:",
  resultadosANH.aggregate_stats("dif_NDVI"));
print("Contraste NDVI QGIS:",
  resultadosQGIS.aggregate_stats("dif_NDVI"));
  
print("Contraste EVI ANH:",
  resultadosANH.aggregate_stats("dif_EVI"));
print("Contraste EVI QGIS:",
  resultadosQGIS.aggregate_stats("dif_EVI"));
  
print("Contraste GNDVI ANH:",
  resultadosANH.aggregate_stats("dif_GNDVI"));
print("Contraste GNDVI QGIS:",
  resultadosQGIS.aggregate_stats("dif_GNDVI"));
  
print("Contraste CIG ANH:",
  resultadosANH.aggregate_stats("dif_CIG"));
print("Contraste CIG QGIS:",
  resultadosQGIS.aggregate_stats("dif_CIG"));
  
print("Contraste OSAVI ANH:",
  resultadosANH.aggregate_stats("dif_OSAVI"));
print("Contraste OSAVI QGIS:",
  resultadosQGIS.aggregate_stats("dif_OSAVI"));
  
print("Contraste ARVI ANH:",
  resultadosANH.aggregate_stats("dif_ARVI"));
print("Contraste ARVI QGIS:",
  resultadosQGIS.aggregate_stats("dif_ARVI"));
  
print("Contraste GLI ANH:",
  resultadosANH.aggregate_stats("dif_GLI"));
print("Contraste GLI QGIS:",
  resultadosQGIS.aggregate_stats("dif_GLI"));

print("Contraste MSAVI ANH:",
  resultadosANH.aggregate_stats("dif_MSAVI"));
print("Contraste MSAVI QGIS:",
  resultadosQGIS.aggregate_stats("dif_MSAVI"));
  
print("Contraste SAVI ANH:",
  resultadosANH.aggregate_stats("dif_SAVI"));
print("Contraste SAVI QGIS:",
  resultadosQGIS.aggregate_stats("dif_SAVI"));

print("Contraste MSI ANH:",
  resultadosANH.aggregate_stats("dif_MSI"));
print("Contraste MSI QGIS:",
  resultadosQGIS.aggregate_stats("dif_MSI"));
  
print("Contraste GVMI ANH:",
  resultadosANH.aggregate_stats("dif_GVMI"));
print("Contraste GVMI QGIS:",
  resultadosQGIS.aggregate_stats("dif_GVMI"));
  
print("Contraste NDWI ANH:",
  resultadosANH.aggregate_stats("dif_NDWI"));
print("Contraste NDWI QGIS:",
  resultadosQGIS.aggregate_stats("dif_NDWI"));

print("Contraste BSI ANH:",
  resultadosANH.aggregate_stats("dif_BSI"));
print("Contraste BSI QGIS:",
  resultadosQGIS.aggregate_stats("dif_BSI"));
  
print("Contraste NBR ANH:",
  resultadosANH.aggregate_stats("dif_NBR"));
print("Contraste NBR QGIS:",
  resultadosQGIS.aggregate_stats("dif_NBR"));
  
print("Contraste NDBI ANH:",
  resultadosANH.aggregate_stats("dif_NDBI"));
print("Contraste NDBI QGIS:",
  resultadosQGIS.aggregate_stats("dif_NDBI"));


// ============================================================
// 11. CENTRAR EL MAPA
// ============================================================

Map.centerObject(poligonosLocales, 12);


// ============================================================
// 12. TABLA FINAL
// ============================================================
var tablaANH = resultadosANH.map(function(feature) {
  return feature.set("grupo", "ANH");
});

var tablaQGIS = resultadosQGIS.map(function(feature) {
  return feature.set("grupo", "QGIS");
});

var tablaCompleta = tablaANH.merge(tablaQGIS);

Export.table.toDrive({
  collection: tablaCompleta,
  description: "GEE_01_Contrastes_indices_30m",
  folder: "Resultados_Tesis",
  fileNamePrefix: "GEE_01_Contrastes_indices_30m",
  fileFormat: "CSV",
  selectors: [
    "grupo",
    "radio_m",
    "dif_NDVI",
    "dif_MSAVI",
    "dif_MSI",
    "dif_BSI",
    "dif_GVMI",
    "dif_EVI",
    "dif_GNDVI",
    "dif_CIG",
    "dif_OSAVI",
    "dif_ARVI",
    "dif_SAVI",
    "dif_GLI",
    "dif_NDWI",
    "dif_NBR",
    "dif_NDBI"
  ]
});