import { useState, useEffect, useRef } from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import CoordinateDisplay from "./components/CoordinateDisplay";
import MapView from "./components/MapView";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Satellite, MapPin, Info, Phone, Smartphone, Wifi } from "lucide-react";
import { toast } from "sonner";

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  speed: number | null;
  heading: number | null;
}

export interface TrailPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
}

type ExpandedColumn = "device" | "tracking" | "satellite" | null;

function App() {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [totalDistance, setTotalDistance] = useState(0);
  const [mobileNumber, setMobileNumber] = useState("");
  const [sessionActive, setSessionActive] = useState(false);
  const [expandedColumn, setExpandedColumn] = useState<ExpandedColumn>(null);
  const watchIdRef = useRef<number | null>(null);
  const previousPositionRef = useRef<GeolocationPosition | null>(null);

  // Calculate distance between two points using Haversine formula
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };

  useEffect(() => {
    if (isTracking && sessionActive) {
      if ("geolocation" in navigator) {
        const options = {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        };

        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const newLocation: LocationData = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: pos.timestamp,
              speed: pos.coords.speed,
              heading: pos.coords.heading,
            };
            setLocation(newLocation);
            setError(null);

            // Calculate distance if we have a previous position
            if (previousPositionRef.current) {
              const prevLat = previousPositionRef.current.coords.latitude;
              const prevLon = previousPositionRef.current.coords.longitude;
              const distance = calculateDistance(prevLat, prevLon, newLocation.latitude, newLocation.longitude);
              
              // Only add to trail and distance if moved more than 1 meter
              if (distance > 1) {
                setTrail((prev) => [
                  ...prev,
                  {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    timestamp: pos.timestamp,
                  },
                ]);
                setTotalDistance((prev) => prev + distance);
              }
            } else {
              // First point in trail
              setTrail([{
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                timestamp: pos.timestamp,
              }]);
            }

            previousPositionRef.current = pos;
          },
          (err) => {
            setError(err.message);
            toast.error(`GPS Error: ${err.message}`);
          },
          options
        );
      } else {
        setError("Geolocation is not supported by your browser");
        toast.error("Geolocation is not supported by your browser");
      }
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isTracking, sessionActive]);

  const handleStartSession = () => {
    if (!mobileNumber.trim()) {
      toast.error("Please enter a mobile number");
      return;
    }
    setSessionActive(true);
    setIsTracking(true);
    setTrail([]);
    setTotalDistance(0);
    previousPositionRef.current = null;
    toast.success("Tracking session started");
  };

  const handleStopSession = () => {
    setSessionActive(false);
    setIsTracking(false);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    toast.info("Tracking session stopped");
  };

  const handleColumnClick = (column: ExpandedColumn) => {
    setExpandedColumn((prev) => (prev === column ? null : column));
  };

  const getColumnWidth = (column: ExpandedColumn) => {
    if (expandedColumn === null) {
      return "w-20";
    }
    
    // Special handling for satellite map - 90% width when expanded
    if (expandedColumn === "satellite") {
      return column === "satellite" ? "w-[90%]" : "w-[5%]";
    }
    
    // Default expansion for other columns
    return expandedColumn === column ? "w-80" : "w-20";
  };

  const handleRequestHighAccuracy = () => {
    // Request high accuracy location update
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newLocation: LocationData = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
            speed: pos.coords.speed,
            heading: pos.coords.heading,
          };
          setLocation(newLocation);
        },
        (err) => {
          console.warn("High accuracy request failed:", err);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex flex-1 overflow-hidden">
        <div className="flex w-full">
          {/* Device Information Column */}
          <div
            className={`${getColumnWidth("device")} flex-shrink-0 border-r border-border bg-card transition-all duration-300 cursor-pointer hover:bg-accent/50 overflow-hidden`}
            onClick={() => handleColumnClick("device")}
          >
            <div className="flex h-full flex-col p-4">
              <div className="mb-4 flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" />
                {expandedColumn === "device" && (
                  <h2 className="text-lg font-semibold">Device Info</h2>
                )}
              </div>
              {expandedColumn === "device" && (
                <div className="flex-1 overflow-y-auto space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4" />
                        Device Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Platform:</span>
                        <span className="font-medium">{navigator.platform}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">User Agent:</span>
                        <span className="font-medium text-right text-xs max-w-[200px] truncate">
                          {navigator.userAgent}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Language:</span>
                        <span className="font-medium">{navigator.language}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Online:</span>
                        <Badge variant={navigator.onLine ? "default" : "destructive"}>
                          {navigator.onLine ? "Yes" : "No"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Wifi className="h-4 w-4" />
                        Screen Information
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
                        <span className="font-medium">{window.devicePixelRatio}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>

          {/* Tracking Info Column */}
          <div
            className={`${getColumnWidth("tracking")} flex-shrink-0 border-r border-border bg-card transition-all duration-300 cursor-pointer hover:bg-accent/50 overflow-hidden`}
            onClick={() => handleColumnClick("tracking")}
          >
            <div className="flex h-full flex-col p-4">
              <div className="mb-4 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                {expandedColumn === "tracking" && (
                  <h2 className="text-lg font-semibold">Tracking</h2>
                )}
              </div>
              {expandedColumn === "tracking" && (
                <div className="flex-1 space-y-4 overflow-y-auto">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        Session Control
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Mobile Number
                        </label>
                        <Input
                          type="tel"
                          placeholder="Enter mobile number"
                          value={mobileNumber}
                          onChange={(e) => setMobileNumber(e.target.value)}
                          disabled={sessionActive}
                        />
                      </div>
                      {!sessionActive ? (
                        <Button
                          onClick={handleStartSession}
                          className="w-full"
                        >
                          Start Tracking
                        </Button>
                      ) : (
                        <Button
                          onClick={handleStopSession}
                          variant="destructive"
                          className="w-full"
                        >
                          Stop Tracking
                        </Button>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Status:
                        </span>
                        <Badge
                          variant={sessionActive ? "default" : "secondary"}
                        >
                          {sessionActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  {location && (
                    <CoordinateDisplay
                      location={location}
                      totalDistance={totalDistance}
                    />
                  )}

                  {error && (
                    <Card className="border-destructive">
                      <CardContent className="pt-6">
                        <p className="text-sm text-destructive">{error}</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Satellite Tracking Column */}
          <div
            className={`${getColumnWidth("satellite")} flex-shrink-0 border-r border-border bg-card transition-all duration-300 cursor-pointer hover:bg-accent/50 overflow-hidden`}
            onClick={() => handleColumnClick("satellite")}
          >
            <div className="flex h-full flex-col p-4">
              <div className="mb-4 flex items-center gap-2">
                <Satellite className="h-5 w-5 text-primary" />
                {expandedColumn === "satellite" && (
                  <h2 className="text-lg font-semibold">Satellite Map</h2>
                )}
              </div>
              {expandedColumn === "satellite" && (
                <div className="flex-1 overflow-hidden">
                  <MapView
                    location={location}
                    isTracking={isTracking}
                    trailPath={trail}
                    onRequestHighAccuracy={handleRequestHighAccuracy}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Main Content Area - fills remaining space */}
          <div className="flex-1 bg-background p-8">
            <div className="mx-auto max-w-4xl space-y-6">
              <div className="text-center">
                <h1 className="text-4xl font-bold tracking-tight">
                  igo Satellite Tracker
                </h1>
                <p className="mt-2 text-lg text-muted-foreground">
                  Real-time GPS tracking with satellite visualization
                </p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Getting Started</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Click on any of the three columns on the left to expand and
                    access:
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Info className="mt-0.5 h-4 w-4 text-primary" />
                      <span>
                        <strong>Device Info:</strong> View comprehensive device
                        and browser information
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                      <span>
                        <strong>Tracking:</strong> Start a tracking session and
                        view real-time coordinates
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Satellite className="mt-0.5 h-4 w-4 text-primary" />
                      <span>
                        <strong>Satellite Map:</strong> Visualize your location
                        and movement trail on a satellite map
                      </span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              {sessionActive && location && (
                <Card>
                  <CardHeader>
                    <CardTitle>Current Session</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Mobile Number:
                      </span>
                      <span className="font-medium">{mobileNumber}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Trail Points:
                      </span>
                      <span className="font-medium">{trail.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Accuracy:</span>
                      <span className="font-medium">
                        {location.accuracy.toFixed(1)}m
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Distance:</span>
                      <span className="font-medium">
                        {totalDistance >= 1000 
                          ? `${(totalDistance / 1000).toFixed(2)} km`
                          : `${totalDistance.toFixed(0)} m`
                        }
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default App;
