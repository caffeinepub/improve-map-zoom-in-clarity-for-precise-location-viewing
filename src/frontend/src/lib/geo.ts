/**
 * Geospatial utility functions for Web Mercator projection and GPS accuracy visualization
 */

/**
 * Calculate meters per pixel at a given latitude and zoom level for Web Mercator projection
 * @param latitude - Latitude in degrees
 * @param zoom - Integer zoom level (should be rounded before calling)
 * @returns Meters per pixel at the given latitude and zoom
 */
export function metersPerPixel(latitude: number, zoom: number): number {
  const earthCircumference = 40075017; // Earth's circumference at equator in meters
  const latitudeRadians = latitude * Math.PI / 180;
  return (earthCircumference * Math.cos(latitudeRadians)) / (256 * Math.pow(2, zoom));
}

/**
 * Convert GPS accuracy in meters to pixel radius for display on map
 * @param accuracyMeters - GPS accuracy in meters
 * @param latitude - Current latitude in degrees
 * @param zoom - Integer zoom level (should be rounded before calling)
 * @returns Radius in pixels for drawing accuracy circle
 */
export function accuracyMetersToPixels(accuracyMeters: number, latitude: number, zoom: number): number {
  const mpp = metersPerPixel(latitude, zoom);
  return accuracyMeters / mpp;
}

/**
 * Calculate optimal tile zoom level accounting for device pixel ratio
 * For high-DPI displays (retina), we request higher resolution tiles
 * @param displayZoom - Current display zoom level
 * @param devicePixelRatio - Device pixel ratio (window.devicePixelRatio)
 * @returns Optimal tile zoom level for requesting tiles
 */
export function getOptimalTileZoom(displayZoom: number, devicePixelRatio: number): number {
  const baseZoom = Math.round(displayZoom);
  
  // For retina displays (DPR >= 2), request one zoom level higher for sharper tiles
  // But cap at reasonable limits to avoid excessive tile requests
  if (devicePixelRatio >= 2 && baseZoom < 19) {
    return Math.min(baseZoom + 1, 19);
  }
  
  return baseZoom;
}
