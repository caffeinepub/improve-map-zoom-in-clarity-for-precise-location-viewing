import { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, AlertTriangle, Satellite, Plus, Minus, Loader2, Navigation2, Gauge, Locate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DeviceInfoDialog from './DeviceInfoDialog';
import type { LocationData, TrackingStatus, TrailPoint } from '../App';

interface MapViewProps {
  location: LocationData | null;
  isTracking: boolean;
  trackingStatus: TrackingStatus;
  trailPath: TrailPoint[];
}

const TILE_SIZE = 256;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;
const MIN_ZOOM = 3;
const MAX_ZOOM = 19;
const DEFAULT_ZOOM = 16;
const MARKER_CLICK_RADIUS = 30;
const PINCH_ZOOM_SENSITIVITY = 0.005;

type TileProvider = 'esri' | 'google' | 'osm';

interface MapCenter {
  lat: number;
  lon: number;
}

// Web Mercator projection utilities for consistent coordinate mapping
function latLonToWorldPixel(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const scale = Math.pow(2, zoom);
  const worldSize = TILE_SIZE * scale;
  
  // Convert longitude to world X
  const x = ((lon + 180) / 360) * worldSize;
  
  // Convert latitude to world Y using Web Mercator
  const latRad = lat * Math.PI / 180;
  const mercatorY = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = (0.5 - mercatorY / (2 * Math.PI)) * worldSize;
  
  return { x, y };
}

function worldPixelToLatLon(x: number, y: number, zoom: number): { lat: number; lon: number } {
  const scale = Math.pow(2, zoom);
  const worldSize = TILE_SIZE * scale;
  
  // Convert world X to longitude
  const lon = (x / worldSize) * 360 - 180;
  
  // Convert world Y to latitude using inverse Web Mercator
  const mercatorY = (0.5 - y / worldSize) * (2 * Math.PI);
  const latRad = 2 * Math.atan(Math.exp(mercatorY)) - Math.PI / 2;
  const lat = latRad * 180 / Math.PI;
  
  return { lat, lon };
}

function latLonToTile(lat: number, lon: number, zoom: number) {
  const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
  return { x, y };
}

export default function MapView({ location, isTracking, trackingStatus, trailPath }: MapViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pulseScale, setPulseScale] = useState(1);
  const [tileCache] = useState<Map<string, HTMLImageElement>>(new Map());
  const [currentProvider, setCurrentProvider] = useState<TileProvider>('esri');
  const [providerFallbackAttempts, setProviderFallbackAttempts] = useState<Record<TileProvider, number>>({
    esri: 0,
    google: 0,
    osm: 0,
  });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [isAutoFollow, setIsAutoFollow] = useState(true);
  const [manualCenter, setManualCenter] = useState<MapCenter | null>(null);
  const [isDeviceInfoOpen, setIsDeviceInfoOpen] = useState(false);
  const [markerHovered, setMarkerHovered] = useState(false);
  const lastLocationRef = useRef<LocationData | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);
  const lastDrawTimeRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; centerLat: number; centerLon: number } | null>(null);
  const markerPositionRef = useRef<{ x: number; y: number } | null>(null);
  
  const isPinchingRef = useRef(false);
  const lastPinchDistanceRef = useRef<number | null>(null);
  const pinchCenterZoomRef = useRef<number>(DEFAULT_ZOOM);

  // Determine tile scale based on device pixel ratio
  const getTileScale = useCallback((): number => {
    const dpr = window.devicePixelRatio || 1;
    return dpr >= 2 ? 2 : 1;
  }, []);

  const getTileUrl = useCallback((x: number, y: number, z: number, provider: TileProvider, scale: number = 1): string => {
    switch (provider) {
      case 'esri':
        return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
      case 'google':
        if (scale === 2) {
          return `https://mt1.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}&scale=2`;
        }
        return `https://mt1.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`;
      case 'osm':
        return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
      default:
        return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    }
  }, []);

  const loadTile = useCallback((x: number, y: number, z: number, scale: number = 1, attempt = 0): Promise<HTMLImageElement> => {
    const key = `${currentProvider}:${scale}x:${z}/${x}/${y}`;
    
    if (tileCache.has(key)) {
      return Promise.resolve(tileCache.get(key)!);
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        tileCache.set(key, img);
        setProviderFallbackAttempts(prev => ({ ...prev, [currentProvider]: 0 }));
        resolve(img);
      };
      
      img.onerror = () => {
        if (attempt < MAX_RETRY_ATTEMPTS) {
          setTimeout(() => {
            loadTile(x, y, z, scale, attempt + 1).then(resolve).catch(reject);
          }, RETRY_DELAY * Math.pow(2, attempt));
        } else {
          const newAttempts = { ...providerFallbackAttempts, [currentProvider]: providerFallbackAttempts[currentProvider] + 1 };
          setProviderFallbackAttempts(newAttempts);

          if (currentProvider === 'esri' && newAttempts.esri >= 3) {
            console.warn('Esri tiles failed, falling back to Google Satellite');
            setCurrentProvider('google');
          } else if (currentProvider === 'google' && newAttempts.google >= 3) {
            console.warn('Google tiles failed, falling back to OpenStreetMap');
            setCurrentProvider('osm');
          }
          
          reject(new Error(`Failed to load tile ${key} after ${MAX_RETRY_ATTEMPTS} attempts`));
        }
      };

      img.src = getTileUrl(x, y, z, currentProvider, scale);
    });
  }, [currentProvider, providerFallbackAttempts, tileCache, getTileUrl]);

  const getMapCenter = useCallback((): MapCenter | null => {
    if (!isAutoFollow && manualCenter) {
      return manualCenter;
    }
    if (location) {
      return { lat: location.latitude, lon: location.longitude };
    }
    return null;
  }, [isAutoFollow, manualCenter, location]);

  const isNearMarker = useCallback((x: number, y: number): boolean => {
    if (!markerPositionRef.current) return false;
    const dx = x - markerPositionRef.current.x;
    const dy = y - markerPositionRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= MARKER_CLICK_RADIUS;
  }, []);

  const drawMap = useCallback(() => {
    const now = Date.now();
    if (now - lastDrawTimeRef.current < 50 && isDrawingRef.current) {
      return;
    }
    lastDrawTimeRef.current = now;

    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    const canvas = canvasRef.current;
    if (!canvas) {
      isDrawingRef.current = false;
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) {
      isDrawingRef.current = false;
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    const center = getMapCenter();
    if (!center) {
      ctx.fillStyle = 'oklch(0.95 0 0)';
      ctx.fillRect(0, 0, width, height);
      
      ctx.strokeStyle = 'oklch(0.85 0 0)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      
      for (let x = 0; x <= width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      
      for (let y = 0; y <= height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      
      isDrawingRef.current = false;
      return;
    }

    // Use consistent world-pixel projection for center
    const centerWorld = latLonToWorldPixel(center.lat, center.lon, zoom);
    
    // Calculate which tiles to render
    const tilesX = Math.ceil(width / TILE_SIZE) + 2;
    const tilesY = Math.ceil(height / TILE_SIZE) + 2;
    
    const centerTile = latLonToTile(center.lat, center.lon, zoom);
    const startTileX = centerTile.x - Math.floor(tilesX / 2);
    const startTileY = centerTile.y - Math.floor(tilesY / 2);

    ctx.fillStyle = 'oklch(0.95 0 0)';
    ctx.fillRect(0, 0, width, height);

    const tileScale = getTileScale();
    const tilesToLoad: Promise<void>[] = [];
    
    ctx.imageSmoothingEnabled = false;
    
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const tileX = startTileX + tx;
        const tileY = startTileY + ty;
        
        // Calculate tile position using world coordinates
        const tileWorldX = tileX * TILE_SIZE;
        const tileWorldY = tileY * TILE_SIZE;
        
        const posX = width / 2 + (tileWorldX - centerWorld.x);
        const posY = height / 2 + (tileWorldY - centerWorld.y);
        
        const tilePromise = loadTile(tileX, tileY, zoom, tileScale)
          .then(img => {
            ctx.drawImage(img, posX, posY, TILE_SIZE, TILE_SIZE);
          })
          .catch(() => {
            ctx.fillStyle = 'oklch(0.9 0 0)';
            ctx.fillRect(posX, posY, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = 'oklch(0.8 0 0)';
            ctx.lineWidth = 1;
            ctx.strokeRect(posX, posY, TILE_SIZE, TILE_SIZE);
          });
        
        tilesToLoad.push(tilePromise);
      }
    }

    Promise.all(tilesToLoad).then(() => {
      ctx.imageSmoothingEnabled = true;
      
      // Draw trail path using consistent world-pixel projection
      if (trailPath.length > 1) {
        ctx.beginPath();
        
        for (let i = 0; i < trailPath.length; i++) {
          const point = trailPath[i];
          const pointWorld = latLonToWorldPixel(point.latitude, point.longitude, zoom);
          
          const pointX = width / 2 + (pointWorld.x - centerWorld.x);
          const pointY = height / 2 + (pointWorld.y - centerWorld.y);
          
          if (i === 0) {
            ctx.moveTo(pointX, pointY);
          } else {
            ctx.lineTo(pointX, pointY);
          }
        }
        
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
        
        ctx.strokeStyle = 'oklch(0.55 0.22 250)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = 'oklch(0.65 0.25 250)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw user location marker using consistent world-pixel projection
      if (location) {
        const userWorld = latLonToWorldPixel(location.latitude, location.longitude, zoom);
        
        const userX = width / 2 + (userWorld.x - centerWorld.x);
        const userY = height / 2 + (userWorld.y - centerWorld.y);

        markerPositionRef.current = { x: userX, y: userY };

        const isGPSActive = trackingStatus === 'tracking';
        const accuracyRadius = Math.min(Math.max(location.accuracy / 10, 20), 100);
        
        ctx.beginPath();
        ctx.arc(userX, userY, accuracyRadius, 0, Math.PI * 2);
        ctx.fillStyle = isGPSActive ? 'oklch(0.55 0.22 250 / 0.15)' : 'oklch(0.50 0.10 0 / 0.15)';
        ctx.fill();
        ctx.strokeStyle = isGPSActive ? 'oklch(0.55 0.22 250 / 0.4)' : 'oklch(0.50 0.10 0 / 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();

        if (isGPSActive) {
          const pulseRadius = 30 * pulseScale;
          const gradient = ctx.createRadialGradient(userX, userY, 0, userX, userY, pulseRadius);
          gradient.addColorStop(0, 'oklch(0.55 0.22 250 / 0.5)');
          gradient.addColorStop(1, 'oklch(0.55 0.22 250 / 0)');
          ctx.beginPath();
          ctx.arc(userX, userY, pulseRadius, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();
        }

        const markerRadius = markerHovered ? 14 : 12;
        const markerScale = markerHovered ? 1.1 : 1;

        ctx.shadowColor = markerHovered ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = markerHovered ? 12 : 8;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
        
        ctx.beginPath();
        ctx.arc(userX, userY, markerRadius * markerScale, 0, Math.PI * 2);
        ctx.fillStyle = isGPSActive ? 'oklch(0.55 0.22 250)' : 'oklch(0.50 0.10 0)';
        ctx.fill();
        
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = markerHovered ? 4 : 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(userX, userY, 6 * markerScale, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();

        if (location.heading !== null && location.speed !== null && location.speed > 0.5) {
          ctx.save();
          ctx.translate(userX, userY);
          ctx.rotate((location.heading - 90) * Math.PI / 180);
          
          ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 2;
          
          ctx.beginPath();
          ctx.moveTo(20, 0);
          ctx.lineTo(-10, -8);
          ctx.lineTo(-10, 8);
          ctx.closePath();
          ctx.fillStyle = 'oklch(0.65 0.25 30)';
          ctx.fill();
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          ctx.stroke();
          
          ctx.restore();
        }
      }
      
      isDrawingRef.current = false;
    }).catch((err) => {
      console.error('Error loading tiles:', err);
      isDrawingRef.current = false;
    });
  }, [location, pulseScale, zoom, loadTile, trackingStatus, getMapCenter, markerHovered, trailPath, getTileScale]);

  const handleZoomIn = useCallback(() => {
    setZoom(prevZoom => Math.min(prevZoom + 1, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prevZoom => Math.max(prevZoom - 1, MIN_ZOOM));
  }, []);

  const handleRecenter = useCallback(() => {
    if (location) {
      setIsAutoFollow(true);
      setManualCenter(null);
    }
  }, [location]);

  const handleViewLastLocation = useCallback(() => {
    if (location) {
      setIsAutoFollow(true);
      setManualCenter(null);
    }
  }, [location]);

  const getTouchDistance = useCallback((touches: React.TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      isPinchingRef.current = true;
      lastPinchDistanceRef.current = getTouchDistance(e.touches);
      pinchCenterZoomRef.current = zoom;
      
      isDraggingRef.current = false;
      dragStartRef.current = null;
    } else if (e.touches.length === 1) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      const y = e.touches[0].clientY - rect.top;

      if (location && isNearMarker(x, y)) {
        setIsDeviceInfoOpen(true);
        return;
      }

      const center = getMapCenter();
      if (!center) return;

      isDraggingRef.current = true;
      dragStartRef.current = {
        x,
        y,
        centerLat: center.lat,
        centerLon: center.lon,
      };
    }
  }, [getTouchDistance, zoom, location, isNearMarker, getMapCenter]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2 && isPinchingRef.current) {
      e.preventDefault();
      
      const currentDistance = getTouchDistance(e.touches);
      if (lastPinchDistanceRef.current === null) return;

      const distanceDelta = currentDistance - lastPinchDistanceRef.current;
      const zoomDelta = distanceDelta * PINCH_ZOOM_SENSITIVITY;
      
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchCenterZoomRef.current + zoomDelta));
      
      setZoom(newZoom);
      lastPinchDistanceRef.current = currentDistance;
    } else if (e.touches.length === 1 && isDraggingRef.current && dragStartRef.current) {
      e.preventDefault();
      
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const currentX = e.touches[0].clientX - rect.left;
      const currentY = e.touches[0].clientY - rect.top;

      const deltaX = currentX - dragStartRef.current.x;
      const deltaY = currentY - dragStartRef.current.y;

      const scale = Math.pow(2, zoom);
      const worldSize = TILE_SIZE * scale;
      
      const latDelta = -(deltaY / worldSize) * 360;
      const lonDelta = -(deltaX / worldSize) * 360;

      const newCenter = {
        lat: Math.max(-85, Math.min(85, dragStartRef.current.centerLat + latDelta)),
        lon: ((dragStartRef.current.centerLon + lonDelta + 180) % 360) - 180,
      };

      setManualCenter(newCenter);
      setIsAutoFollow(false);
    }
  }, [getTouchDistance, zoom]);

  const handleTouchEnd = useCallback(() => {
    isPinchingRef.current = false;
    lastPinchDistanceRef.current = null;
    isDraggingRef.current = false;
    dragStartRef.current = null;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (location && isNearMarker(x, y)) {
      setIsDeviceInfoOpen(true);
      return;
    }

    const center = getMapCenter();
    if (!center) return;

    isDraggingRef.current = true;
    dragStartRef.current = {
      x,
      y,
      centerLat: center.lat,
      centerLon: center.lon,
    };
  }, [location, isNearMarker, getMapCenter]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const wasHovered = markerHovered;
    const isHovered = location ? isNearMarker(x, y) : false;
    
    if (isHovered !== wasHovered) {
      setMarkerHovered(isHovered);
      canvas.style.cursor = isHovered ? 'pointer' : isDraggingRef.current ? 'grabbing' : 'grab';
    }

    if (isDraggingRef.current && dragStartRef.current) {
      const deltaX = x - dragStartRef.current.x;
      const deltaY = y - dragStartRef.current.y;

      const scale = Math.pow(2, zoom);
      const worldSize = TILE_SIZE * scale;
      
      const latDelta = -(deltaY / worldSize) * 360;
      const lonDelta = -(deltaX / worldSize) * 360;

      const newCenter = {
        lat: Math.max(-85, Math.min(85, dragStartRef.current.centerLat + latDelta)),
        lon: ((dragStartRef.current.centerLon + lonDelta + 180) % 360) - 180,
      };

      setManualCenter(newCenter);
      setIsAutoFollow(false);
    }
  }, [location, isNearMarker, markerHovered, zoom]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    dragStartRef.current = null;
    
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = markerHovered ? 'pointer' : 'grab';
    }
  }, [markerHovered]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? -1 : 1;
    setZoom(prevZoom => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prevZoom + delta)));
  }, []);

  useEffect(() => {
    const pulseInterval = setInterval(() => {
      setPulseScale(prev => (prev >= 1.5 ? 1 : prev + 0.05));
    }, 50);

    return () => clearInterval(pulseInterval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.style.cursor = markerHovered ? 'pointer' : isDraggingRef.current ? 'grabbing' : 'grab';
  }, [markerHovered]);

  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    animationFrameRef.current = requestAnimationFrame(() => {
      drawMap();
    });

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [drawMap]);

  const providerName = currentProvider === 'esri' ? 'Esri Satellite' : currentProvider === 'google' ? 'Google Satellite' : 'OpenStreetMap';

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-border/50 bg-muted/30">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      
      <div className="absolute left-4 top-4 flex flex-col gap-2">
        <Button
          size="icon"
          variant="secondary"
          onClick={handleZoomIn}
          disabled={zoom >= MAX_ZOOM}
          className="h-10 w-10 shadow-lg"
        >
          <Plus className="h-5 w-5" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          onClick={handleZoomOut}
          disabled={zoom <= MIN_ZOOM}
          className="h-10 w-10 shadow-lg"
        >
          <Minus className="h-5 w-5" />
        </Button>
      </div>

      <div className="absolute right-4 top-4 flex flex-col gap-2">
        {!isAutoFollow && location && (
          <Button
            size="icon"
            variant="secondary"
            onClick={handleRecenter}
            className="h-10 w-10 shadow-lg"
            title="Recenter on current location"
          >
            <Locate className="h-5 w-5" />
          </Button>
        )}
      </div>

      <div className="absolute bottom-4 left-4 flex flex-col gap-2">
        <Badge variant="secondary" className="shadow-lg">
          <Satellite className="mr-1 h-3 w-3" />
          Zoom: {zoom}
        </Badge>
        <Badge variant="secondary" className="shadow-lg text-xs">
          {providerName}
        </Badge>
      </div>

      {trackingStatus === 'searching' && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Searching for GPS signal...</p>
          </div>
        </div>
      )}

      {trackingStatus === 'denied' && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">Location Access Denied</p>
            <p className="text-xs text-muted-foreground">
              Please enable location permissions to use this feature
            </p>
          </div>
        </div>
      )}

      <DeviceInfoDialog 
        open={isDeviceInfoOpen} 
        onOpenChange={setIsDeviceInfoOpen}
        location={location}
      />
    </div>
  );
}
