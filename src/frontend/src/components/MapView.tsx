import { useEffect, useRef, useState, useCallback } from 'react';
import { Navigation, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { accuracyMetersToPixels, getOptimalTileZoom } from '@/lib/geo';
import type { LocationData, TrailPoint } from '../App';

interface MapViewProps {
  location: LocationData | null;
  isTracking: boolean;
  trailPath: TrailPoint[];
  onRequestHighAccuracy: () => void;
}

const TILE_SIZE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 19;
const DEFAULT_ZOOM = 12;
// Default center (San Francisco) as fallback
const DEFAULT_CENTER = { lat: 37.7749, lon: -122.4194 };

// Web Mercator projection
function latLonToTile(lat: number, lon: number, zoom: number) {
  const x = ((lon + 180) / 360) * Math.pow(2, zoom);
  const y = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * Math.pow(2, zoom);
  return { x, y };
}

function tileToLatLon(x: number, y: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const lon = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lat, lon };
}

export default function MapView({ location, isTracking, trailPath, onRequestHighAccuracy }: MapViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [center, setCenter] = useState<{ lat: number; lon: number }>(DEFAULT_CENTER);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [isFollowMode, setIsFollowMode] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const tilesCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const lastTouchDistance = useRef<number | null>(null);
  const isPinching = useRef(false);
  const isZooming = useRef(false);
  const dpr = useRef(window.devicePixelRatio || 1);
  const [tilesLoaded, setTilesLoaded] = useState(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const zoomSettleTimeoutRef = useRef<number | null>(null);
  const pendingRenderRef = useRef(false);
  const lastZoomRef = useRef(zoom);
  const renderTimeoutRef = useRef<number | null>(null);

  // Update dimensions with ResizeObserver - completely disconnected during zoom
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current && !isZooming.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newWidth = Math.max(rect.width, 100);
        const newHeight = Math.max(rect.height, 100);
        
        setDimensions((prev) => {
          // Only update if dimensions actually changed significantly
          if (Math.abs(prev.width - newWidth) > 5 || Math.abs(prev.height - newHeight) > 5) {
            return { width: newWidth, height: newHeight };
          }
          return prev;
        });
      }
    };

    const setupResizeObserver = () => {
      if (containerRef.current && !resizeObserverRef.current) {
        resizeObserverRef.current = new ResizeObserver(() => {
          // Only process resize if not zooming, dragging, or pinching
          if (!isZooming.current && !isDragging && !isPinching.current) {
            // Debounce dimension updates
            if (renderTimeoutRef.current) {
              clearTimeout(renderTimeoutRef.current);
            }
            renderTimeoutRef.current = window.setTimeout(() => {
              updateDimensions();
            }, 50);
          }
        });
        resizeObserverRef.current.observe(containerRef.current);
      }
    };

    const disconnectResizeObserver = () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };

    // Initial setup
    updateDimensions();
    setupResizeObserver();
    
    return () => {
      disconnectResizeObserver();
      if (zoomSettleTimeoutRef.current) {
        clearTimeout(zoomSettleTimeoutRef.current);
      }
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
    };
  }, [isDragging]);

  // Handle zoom state changes
  useEffect(() => {
    // Detect zoom change
    if (Math.abs(lastZoomRef.current - zoom) > 0.01) {
      isZooming.current = true;
      lastZoomRef.current = zoom;
      
      // Disconnect ResizeObserver during zoom
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      
      // Clear any existing timeout
      if (zoomSettleTimeoutRef.current) {
        clearTimeout(zoomSettleTimeoutRef.current);
      }
      
      // Reconnect after zoom settles with longer delay
      zoomSettleTimeoutRef.current = window.setTimeout(() => {
        isZooming.current = false;
        
        // Reconnect ResizeObserver
        if (containerRef.current && !resizeObserverRef.current) {
          resizeObserverRef.current = new ResizeObserver(() => {
            if (!isZooming.current && !isDragging && !isPinching.current) {
              if (renderTimeoutRef.current) {
                clearTimeout(renderTimeoutRef.current);
              }
              renderTimeoutRef.current = window.setTimeout(() => {
                if (containerRef.current) {
                  const rect = containerRef.current.getBoundingClientRect();
                  const newWidth = Math.max(rect.width, 100);
                  const newHeight = Math.max(rect.height, 100);
                  
                  setDimensions((prev) => {
                    if (Math.abs(prev.width - newWidth) > 5 || Math.abs(prev.height - newHeight) > 5) {
                      return { width: newWidth, height: newHeight };
                    }
                    return prev;
                  });
                }
              }, 50);
            }
          });
          resizeObserverRef.current.observe(containerRef.current);
        }
      }, 800);
    }

    return () => {
      if (zoomSettleTimeoutRef.current) {
        clearTimeout(zoomSettleTimeoutRef.current);
      }
    };
  }, [zoom, isDragging]);

  // Initialize center when location is first available
  useEffect(() => {
    if (location && isFollowMode) {
      setCenter({ lat: location.latitude, lon: location.longitude });
    }
  }, [location, isFollowMode]);

  // Update center in follow mode
  useEffect(() => {
    if (location && isFollowMode && !isDragging && !isPinching.current && !isZooming.current) {
      setCenter({ lat: location.latitude, lon: location.longitude });
    }
  }, [location, isFollowMode, isDragging]);

  const handleRecenter = useCallback(() => {
    if (location) {
      setCenter({ lat: location.latitude, lon: location.longitude });
      setIsFollowMode(true);
      onRequestHighAccuracy();
    }
  }, [location, onRequestHighAccuracy]);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 1, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 1, MIN_ZOOM));
  }, []);

  // Touch event handlers for pinch-zoom and pan
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch zoom start
      isPinching.current = true;
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      lastTouchDistance.current = distance;
      setIsFollowMode(false);
    } else if (e.touches.length === 1) {
      // Pan start
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX, y: touch.clientY });
      setIsFollowMode(false);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    
    if (e.touches.length === 2 && isPinching.current) {
      // Pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      
      if (lastTouchDistance.current) {
        const delta = distance - lastTouchDistance.current;
        const zoomDelta = delta / 100;
        setZoom(prev => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + zoomDelta)));
      }
      
      lastTouchDistance.current = distance;
    } else if (e.touches.length === 1 && isDragging && dragStart) {
      // Pan
      const touch = e.touches[0];
      const dx = touch.clientX - dragStart.x;
      const dy = touch.clientY - dragStart.y;

      const tileZoom = Math.round(zoom);
      const scale = Math.pow(2, tileZoom);
      const worldSize = TILE_SIZE * scale;
      const pixelsPerDegree = worldSize / 360;

      const newLon = center.lon - dx / pixelsPerDegree;
      const latRadians = (center.lat * Math.PI) / 180;
      const metersPerPixel = (156543.03392 * Math.cos(latRadians)) / scale;
      const newLat = center.lat + (dy * metersPerPixel) / 111320;

      setCenter({ lat: newLat, lon: newLon });
      setDragStart({ x: touch.clientX, y: touch.clientY });
    }
  }, [isDragging, dragStart, center, zoom]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
    
    // Delay clearing pinch state to allow zoom to settle
    if (isPinching.current) {
      setTimeout(() => {
        isPinching.current = false;
        lastTouchDistance.current = null;
      }, 100);
    }
  }, []);

  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setIsFollowMode(false);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !dragStart) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    const tileZoom = Math.round(zoom);
    const scale = Math.pow(2, tileZoom);
    const worldSize = TILE_SIZE * scale;
    const pixelsPerDegree = worldSize / 360;

    const newLon = center.lon - dx / pixelsPerDegree;
    const latRadians = (center.lat * Math.PI) / 180;
    const metersPerPixel = (156543.03392 * Math.cos(latRadians)) / scale;
    const newLat = center.lat + (dy * metersPerPixel) / 111320;

    setCenter({ lat: newLat, lon: newLon });
    setDragStart({ x: e.clientX, y: e.clientY });
  }, [isDragging, dragStart, center, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -Math.sign(e.deltaY);
    setZoom(prev => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta * 0.5)));
    setIsFollowMode(false);
  }, []);

  // Render map with stable rendering during zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    
    if (!canvas || !container) {
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      console.error('MapView: Failed to get 2D context');
      return;
    }

    // Ensure dimensions are valid
    if (dimensions.width <= 0 || dimensions.height <= 0) {
      return;
    }

    // Set up high-DPI canvas with device pixel ratio
    const pixelRatio = dpr.current;
    canvas.width = dimensions.width * pixelRatio;
    canvas.height = dimensions.height * pixelRatio;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
    
    // Scale context to match device pixel ratio
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    
    // Disable image smoothing for crisp tiles
    ctx.imageSmoothingEnabled = false;

    let renderCount = 0;
    let isRendering = false;

    const render = () => {
      // Prevent concurrent renders
      if (isRendering || pendingRenderRef.current) {
        return;
      }
      
      isRendering = true;
      pendingRenderRef.current = true;

      // Use requestAnimationFrame for smooth rendering
      animationFrameRef.current = requestAnimationFrame(() => {
        isRendering = false;
        pendingRenderRef.current = false;

        // Fill background with a neutral color
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, dimensions.width, dimensions.height);

        // Get optimal tile zoom level accounting for device pixel ratio
        const tileZoom = getOptimalTileZoom(zoom, pixelRatio);

        // Calculate visible tiles
        const centerTile = latLonToTile(center.lat, center.lon, tileZoom);
        const tilesX = Math.ceil(dimensions.width / TILE_SIZE) + 2;
        const tilesY = Math.ceil(dimensions.height / TILE_SIZE) + 2;

        const startTileX = Math.floor(centerTile.x - tilesX / 2);
        const startTileY = Math.floor(centerTile.y - tilesY / 2);

        const offsetX = dimensions.width / 2 - (centerTile.x - Math.floor(centerTile.x)) * TILE_SIZE;
        const offsetY = dimensions.height / 2 - (centerTile.y - Math.floor(centerTile.y)) * TILE_SIZE;

        let loadedCount = 0;
        let totalTiles = 0;

        // Draw satellite tiles - prioritize visible viewport
        const tilesToLoad: Array<{ x: number; y: number; priority: number }> = [];
        
        for (let ty = 0; ty < tilesY; ty++) {
          for (let tx = 0; tx < tilesX; tx++) {
            const tileX = startTileX + tx;
            const tileY = startTileY + ty;

            const maxTile = Math.pow(2, tileZoom);
            if (tileX < 0 || tileX >= maxTile || tileY < 0 || tileY >= maxTile) continue;

            // Calculate distance from center for priority loading
            const centerX = tilesX / 2;
            const centerY = tilesY / 2;
            const distance = Math.sqrt(Math.pow(tx - centerX, 2) + Math.pow(ty - centerY, 2));
            
            tilesToLoad.push({ x: tileX, y: tileY, priority: distance });
          }
        }

        // Sort tiles by priority (closest to center first)
        tilesToLoad.sort((a, b) => a.priority - b.priority);

        // Load and draw tiles
        for (const { x: tileX, y: tileY } of tilesToLoad) {
          totalTiles++;
          const tileKey = `${tileZoom}-${tileX}-${tileY}`;
          let tile = tilesCache.current.get(tileKey);

          if (!tile) {
            tile = new Image();
            tile.crossOrigin = 'anonymous';
            
            // Use ArcGIS World Imagery tiles with higher resolution
            tile.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${tileZoom}/${tileY}/${tileX}`;
            
            tilesCache.current.set(tileKey, tile);

            tile.onload = () => {
              // Only trigger re-render if not currently zooming
              if (!isZooming.current && !isPinching.current) {
                // Debounce tile load renders
                if (renderTimeoutRef.current) {
                  clearTimeout(renderTimeoutRef.current);
                }
                renderTimeoutRef.current = window.setTimeout(() => {
                  render();
                }, 16); // ~60fps
              }
            };

            tile.onerror = () => {
              console.error(`Failed to load tile: ${tileKey}`);
            };
          }

          if (tile.complete && tile.naturalWidth > 0) {
            const x = offsetX + (tileX - startTileX) * TILE_SIZE;
            const y = offsetY + (tileY - startTileY) * TILE_SIZE;
            
            try {
              ctx.drawImage(tile, x, y, TILE_SIZE, TILE_SIZE);
              loadedCount++;
            } catch (err) {
              console.error('Error drawing tile:', err);
            }
          }
        }

        // Update loaded tiles count
        if (renderCount === 0 || loadedCount !== tilesLoaded) {
          setTilesLoaded(loadedCount);
        }

        // Draw trail path
        if (trailPath.length > 1) {
          ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
          ctx.shadowBlur = 4;

          ctx.beginPath();
          trailPath.forEach((point, index) => {
            const pointTile = latLonToTile(point.latitude, point.longitude, tileZoom);
            const x = dimensions.width / 2 + (pointTile.x - centerTile.x) * TILE_SIZE;
            const y = dimensions.height / 2 + (pointTile.y - centerTile.y) * TILE_SIZE;

            if (index === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });
          ctx.stroke();

          // Reset shadow
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        }

        // Draw accuracy circle and position marker
        if (location) {
          const locationTile = latLonToTile(location.latitude, location.longitude, tileZoom);
          const x = dimensions.width / 2 + (locationTile.x - centerTile.x) * TILE_SIZE;
          const y = dimensions.height / 2 + (locationTile.y - centerTile.y) * TILE_SIZE;

          // Draw accuracy circle with adjusted zoom
          const accuracyRadius = accuracyMetersToPixels(location.accuracy, location.latitude, tileZoom);
          ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
          ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, accuracyRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Draw center dot
          ctx.fillStyle = 'rgba(0, 255, 255, 1)';
          ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        renderCount++;
      });
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
    };
  }, [center, zoom, dimensions, location, trailPath, tilesLoaded]);

  return (
    <Card className="relative overflow-hidden h-full" style={{ minHeight: '400px' }}>
      <div
        ref={containerRef}
        className="w-full h-full relative cursor-grab active:cursor-grabbing touch-none"
        style={{ minHeight: '400px' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <canvas ref={canvasRef} className="w-full h-full" />

        {/* Loading indicator */}
        {tilesLoaded === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-sm text-muted-foreground">Loading map tiles...</p>
            </div>
          </div>
        )}

        {/* Zoom controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          <Button
            size="icon"
            variant="secondary"
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="h-10 w-10 rounded-full shadow-lg bg-card/90 backdrop-blur-sm hover:bg-card"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            className="h-10 w-10 rounded-full shadow-lg bg-card/90 backdrop-blur-sm hover:bg-card"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
        </div>

        {/* Recenter button */}
        <div className="absolute bottom-4 right-4">
          <Button
            size="icon"
            variant={isFollowMode ? 'default' : 'secondary'}
            onClick={handleRecenter}
            className="h-12 w-12 rounded-full shadow-lg"
            title="Recenter on current location"
          >
            <img 
              src="/assets/generated/recenter-location-icon.dim_32x32.png" 
              alt="Recenter" 
              className="h-6 w-6"
            />
          </Button>
        </div>

        {/* Zoom level indicator */}
        <div className="absolute bottom-4 left-4">
          <Badge variant="secondary" className="bg-card/90 backdrop-blur-sm shadow-lg">
            <Maximize2 className="h-3 w-3 mr-1" />
            Zoom: {zoom.toFixed(1)}
          </Badge>
        </div>

        {/* Follow mode indicator */}
        {isFollowMode && (
          <div className="absolute top-4 left-4">
            <Badge variant="default" className="bg-primary/90 backdrop-blur-sm shadow-lg">
              <Navigation className="h-3 w-3 mr-1" />
              Following
            </Badge>
          </div>
        )}
      </div>
    </Card>
  );
}
