import * as Cesium from 'cesium';

// Attribution and service rights are documented in DATA_SOURCES.md.
export const ESRI_ATTRIBUTION_HTML =
  '<a href="https://www.esri.com" target="_blank" rel="noopener">Powered by Esri</a>';

export function createOsmImagery() {
  return new Cesium.OpenStreetMapImageryProvider({
    url: 'https://tile.openstreetmap.org/',
    credit: '© OpenStreetMap contributors',
  });
}

export function createEsriImagery() {
  return Cesium.ArcGisMapServerImageryProvider.fromUrl(
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
    {
      credit:
        'Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      enablePickFeatures: false,
    },
  );
}

// USGS The National Map orthoimagery: public domain; USDA NAIP at about 1 m
// over the lower 48, Landsat and Blue Marble at small scales. The cache stops
// at level 16 (1:9,028).
export const USGS_IMAGERY_URL =
  'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';
export const USGS_IMAGERY_MAX_LEVEL = 16;
export const USGS_IMAGERY_CREDIT = 'USDA, USGS The National Map: Orthoimagery';

const BLANK_SAMPLES_PER_SIDE = 4;
const BLANK_WHITE_MIN = 250;

/**
 * Whether sampled RGBA pixels are all fully transparent or all white: the
 * placeholders USGS serves outside its coverage (offshore past level 8, abroad
 * past level 11). Pure, exported for tests.
 * @param {ArrayLike<number>} rgba Flat RGBA samples.
 */
export function isBlankTileSample(rgba) {
  if (!rgba?.length) return false;
  let transparent = true;
  let white = true;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] !== 0) transparent = false;
    if (
      rgba[i] < BLANK_WHITE_MIN ||
      rgba[i + 1] < BLANK_WHITE_MIN ||
      rgba[i + 2] < BLANK_WHITE_MIN ||
      rgba[i + 3] !== 255
    )
      white = false;
    if (!transparent && !white) return false;
  }
  return true;
}

function readTileSample(image, context) {
  const width = image?.width || 0;
  const height = image?.height || 0;
  if (!width || !height || !context) return null;
  context.canvas.width = width;
  context.canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0);
  const samples = [];
  for (let row = 0; row < BLANK_SAMPLES_PER_SIDE; row++)
    for (let col = 0; col < BLANK_SAMPLES_PER_SIDE; col++) {
      const x = Math.floor(((col + 0.5) * width) / BLANK_SAMPLES_PER_SIDE);
      const y = Math.floor(((row + 0.5) * height) / BLANK_SAMPLES_PER_SIDE);
      samples.push(...context.getImageData(x, y, 1, 1).data);
    }
  return samples;
}

function createSampleContext() {
  const canvas =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(256, 256)
      : globalThis.document?.createElement('canvas');
  return canvas?.getContext('2d', { willReadFrequently: true }) || null;
}

/**
 * A Cesium tile discard policy that drops blank placeholder tiles, so the
 * globe keeps the parent tile instead of showing white or the base colour.
 * @param {{readSample?: (image: object) => ArrayLike<number>|null}} [options]
 */
export function createBlankTileDiscardPolicy({ readSample } = {}) {
  let context;
  const read =
    readSample ||
    ((image) => readTileSample(image, (context ??= createSampleContext())));
  return {
    isReady: () => true,
    shouldDiscardImage(image) {
      try {
        return isBlankTileSample(read(image));
      } catch {
        return false;
      }
    },
  };
}

export function createUsgsImagery() {
  const provider = new Cesium.UrlTemplateImageryProvider({
    url: USGS_IMAGERY_URL,
    maximumLevel: USGS_IMAGERY_MAX_LEVEL,
    credit: USGS_IMAGERY_CREDIT,
    tileDiscardPolicy: createBlankTileDiscardPolicy(),
  });
  // Outside the coverage some tiles answer 404; Cesium keeps the parent tile.
  // A listener stops Cesium logging each one to the console.
  provider.errorEvent.addEventListener(() => {});
  return provider;
}

export function createIonImagery(style, accessToken) {
  accessToken = String(accessToken || '').trim();
  if (!accessToken) throw new Error('Ion imagery requires an explicit token');
  return Cesium.IonImageryProvider.fromAssetId(style, { accessToken });
}
