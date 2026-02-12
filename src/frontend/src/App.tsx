import { useEffect, useState, useCallback, useRef } from 'react';
import { MapPin, Navigation, AlertCircle, Wifi, Smartphone, WifiOff, SignalHigh, SignalLow, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import MapView from './components/MapView';
import CoordinateDisplay from './components/CoordinateDisplay';
import Header from './components/Header';
import Footer from './components/Footer';

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

export type TrackingStatus = 'inactive' | 'searching' | 'tracking' | 'paused' | 'reconnecting' | 'denied';

const GPS_TIMEOUT_THRESHOLD = 3000;
const RECONNECT_INTERVAL = 1000;
const POSITION_MAX_AGE = 0;
const STORAGE_KEY = 'igo_last_position';
const TRAIL_STORAGE_KEY = 'igo_trail_path';
const DISTANCE_STORAGE_KEY = 'igo_total_distance';
const PERMISSION_CHECK_INTERVAL = 1000;
const LOCATION_UPDATE_INTERVAL = 1000;
const APPROXIMATE_LOCATION_THRESHOLD = 100; // meters

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
}

function App() {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>('inactive');
  const [mapKey, setMapKey] = useState(0);
  const [lastUpdateTime, setLastUpdateTime] = useState<number | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline'>('online');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isBackgroundTracking, setIsBackgroundTracking] = useState(false);
  const [hasShownResumeToast, setHasShownResumeToast] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState | null>(null);
  const [trailPath, setTrailPath] = useState<TrailPoint[]>([]);
  const [totalDistance, setTotalDistance] = useState(0);
  const [isApproximateLocation, setIsApproximateLocation] = useState(false);
  
  const reconnectTimerRef = useRef<number | null>(null);
  const gpsCheckIntervalRef = useRef<number | null>(null);
  const permissionCheckIntervalRef = useRef<number | null>(null);
  const continuousLocationIntervalRef = useRef<number | null>(null);
  const lastToastIdRef = useRef<string | number | null>(null);
  const previousPositionRef = useRef<GeolocationPosition | null>(null);
  const isReconnectingRef = useRef(false);
  const wasTrackingBeforeBackgroundRef = useRef(false);
  const lastPermissionPromptRef = useRef<number>(0);

  // Load last known position and trail from storage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const lastPos = JSON.parse(stored) as LocationData;
        if (Date.now() - lastPos.timestamp < 300000) {
          setLocation(lastPos);
          console.log('Restored last known position from storage');
        }
      }

      const storedTrail = localStorage.getItem(TRAIL_STORAGE_KEY);
      if (storedTrail) {
        const trail = JSON.parse(storedTrail) as TrailPoint[];
        setTrailPath(trail);
        console.log('Restored trail path from storage');
      }

      const storedDistance = localStorage.getItem(DISTANCE_STORAGE_KEY);
      if (storedDistance) {
        setTotalDistance(parseFloat(storedDistance));
        console.log('Restored total distance from storage');
      }
    } catch (err) {
      console.warn('Failed to load stored data:', err);
    }
  }, []);

  // Save position to storage whenever it updates
  useEffect(() => {
    if (location && isTracking) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
      } catch (err) {
        console.warn('Failed to save position to storage:', err);
      }
    }
  }, [location, isTracking]);

  // Save trail path to storage
  useEffect(() => {
    if (trailPath.length > 0) {
      try {
        localStorage.setItem(TRAIL_STORAGE_KEY, JSON.stringify(trailPath));
      } catch (err) {
        console.warn('Failed to save trail path to storage:', err);
      }
    }
  }, [trailPath]);

  // Save total distance to storage
  useEffect(() => {
    if (totalDistance > 0) {
      try {
        localStorage.setItem(DISTANCE_STORAGE_KEY, totalDistance.toString());
      } catch (err) {
        console.warn('Failed to save total distance to storage:', err);
      }
    }
  }, [totalDistance]);

  // Continuous permission monitoring
  useEffect(() => {
    if (!isTracking) return;

    const checkPermission = async () => {
      try {
        if ('permissions' in navigator) {
          const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          setPermissionState(result.state);

          if (result.state === 'denied' && trackingStatus !== 'denied') {
            console.log('Permission denied, attempting to re-prompt...');
            setTrackingStatus('denied');
            
            const now = Date.now();
            if (now - lastPermissionPromptRef.current > 5000) {
              lastPermissionPromptRef.current = now;
              
              if (lastToastIdRef.current) {
                toast.dismiss(lastToastIdRef.current);
              }
              lastToastIdRef.current = toast.error('Location Access Denied', {
                description: 'Please enable location access to continue tracking.',
                duration: Infinity,
                action: {
                  label: 'Retry',
                  onClick: () => {
                    startTracking();
                  },
                },
              });
            }
          } else if (result.state === 'granted' && trackingStatus === 'denied') {
            console.log('Permission restored, resuming tracking...');
            if (lastToastIdRef.current) {
              toast.dismiss(lastToastIdRef.current);
              lastToastIdRef.current = null;
            }
            toast.success('Permission Restored', {
              description: 'Location access granted. Resuming tracking...',
              duration: 2000,
            });
            setTrackingStatus('reconnecting');
            startReconnection();
          }

          result.addEventListener('change', () => {
            setPermissionState(result.state);
          });
        }
      } catch (err) {
        console.warn('Permission check failed:', err);
      }
    };

    checkPermission();

    permissionCheckIntervalRef.current = window.setInterval(() => {
      checkPermission();
    }, PERMISSION_CHECK_INTERVAL);

    return () => {
      if (permissionCheckIntervalRef.current) {
        clearInterval(permissionCheckIntervalRef.current);
      }
    };
  }, [isTracking, trackingStatus]);

  // Calculate speed and direction from position changes
  const calculateSpeedAndHeading = useCallback((currentPos: GeolocationPosition, previousPos: GeolocationPosition | null) => {
    let calculatedSpeed = currentPos.coords.speed;
    let calculatedHeading = currentPos.coords.heading;

    if (previousPos && (calculatedSpeed === null || calculatedHeading === null)) {
      const lat1 = previousPos.coords.latitude * Math.PI / 180;
      const lat2 = currentPos.coords.latitude * Math.PI / 180;
      const lon1 = previousPos.coords.longitude * Math.PI / 180;
      const lon2 = currentPos.coords.longitude * Math.PI / 180;

      const dLat = lat2 - lat1;
      const dLon = lon2 - lon1;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = 6371000 * c;

      const timeDiff = (currentPos.timestamp - previousPos.timestamp) / 1000;

      if (timeDiff > 0 && calculatedSpeed === null) {
        calculatedSpeed = distance / timeDiff;
      }

      if (calculatedHeading === null && distance > 1) {
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        calculatedHeading = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      }
    }

    return {
      speed: calculatedSpeed !== null && calculatedSpeed >= 0 ? calculatedSpeed : 0,
      heading: calculatedHeading !== null && calculatedHeading >= 0 ? calculatedHeading : null,
    };
  }, []);

  // Handle visibility change for background tracking
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsBackgroundTracking(true);
        wasTrackingBeforeBackgroundRef.current = isTracking;
        console.log('App in background - tracking continues');
      } else {
        setIsBackgroundTracking(false);
        console.log('App in foreground - resuming');
        
        if (wasTrackingBeforeBackgroundRef.current && isTracking) {
          if (lastUpdateTime) {
            const timeSinceLastUpdate = Date.now() - lastUpdateTime;
            if (timeSinceLastUpdate > GPS_TIMEOUT_THRESHOLD) {
              console.log('GPS signal lost while in background, reconnecting...');
              if (!isReconnectingRef.current) {
                startReconnection();
              }
            }
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [location, isTracking, lastUpdateTime]);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setConnectionStatus('online');
      if (isTracking && !isReconnectingRef.current) {
        console.log('Connection restored, checking GPS...');
        startReconnection();
      }
    };
    const handleOffline = () => setConnectionStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    setConnectionStatus(navigator.onLine ? 'online' : 'offline');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isTracking]);

  // Monitor GPS signal freshness and trigger reconnection
  useEffect(() => {
    if (!isTracking || !lastUpdateTime) {
      return;
    }

    if (gpsCheckIntervalRef.current) {
      clearInterval(gpsCheckIntervalRef.current);
    }

    gpsCheckIntervalRef.current = window.setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastUpdateTime;
      
      if (timeSinceLastUpdate > GPS_TIMEOUT_THRESHOLD) {
        if (trackingStatus === 'tracking') {
          console.log('GPS signal timeout detected');
          setTrackingStatus('paused');
          setHasShownResumeToast(false);
          
          if (lastToastIdRef.current) {
            toast.dismiss(lastToastIdRef.current);
          }
          lastToastIdRef.current = toast.warning('GPS Paused', {
            description: 'Signal temporarily lost. Reconnecting...',
            duration: Infinity,
          });
          
          if (!isReconnectingRef.current) {
            startReconnection();
          }
        }
      }
    }, 500);

    return () => {
      if (gpsCheckIntervalRef.current) {
        clearInterval(gpsCheckIntervalRef.current);
      }
    };
  }, [isTracking, lastUpdateTime, trackingStatus]);

  // Continuous location update requests with high accuracy
  useEffect(() => {
    if (!isTracking || trackingStatus === 'denied') {
      if (continuousLocationIntervalRef.current) {
        clearInterval(continuousLocationIntervalRef.current);
        continuousLocationIntervalRef.current = null;
      }
      return;
    }

    const requestLocationUpdate = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          handleLocationUpdate(position);
        },
        (err) => {
          if (err.code !== err.TIMEOUT) {
            console.warn('Continuous location update warning:', err.message);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );
    };

    continuousLocationIntervalRef.current = window.setInterval(() => {
      requestLocationUpdate();
    }, LOCATION_UPDATE_INTERVAL);

    return () => {
      if (continuousLocationIntervalRef.current) {
        clearInterval(continuousLocationIntervalRef.current);
      }
    };
  }, [isTracking, trackingStatus]);

  // Automatic reconnection mechanism with high accuracy
  const startReconnection = useCallback(() => {
    if (isReconnectingRef.current || !isTracking) return;
    
    isReconnectingRef.current = true;
    setTrackingStatus('reconnecting');
    setReconnectAttempts(0);
    
    const attemptReconnect = () => {
      if (!isTracking) {
        isReconnectingRef.current = false;
        return;
      }

      setReconnectAttempts(prev => {
        const newAttempts = prev + 1;

        navigator.geolocation.getCurrentPosition(
          (position) => {
            console.log('GPS reconnection successful');
            handleLocationUpdate(position);
            isReconnectingRef.current = false;
            setReconnectAttempts(0);
            setTrackingStatus('tracking');
            
            if (lastToastIdRef.current) {
              toast.dismiss(lastToastIdRef.current);
              lastToastIdRef.current = null;
            }
            
            if (!hasShownResumeToast) {
              toast.success('GPS Restored', {
                description: 'Tracking resumed successfully.',
                duration: 3000,
              });
              setHasShownResumeToast(true);
            }
            
            if (reconnectTimerRef.current) {
              clearTimeout(reconnectTimerRef.current);
            }
          },
          (err) => {
            console.warn(`Reconnection attempt ${newAttempts} failed:`, err.message);
            
            if (lastToastIdRef.current) {
              toast.dismiss(lastToastIdRef.current);
            }
            lastToastIdRef.current = toast.loading(`Reconnecting...`, {
              description: `Attempt ${newAttempts} - Searching for GPS signal...`,
              duration: Infinity,
            });
            
            reconnectTimerRef.current = window.setTimeout(() => {
              attemptReconnect();
            }, RECONNECT_INTERVAL);
          },
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
          }
        );

        return newAttempts;
      });
    };

    attemptReconnect();
  }, [isTracking, hasShownResumeToast]);

  // Handle location update with trail path and distance tracking
  const handleLocationUpdate = useCallback((position: GeolocationPosition) => {
    const { speed, heading } = calculateSpeedAndHeading(position, previousPositionRef.current);
    
    const newLocation: LocationData = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
      speed: speed,
      heading: heading,
    };
    
    // Check if location is approximate (low accuracy)
    setIsApproximateLocation(position.coords.accuracy > APPROXIMATE_LOCATION_THRESHOLD);
    
    // Update trail path and calculate distance
    if (previousPositionRef.current) {
      const prevLat = previousPositionRef.current.coords.latitude;
      const prevLon = previousPositionRef.current.coords.longitude;
      const distance = calculateDistance(prevLat, prevLon, newLocation.latitude, newLocation.longitude);
      
      // Only add to trail if moved more than 1 meter (to avoid GPS jitter)
      if (distance > 1) {
        setTrailPath(prev => [...prev, {
          latitude: newLocation.latitude,
          longitude: newLocation.longitude,
          timestamp: newLocation.timestamp,
        }]);
        
        setTotalDistance(prev => prev + distance);
      }
    } else {
      // First point in trail
      setTrailPath([{
        latitude: newLocation.latitude,
        longitude: newLocation.longitude,
        timestamp: newLocation.timestamp,
      }]);
    }
    
    setLocation(newLocation);
    setLastUpdateTime(Date.now());
    setTrackingStatus('tracking');
    setError(null);
    
    if (isReconnectingRef.current) {
      isReconnectingRef.current = false;
      setReconnectAttempts(0);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    }
    
    previousPositionRef.current = position;
  }, [calculateSpeedAndHeading]);

  // Handle geolocation errors
  const handleLocationError = useCallback((err: GeolocationPositionError) => {
    let errorMessage = 'Unable to retrieve your location';
    let newStatus: TrackingStatus = trackingStatus;
    
    switch (err.code) {
      case err.PERMISSION_DENIED:
        errorMessage = 'Location Access Denied. To enable location tracking:\n\n' +
          '1. Click the location icon in your browser\'s address bar\n' +
          '2. Select "Allow" for location access\n' +
          '3. Refresh the page and try again\n\n' +
          'On mobile:\n' +
          '• iOS: Settings > Safari > Location > Allow\n' +
          '• Android: Settings > Apps > Browser > Permissions > Location';
        newStatus = 'denied';
        setTrackingStatus('denied');
        
        if (lastToastIdRef.current) {
          toast.dismiss(lastToastIdRef.current);
        }
        lastToastIdRef.current = toast.error('Location Access Denied', {
          description: 'Please enable location access in your browser settings.',
          duration: Infinity,
          action: {
            label: 'Retry',
            onClick: () => {
              startTracking();
            },
          },
        });
        break;
      case err.POSITION_UNAVAILABLE:
        errorMessage = 'Location information is unavailable. Please check your device settings.';
        newStatus = 'paused';
        break;
      case err.TIMEOUT:
        errorMessage = 'Location request timed out. Retrying...';
        if (!isReconnectingRef.current) {
          startReconnection();
        }
        return;
      default:
        errorMessage = 'An unknown error occurred while retrieving location.';
        newStatus = 'paused';
    }
    
    setError(errorMessage);
    console.error('Geolocation error:', errorMessage);
  }, [trackingStatus]);

  // Start tracking with high accuracy
  const startTracking = useCallback(() => {
    if (isTracking) return;

    setIsTracking(true);
    setTrackingStatus('searching');
    setError(null);
    setHasShownResumeToast(false);

    if (lastToastIdRef.current) {
      toast.dismiss(lastToastIdRef.current);
      lastToastIdRef.current = null;
    }

    if ('geolocation' in navigator) {
      const id = navigator.geolocation.watchPosition(
        handleLocationUpdate,
        handleLocationError,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: POSITION_MAX_AGE,
        }
      );
      setWatchId(id);
      console.log('Started GPS tracking with high accuracy (precise location)');
    } else {
      setError('Geolocation is not supported by your browser');
      setTrackingStatus('inactive');
      setIsTracking(false);
    }
  }, [isTracking, handleLocationUpdate, handleLocationError]);

  const stopTracking = useCallback(() => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    
    if (gpsCheckIntervalRef.current) {
      clearInterval(gpsCheckIntervalRef.current);
      gpsCheckIntervalRef.current = null;
    }
    
    if (permissionCheckIntervalRef.current) {
      clearInterval(permissionCheckIntervalRef.current);
      permissionCheckIntervalRef.current = null;
    }
    
    if (continuousLocationIntervalRef.current) {
      clearInterval(continuousLocationIntervalRef.current);
      continuousLocationIntervalRef.current = null;
    }
    
    if (lastToastIdRef.current) {
      toast.dismiss(lastToastIdRef.current);
      lastToastIdRef.current = null;
    }
    
    setIsTracking(false);
    setTrackingStatus('inactive');
    setReconnectAttempts(0);
    isReconnectingRef.current = false;
    console.log('Stopped GPS tracking');
  }, [watchId]);

  const resetTrail = useCallback(() => {
    setTrailPath([]);
    setTotalDistance(0);
    localStorage.removeItem(TRAIL_STORAGE_KEY);
    localStorage.removeItem(DISTANCE_STORAGE_KEY);
    toast.success('Trail Reset', {
      description: 'Trail path and distance have been cleared.',
      duration: 2000,
    });
  }, []);

  const getStatusColor = () => {
    switch (trackingStatus) {
      case 'tracking':
        return 'bg-green-500';
      case 'searching':
      case 'reconnecting':
        return 'bg-yellow-500 animate-pulse';
      case 'paused':
        return 'bg-orange-500';
      case 'denied':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (trackingStatus) {
      case 'tracking':
        return 'Tracking Active';
      case 'searching':
        return 'Searching for GPS...';
      case 'reconnecting':
        return `Reconnecting... (${reconnectAttempts})`;
      case 'paused':
        return 'GPS Paused';
      case 'denied':
        return 'Access Denied';
      default:
        return 'Inactive';
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Approximate Location Warning */}
          {isApproximateLocation && isTracking && (
            <Alert variant="default" className="border-warning bg-warning/10">
              <AlertCircle className="h-4 w-4 text-warning" />
              <AlertTitle>Approximate Location Detected</AlertTitle>
              <AlertDescription>
                Your device is providing approximate location instead of precise location. 
                For better accuracy, please enable <strong>Precise Location</strong> in your device settings:
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                  <li><strong>iOS:</strong> Settings → Privacy & Security → Location Services → Safari/Browser → Precise Location (ON)</li>
                  <li><strong>Android:</strong> Settings → Location → App permissions → Browser → Precise (ON)</li>
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Navigation className="h-5 w-5" />
                  GPS Tracker
                </span>
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${getStatusColor()}`} />
                  <span className="text-sm font-normal text-muted-foreground">
                    {getStatusText()}
                  </span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={isTracking ? stopTracking : startTracking}
                  variant={isTracking ? 'destructive' : 'default'}
                  className="flex-1 sm:flex-none"
                >
                  {isTracking ? (
                    <>
                      <MapPin className="mr-2 h-4 w-4" />
                      Stop Tracking
                    </>
                  ) : (
                    <>
                      <MapPin className="mr-2 h-4 w-4" />
                      Start Tracking
                    </>
                  )}
                </Button>
                
                {trailPath.length > 0 && (
                  <Button
                    onClick={resetTrail}
                    variant="outline"
                    className="flex-1 sm:flex-none"
                  >
                    Reset Trail
                  </Button>
                )}
              </div>

              {connectionStatus === 'offline' && (
                <Alert variant="destructive">
                  <WifiOff className="h-4 w-4" />
                  <AlertDescription>
                    No internet connection. GPS tracking may be affected.
                  </AlertDescription>
                </Alert>
              )}

              {error && trackingStatus === 'denied' && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="whitespace-pre-line">
                    {error}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Coordinates Display */}
          {location && (
            <CoordinateDisplay location={location} totalDistance={totalDistance} />
          )}

          {/* Map View */}
          <div className="h-[500px] sm:h-[600px] lg:h-[700px]">
            <MapView
              key={mapKey}
              location={location}
              isTracking={isTracking}
              trackingStatus={trackingStatus}
              trailPath={trailPath}
            />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default App;
