// Slippy-map tile conversion. Single static tile per SI; cached client-side.
// Reference: https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames

export function latLngToTile(lat: number, lng: number, zoom: number): { z: number; x: number; y: number } {
  const z = Math.floor(zoom)
  const n = 2 ** z
  const x = Math.floor(((lng + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
  return { z, x, y }
}

export function tileUrl(z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
}

export const OSM_ATTRIBUTION = '© OpenStreetMap'
