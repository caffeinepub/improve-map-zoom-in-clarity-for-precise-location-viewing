import { MapPin, Crosshair, Clock, Gauge, Navigation2, Route, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { LocationData } from '../App';

interface CoordinateDisplayProps {
  location: LocationData;
  totalDistance: number;
}

const APPROXIMATE_LOCATION_THRESHOLD = 100; // meters

export default function CoordinateDisplay({ location, totalDistance }: CoordinateDisplayProps) {
  const formatCoordinate = (value: number, isLatitude: boolean) => {
    const direction = isLatitude
      ? value >= 0
        ? 'N'
        : 'S'
      : value >= 0
        ? 'E'
        : 'W';
    return `${Math.abs(value).toFixed(6)}° ${direction}`;
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatSpeed = (speedMs: number | null) => {
    if (speedMs === null) return '0.0';
    const speedKmh = speedMs * 3.6;
    return speedKmh.toFixed(1);
  };

  const formatHeading = (heading: number | null) => {
    if (heading === null) return '--';
    return Math.round(heading).toString();
  };

  const getCompassDirection = (heading: number | null) => {
    if (heading === null) return '--';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(heading / 45) % 8;
    return directions[index];
  };

  const formatDistance = (meters: number) => {
    if (meters < 1000) {
      return `${meters.toFixed(0)} m`;
    } else {
      return `${(meters / 1000).toFixed(2)} km`;
    }
  };

  const isApproximate = location.accuracy > APPROXIMATE_LOCATION_THRESHOLD;
  const accuracyQuality = location.accuracy < 20 ? 'Excellent' : 
                          location.accuracy < 50 ? 'Good' : 
                          location.accuracy < 100 ? 'Fair' : 'Approximate';

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/30 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <MapPin className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Latitude</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatCoordinate(location.latitude, true)}
          </p>
          <p className="text-xs text-muted-foreground">{location.latitude.toFixed(6)}</p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/30 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <MapPin className="h-5 w-5 rotate-90" />
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Longitude</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatCoordinate(location.longitude, false)}
          </p>
          <p className="text-xs text-muted-foreground">{location.longitude.toFixed(6)}</p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/30 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Crosshair className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Accuracy</p>
          <p className="text-lg font-semibold tabular-nums">
            {location.accuracy.toFixed(0)}m
          </p>
          <div className="flex items-center gap-2">
            <Badge 
              variant={isApproximate ? 'destructive' : 'secondary'} 
              className="text-xs"
            >
              {isApproximate && <AlertCircle className="mr-1 h-3 w-3" />}
              {accuracyQuality}
            </Badge>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatTimestamp(location.timestamp)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/30 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Gauge className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Speed</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatSpeed(location.speed)} km/h
          </p>
          <p className="text-xs text-muted-foreground">
            {location.speed !== null && location.speed > 0 ? 'Moving' : 'Stationary'}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/30 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Navigation2 
            className="h-5 w-5" 
            style={{ 
              transform: location.heading !== null ? `rotate(${location.heading}deg)` : 'none',
              transition: 'transform 0.3s ease-out'
            }}
          />
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Direction</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatHeading(location.heading)}°
          </p>
          <p className="text-xs text-muted-foreground">
            {getCompassDirection(location.heading)}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/30 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Route className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Distance Travelled</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatDistance(totalDistance)}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatTimestamp(location.timestamp)}
          </p>
        </div>
      </div>
    </div>
  );
}
