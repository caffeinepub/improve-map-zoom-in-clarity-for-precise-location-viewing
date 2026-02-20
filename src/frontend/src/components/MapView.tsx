import { useEffect, useRef, useState } from 'react';
import { Play, Square, RotateCcw, Crosshair } from 'lucide-react';
import { Button } from './ui/button';
import { latLngToTile, tileToLatLng, getMetersPerPixel, getAccuracyRadiusPixels } from '../lib/geo';

interface Position {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

interface TrailPoint {
  lat: number;
  lng: number;
  timestamp: number;
}

interface MapViewProps {
  position: Position | null;
  trail: TrailPoint[];
  isTracking: boolean;
  onStartTracking: () => void;
  onStopTracking: () => void;
  onReset: () => void;
}

const TILE_SIZE = 256;

// Accuracy quality thresholds and colors
const getAccuracyColor = (accuracy: number): { fill: string; stroke: string; label: string } => {
  if (accuracy < 5) {
    return {
      fill: 'rgba(34, 197, 94, 0.2)',
      stroke: 'rgba(34, 197, 94, 0.6)',
      label: 'Excellent',
    };
  }
  if (accuracy < 10) {
    return {
      fill: 'rgba(6, 182, 212, 0.2)',
      stroke: 'rgba(6, 182, 212, 0.6)',
      label: 'Good',
    };
  }
  if (accuracy < 20) {
    return {
      fill: 'rgba(234, 179, 8, 0.2)',
      stroke: 'rgba(234, 179, 8, 0.6)',
      label: 'Fair',
    };
  }
  return {
    fill: 'rgba(239, 68, 68, 0.2)',
    stroke: 'rgba(239, 68, 68, 0.6)',
    label: 'Poor',
  };
};

export default function MapView({
  position,
  trail,
  isTracking,
  onStartTracking,
  onStopTracking,
  onReset,
}: MapViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(16);
  const [center, setCenter] = useState({ lat: 0, lng: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [autoCenter, setAutoCenter] = useState(true);
  const tileCache = useRef<Map<string, HTMLImageElement>>(new Map());

  // Initialize center from position
  useEffect(() => {
    if (position && autoCenter) {
      setCenter({ lat: position.latitude, lng: position.longitude });
    }
  }, [position, autoCenter]);

  // Load tile image
  const loadTile = (x: number, y: number, z: number): Promise<HTMLImageElement> => {
    const key = `${z}-${x}-${y}`;
    
    if (tileCache.current.has(key)) {
      return Promise.resolve(tileCache.current.get(key)!);
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        tileCache.current.set(key, img);
        resolve(img);
      };
      
      img.onerror = () => {
        reject(new Error(`Failed to load tile ${key}`));
      };

      // Use satellite tiles from multiple providers
      const providers = [
        `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
        `https://mt1.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`,
      ];
      
      img.src = providers[0];
    });
  };

  // Render map
  const renderMap = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Calculate visible tiles
    const centerTile = latLngToTile(center.lat, center.lng, zoom);
    const tilesX = Math.ceil(width / TILE_SIZE) + 2;
    const tilesY = Math.ceil(height / TILE_SIZE) + 2;

    const startTileX = Math.floor(centerTile.x - tilesX / 2);
    const startTileY = Math.floor(centerTile.y - tilesY / 2);

    // Draw tiles
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const tileX = startTileX + tx;
        const tileY = startTileY + ty;

        if (tileX < 0 || tileY < 0 || tileX >= Math.pow(2, zoom) || tileY >= Math.pow(2, zoom)) {
          continue;
        }

        try {
          const img = await loadTile(tileX, tileY, zoom);
          
          const px = (tileX - centerTile.x) * TILE_SIZE + width / 2 + offset.x;
          const py = (tileY - centerTile.y) * TILE_SIZE + height / 2 + offset.y;

          ctx.drawImage(img, px, py, TILE_SIZE, TILE_SIZE);
        } catch (error) {
          // Draw placeholder for failed tiles
          ctx.fillStyle = '#2a2a2a';
          const px = (tileX - centerTile.x) * TILE_SIZE + width / 2 + offset.x;
          const py = (tileY - centerTile.y) * TILE_SIZE + height / 2 + offset.y;
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // Draw trail
    if (trail.length > 1) {
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.8)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();

      trail.forEach((point, index) => {
        const tile = latLngToTile(point.lat, point.lng, zoom);
        const px = (tile.x - centerTile.x) * TILE_SIZE + width / 2 + offset.x;
        const py = (tile.y - centerTile.y) * TILE_SIZE + height / 2 + offset.y;

        if (index === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      });

      ctx.stroke();
    }

    // Draw current position
    if (position) {
      const tile = latLngToTile(position.latitude, position.longitude, zoom);
      const px = (tile.x - centerTile.x) * TILE_SIZE + width / 2 + offset.x;
      const py = (tile.y - centerTile.y) * TILE_SIZE + height / 2 + offset.y;

      // Draw accuracy circle with color coding
      const metersPerPixel = getMetersPerPixel(position.latitude, zoom);
      const radiusPixels = position.accuracy / metersPerPixel;
      const accuracyColor = getAccuracyColor(position.accuracy);

      ctx.fillStyle = accuracyColor.fill;
      ctx.strokeStyle = accuracyColor.stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, radiusPixels, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw position marker
      ctx.fillStyle = '#06b6d4';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw accuracy text overlay
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const accuracyText = `±${position.accuracy.toFixed(1)}m`;
      const textMetrics = ctx.measureText(accuracyText);
      const textWidth = textMetrics.width;
      const textHeight = 20;
      const textX = px;
      const textY = py + radiusPixels + 20;
      
      // Draw semi-transparent background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(
        textX - textWidth / 2 - 6,
        textY - textHeight / 2,
        textWidth + 12,
        textHeight
      );
      
      // Draw text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(accuracyText, textX, textY);

      // Draw heading indicator
      if (position.heading !== null && position.speed && position.speed > 0.5) {
        const headingRad = (position.heading * Math.PI) / 180;
        const length = 30;
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(
          px + Math.sin(headingRad) * length,
          py - Math.cos(headingRad) * length
        );
        ctx.stroke();
      }
    }
  };

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
      
      renderMap();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Render on changes
  useEffect(() => {
    renderMap();
  }, [center, zoom, offset, position, trail]);

  // Mouse/touch handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setAutoCenter(false);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    
    const newOffset = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    };
    setOffset(newOffset);
  };

  const handlePointerUp = () => {
    if (isDragging) {
      setIsDragging(false);
      
      // Update center based on offset
      const canvas = canvasRef.current;
      if (canvas) {
        const centerTile = latLngToTile(center.lat, center.lng, zoom);
        const newCenterTile = {
          x: centerTile.x - offset.x / TILE_SIZE,
          y: centerTile.y - offset.y / TILE_SIZE,
        };
        const newCenter = tileToLatLng(newCenterTile.x, newCenterTile.y, zoom);
        setCenter(newCenter);
        setOffset({ x: 0, y: 0 });
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setAutoCenter(false);
    
    const delta = e.deltaY > 0 ? -1 : 1;
    setZoom((prev) => Math.max(3, Math.min(19, prev + delta)));
  };

  const handleRecenter = () => {
    if (position) {
      setCenter({ lat: position.latitude, lng: position.longitude });
      setOffset({ x: 0, y: 0 });
      setAutoCenter(true);
    }
  };

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      />

      {/* Controls */}
      <div className="absolute left-4 top-4 flex flex-col gap-2">
        {!isTracking ? (
          <Button onClick={onStartTracking} size="lg" className="shadow-lg">
            <Play className="mr-2 h-5 w-5" />
            Start Tracking
          </Button>
        ) : (
          <Button onClick={onStopTracking} variant="destructive" size="lg" className="shadow-lg">
            <Square className="mr-2 h-5 w-5" />
            Stop Tracking
          </Button>
        )}
        
        <Button onClick={onReset} variant="outline" size="lg" className="shadow-lg">
          <RotateCcw className="mr-2 h-5 w-5" />
          Reset
        </Button>
      </div>

      {/* Zoom controls */}
      <div className="absolute right-4 top-4 flex flex-col gap-2">
        <Button
          onClick={() => setZoom((z) => Math.min(19, z + 1))}
          variant="outline"
          size="icon"
          className="shadow-lg"
        >
          +
        </Button>
        <Button
          onClick={() => setZoom((z) => Math.max(3, z - 1))}
          variant="outline"
          size="icon"
          className="shadow-lg"
        >
          −
        </Button>
        <Button
          onClick={handleRecenter}
          variant="outline"
          size="icon"
          className="shadow-lg"
          disabled={!position}
        >
          <Crosshair className="h-5 w-5" />
        </Button>
      </div>

      {/* Precision Legend */}
      <div className="absolute bottom-4 left-4 rounded-lg border border-border/50 bg-card/90 p-3 shadow-lg backdrop-blur-sm">
        <div className="mb-2 text-xs font-semibold text-foreground">GPS Precision</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full border-2" style={{ 
              backgroundColor: 'rgba(34, 197, 94, 0.3)',
              borderColor: 'rgb(34, 197, 94)'
            }} />
            <span className="text-xs text-muted-foreground">Excellent &lt;5m</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full border-2" style={{ 
              backgroundColor: 'rgba(6, 182, 212, 0.3)',
              borderColor: 'rgb(6, 182, 212)'
            }} />
            <span className="text-xs text-muted-foreground">Good 5-10m</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full border-2" style={{ 
              backgroundColor: 'rgba(234, 179, 8, 0.3)',
              borderColor: 'rgb(234, 179, 8)'
            }} />
            <span className="text-xs text-muted-foreground">Fair 10-20m</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full border-2" style={{ 
              backgroundColor: 'rgba(239, 68, 68, 0.3)',
              borderColor: 'rgb(239, 68, 68)'
            }} />
            <span className="text-xs text-muted-foreground">Poor &gt;20m</span>
          </div>
        </div>
      </div>

      {/* Zoom level indicator */}
      <div className="absolute bottom-4 right-4 rounded-lg bg-card px-3 py-2 text-sm font-medium shadow-lg">
        Zoom: {zoom}
      </div>
    </div>
  );
}
