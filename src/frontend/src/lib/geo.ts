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
