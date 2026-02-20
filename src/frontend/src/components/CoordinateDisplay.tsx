import { MapPin, Navigation, Target, Route } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { LocationData } from '../App';

interface CoordinateDisplayProps {
  location: LocationData;
  totalDistance: number;
}

export default function CoordinateDisplay({ location, totalDistance }: CoordinateDisplayProps) {
  const getAccuracyQuality = (accuracy: number) => {
    if (accuracy <= 10) return { label: 'Excellent', variant: 'default' as const };
    if (accuracy <= 30) return { label: 'Good', variant: 'default' as const };
    if (accuracy <= 100) return { label: 'Fair', variant: 'secondary' as const };
    return { label: 'Approximate', variant: 'secondary' as const };
  };

  const quality = getAccuracyQuality(location.accuracy);
  const isApproximate = location.accuracy > 100;

  return (
    <div className="grid gap-3 grid-cols-1">
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Position
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-xs text-muted-foreground">Latitude</div>
          <div className="text-sm font-mono">{location.latitude.toFixed(6)}°</div>
          <div className="text-xs text-muted-foreground mt-2">Longitude</div>
          <div className="text-sm font-mono">{location.longitude.toFixed(6)}°</div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Accuracy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-2xl font-bold">{location.accuracy.toFixed(1)}m</div>
          <Badge variant={quality.variant} className="text-xs">
            {quality.label}
          </Badge>
          {isApproximate && (
            <div className="text-xs text-warning mt-1">
              ⚠️ Low accuracy detected
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Navigation className="h-4 w-4 text-primary" />
            Movement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-xs text-muted-foreground">Speed</div>
          <div className="text-sm font-mono">
            {location.speed !== null ? `${(location.speed * 3.6).toFixed(1)} km/h` : 'N/A'}
          </div>
          <div className="text-xs text-muted-foreground mt-2">Direction</div>
          <div className="text-sm font-mono">
            {location.heading !== null ? `${location.heading.toFixed(0)}°` : 'N/A'}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Route className="h-4 w-4 text-primary" />
            Distance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-2xl font-bold">
            {totalDistance >= 1000 
              ? `${(totalDistance / 1000).toFixed(2)} km`
              : `${totalDistance.toFixed(0)} m`
            }
          </div>
          <div className="text-xs text-muted-foreground">Total travelled</div>
        </CardContent>
      </Card>
    </div>
  );
}
