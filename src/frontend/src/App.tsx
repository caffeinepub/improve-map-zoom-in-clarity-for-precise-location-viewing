import { useState, useEffect, useRef } from 'react';
import { Satellite, Smartphone, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import Header from './components/Header';
import Footer from './components/Footer';
import MapView from './components/MapView';
import CoordinateDisplay from './components/CoordinateDisplay';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';

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

function App() {
  const [position, setPosition] = useState<Position | null>(null);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [totalDistance, setTotalDistance] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const [leftExpanded, setLeftExpanded] = useState(false);
  const [rightExpanded, setRightExpanded] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  // Haversine formula for distance calculation
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    setIsTracking(true);
    toast.success('GPS tracking started');

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newPosition: Position = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
        };

        setPosition(newPosition);

        // Add to trail and calculate distance
        setTrail((prevTrail) => {
          const newPoint: TrailPoint = {
            lat: newPosition.latitude,
            lng: newPosition.longitude,
            timestamp: newPosition.timestamp,
          };

          if (prevTrail.length > 0) {
            const lastPoint = prevTrail[prevTrail.length - 1];
            const distance = calculateDistance(
              lastPoint.lat,
              lastPoint.lng,
              newPoint.lat,
              newPoint.lng
            );

            // Only add point if moved more than 5 meters
            if (distance > 5) {
              setTotalDistance((prev) => prev + distance);
              return [...prevTrail, newPoint];
            }
            return prevTrail;
          }

          return [newPoint];
        });
      },
      (error) => {
        console.error('Geolocation error:', error);
        toast.error(`GPS error: ${error.message}`);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    toast.info('GPS tracking stopped');
  };

  const resetSession = () => {
    stopTracking();
    setPosition(null);
    setTrail([]);
    setTotalDistance(0);
    toast.info('Session reset');
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      
      <main className="flex flex-1 flex-col lg:flex-row">
        {/* Left Column - Coordinates */}
        <div
          className={`border-b bg-card transition-all duration-300 lg:border-b-0 lg:border-r ${
            leftExpanded ? 'lg:w-96' : 'lg:w-80'
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Satellite className="h-5 w-5 text-primary" />
                GPS Data
              </h2>
              <button
                onClick={() => setLeftExpanded(!leftExpanded)}
                className="hidden text-sm text-muted-foreground hover:text-foreground lg:block"
              >
                {leftExpanded ? '←' : '→'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <CoordinateDisplay
                position={position}
                totalDistance={totalDistance}
              />
            </div>
          </div>
        </div>

        {/* Center Column - Map */}
        <div className="flex-1">
          <MapView
            position={position}
            trail={trail}
            isTracking={isTracking}
            onStartTracking={startTracking}
            onStopTracking={stopTracking}
            onReset={resetSession}
          />
        </div>

        {/* Right Column - Device Info */}
        <div
          className={`border-t bg-card transition-all duration-300 lg:border-l lg:border-t-0 ${
            rightExpanded ? 'lg:w-96' : 'lg:w-80'
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="text-lg font-semibold">Device Info</h2>
              <button
                onClick={() => setRightExpanded(!rightExpanded)}
                className="hidden text-sm text-muted-foreground hover:text-foreground lg:block"
              >
                {rightExpanded ? '→' : '←'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Smartphone className="h-4 w-4" />
                      Device
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Platform:</span>
                      <span className="font-medium">{navigator.platform}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Language:</span>
                      <span className="font-medium">{navigator.language}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Online:</span>
                      <Badge variant={navigator.onLine ? 'default' : 'destructive'}>
                        {navigator.onLine ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Monitor className="h-4 w-4" />
                      Screen
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Resolution:</span>
                      <span className="font-medium">
                        {window.screen.width} × {window.screen.height}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pixel Ratio:</span>
                      <span className="font-medium">{window.devicePixelRatio}x</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Color Depth:</span>
                      <span className="font-medium">{window.screen.colorDepth}-bit</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default App;
