import { MapPin } from 'lucide-react';

export default function Header() {
  return (
    <header className="border-b border-border/40 bg-card/30 backdrop-blur-md">
      <div className="container flex h-16 items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Location Tracker</h1>
            <p className="text-xs text-muted-foreground">Real-time GPS tracking</p>
          </div>
        </div>
      </div>
    </header>
  );
}
