// ============================================================================
// GEE_03_ANALISIS_MORFOLOGICO_CIRCULARIDAD_60m
// ============================================================================
// Objetivo:
// Resumir la circularidad original de los candidatos QGIS, compararla con la
// circularidad calculada para los registros ANH y describirla por prioridad
// espectral de GEE_02.
//
// La circularidad QGIS se lee del atributo "circularid". La geometría del
// asset puede representar círculos equivalentes para medir índices espectrales;
// por eso no se usa esa geometría para recalcular la circularidad QGIS.
// ============================================================================


// ============================================================================
// 1. DATOS DE ENTRADA
// ============================================================================

var candidatos = ee.FeatureCollection(
  "projects/tesis-474203/assets/ClasificacionEspectral60m"
);

var areaEstudio = ee.FeatureCollection(
  "projects/tesis-474203/assets/AreaEstudio"
);

var circulosANH = ee.FeatureCollection(
  "projects/tesis-474203/assets/CirculosANH"
);

var campoCircularidadQGIS = "circularid";
var carpetaSalida = "Resultados_Tesis";

Map.addLayer(areaEstudio, {color: "white"}, "Área de estudio");
Map.addLayer(candidatos, {color: "red"}, "Candidatos QGIS", false);
Map.centerObject(areaEstudio, 10);

print("Candidatos recibidos:", candidatos.size());
print("Propiedades del primer candidato:", candidatos.first());


// ============================================================================
// 2. VALIDAR Y DESCRIBIR LA CIRCULARIDAD DE LOS CANDIDATOS QGIS
// ============================================================================

var candidatosConCircularidad = candidatos.filter(
  ee.Filter.notNull([campoCircularidadQGIS])
);

var cantidadSinCircularidad = candidatos.size()
  .subtract(candidatosConCircularidad.size());

print("Candidatos con circularidad:", candidatosConCircularidad.size());
print("Candidatos sin circularidad:", cantidadSinCircularidad);
print(
  "Resumen de circularidad QGIS:",
  candidatosConCircularidad.aggregate_stats(campoCircularidadQGIS)
);

var percentilesQGIS = candidatosConCircularidad.reduceColumns({
  reducer: ee.Reducer.percentile([5, 25, 50, 75, 95]),
  selectors: [campoCircularidadQGIS]
});

print("Percentiles de circularidad QGIS:", percentilesQGIS);

print(
  "Candidatos QGIS con circularidad mayor que 1 (revisar):",
  candidatosConCircularidad
    .filter(ee.Filter.gt(campoCircularidadQGIS, 1))
    .size()
);


// ============================================================================
// 3. CALCULAR LA CIRCULARIDAD DE LOS REGISTROS ANH
// ============================================================================

var anhValidos = circulosANH
  .filter(ee.Filter.notNull(["AREA", "PERIMETRO"]))
  .filter(ee.Filter.gt("AREA", 0))
  .filter(ee.Filter.gt("PERIMETRO", 0));

var circularidadANH = anhValidos.map(function(feature) {
  var area = ee.Number(feature.get("AREA"));
  var perimetro = ee.Number(feature.get("PERIMETRO"));

  var circularidadCalculada = area
    .multiply(4 * Math.PI)
    .divide(perimetro.pow(2));

  return feature.set("circularidad_calculada", circularidadCalculada);
});

print("Registros ANH válidos para el cálculo:", circularidadANH.size());
print(
  "Resumen de circularidad ANH:",
  circularidadANH.aggregate_stats("circularidad_calculada")
);

var percentilesANH = circularidadANH.reduceColumns({
  reducer: ee.Reducer.percentile([5, 25, 50, 75, 95]),
  selectors: ["circularidad_calculada"]
});

print("Percentiles de circularidad ANH:", percentilesANH);
print(
  "Registros ANH con circularidad mayor que 1 (revisar):",
  circularidadANH
    .filter(ee.Filter.gt("circularidad_calculada", 1))
    .size()
);


// ============================================================================
// 4. CONSTRUIR UN RESUMEN EXPORTABLE
// ============================================================================
// El CSV incluirá una fila para ANH, una para el total QGIS y una por cada
// categoría de prioridad espectral presente en el asset.

function crearResumenCircularidad(coleccion, nombreGrupo, campo) {
  var estadisticas = coleccion.aggregate_stats(campo);
  var percentiles = coleccion.reduceColumns({
    reducer: ee.Reducer.percentile([5, 25, 50, 75, 95]),
    selectors: [campo]
  });

  return ee.Feature(null, {
    grupo: nombreGrupo,
    n: coleccion.size(),
    media: estadisticas.get("mean"),
    desviacion_estandar: estadisticas.get("sample_sd"),
    minimo: estadisticas.get("min"),
    p5: percentiles.get("p5"),
    p25: percentiles.get("p25"),
    p50: percentiles.get("p50"),
    p75: percentiles.get("p75"),
    p95: percentiles.get("p95"),
    maximo: estadisticas.get("max")
  });
}

var candidatosConPrioridad = candidatosConCircularidad.filter(
  ee.Filter.notNull(["prioridad_espectral"])
);

var categoriasPrioridad = ee.List(
  candidatosConPrioridad.aggregate_array("prioridad_espectral")
).distinct().sort();

var resumenPorPrioridad = ee.FeatureCollection(
  categoriasPrioridad.map(function(categoria) {
    var grupo = candidatosConPrioridad.filter(
      ee.Filter.eq("prioridad_espectral", categoria)
    );

    var nombreGrupo = ee.String("QGIS_").cat(ee.String(categoria));

    return crearResumenCircularidad(
      grupo,
      nombreGrupo,
      campoCircularidadQGIS
    );
  })
);

var resumenGeneral = ee.FeatureCollection([
  crearResumenCircularidad(
    circularidadANH,
    "ANH_total",
    "circularidad_calculada"
  ),
  crearResumenCircularidad(
    candidatosConCircularidad,
    "QGIS_total",
    campoCircularidadQGIS
  )
]);

var resumenCircularidad = resumenGeneral.merge(resumenPorPrioridad);

print(
  "Conteo de candidatos por prioridad espectral:",
  candidatosConPrioridad.aggregate_histogram("prioridad_espectral")
);
print("Resumen de circularidad para exportar:", resumenCircularidad);


// ============================================================================
// 5. EXPORTAR EL RESUMEN A CSV
// ============================================================================

Export.table.toDrive({
  collection: resumenCircularidad,
  description: "GEE03_Resumen_Circularidad_QGIS_ANH_60m",
  folder: carpetaSalida,
  fileNamePrefix: "GEE03_Resumen_Circularidad_QGIS_ANH_60m",
  fileFormat: "CSV",
  selectors: [
    "grupo", "n", "media", "desviacion_estandar", "minimo",
    "p5", "p25", "p50", "p75", "p95", "maximo"
  ]
});