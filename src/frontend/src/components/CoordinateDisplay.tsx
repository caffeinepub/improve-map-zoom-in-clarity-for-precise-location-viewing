import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { MapPin, Gauge, Compass, Route } from 'lucide-react';

interface Position {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

interface CoordinateDisplayProps {
  position: Position | null;
  totalDistance: number;
}

export default function CoordinateDisplay({ position, totalDistance }: CoordinateDisplayProps) {
  const getAccuracyQuality = (accuracy: number): { label: string; variant: 'default' | 'secondary' | 'destructive' } => {
    if (accuracy <= 10) return { label: 'Excellent', variant: 'default' };
    if (accuracy <= 30) return { label: 'Good', variant: 'secondary' };
    return { label: 'Poor', variant: 'destructive' };
  };

  const formatSpeed = (speed: number | null): string => {
    if (speed === null) return 'N/A';
    const kmh = speed * 3.6;
    return `${kmh.toFixed(1)} km/h`;
  };

  const formatHeading = (heading: number | null): string => {
    if (heading === null) return 'N/A';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(heading / 45) % 8;
    return `${directions[index]} (${heading.toFixed(0)}°)`;
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${meters.toFixed(0)} m`;
    }
    return `${(meters / 1000).toFixed(2)} km`;
  };

  if (!position) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            Waiting for GPS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Start tracking to see your location data
          </p>
        </CardContent>
      </Card>
    );
  }

  const quality = getAccuracyQuality(position.accuracy);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            Position
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <div className="text-xs text-muted-foreground">Latitude</div>
            <div className="font-mono text-sm">{position.latitude.toFixed(6)}°</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Longitude</div>
            <div className="font-mono text-sm">{position.longitude.toFixed(6)}°</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Accuracy</div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">±{position.accuracy.toFixed(1)} m</span>
              <Badge variant={quality.variant}>{quality.label}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4" />
            Movement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <div className="text-xs text-muted-foreground">Speed</div>
            <div className="font-mono text-sm">{formatSpeed(position.speed)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Heading</div>
            <div className="font-mono text-sm">{formatHeading(position.heading)}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4" />
            Distance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-primary">
            {formatDistance(totalDistance)}
          </div>
          <div className="text-xs text-muted-foreground">Total distance traveled</div>
        </CardContent>
      </Card>
    </div>
  );
}
