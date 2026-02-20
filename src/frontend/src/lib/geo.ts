// Web Mercator projection utilities

const TILE_SIZE = 256;

export function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  
  const x = ((lng + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  
  return { x, y };
}

export function tileToLatLng(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const n = Math.pow(2, zoom);
  
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  
  return { lat, lng };
}

export function getMetersPerPixel(latitude: number, zoom: number): number {
  const earthCircumference = 40075017; // meters at equator
  const latitudeRadians = (latitude * Math.PI) / 180;
  
  return (earthCircumference * Math.cos(latitudeRadians)) / (TILE_SIZE * Math.pow(2, zoom));
}

export function getAccuracyRadiusPixels(accuracyMeters: number, latitude: number, zoom: number): number {
  const metersPerPixel = getMetersPerPixel(latitude, zoom);
  return accuracyMeters / metersPerPixel;
}

export function getOptimalZoom(accuracyMeters: number, viewportWidth: number): number {
  // Calculate zoom level where accuracy circle fits nicely in viewport
  const targetPixels = viewportWidth * 0.3; // 30% of viewport
  const devicePixelRatio = window.devicePixelRatio || 1;
  
  // Start from zoom 16 and adjust
  for (let zoom = 19; zoom >= 3; zoom--) {
    const metersPerPixel = getMetersPerPixel(0, zoom); // Use equator for estimation
    const radiusPixels = accuracyMeters / metersPerPixel;
    
    if (radiusPixels * devicePixelRatio <= targetPixels) {
      return zoom;
    }
  }
  
  return 16; // Default fallback
}
