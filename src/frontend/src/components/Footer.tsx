import { Heart } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const appIdentifier =
    typeof window !== 'undefined'
      ? encodeURIComponent(window.location.hostname)
      : 'unknown-app';

  return (
    <footer className="border-t border-border/40 bg-card/50 backdrop-blur">
      <div className="container flex h-12 items-center justify-center px-4">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          © {currentYear}. Built with{' '}
          <Heart className="h-3 w-3 fill-primary text-primary" /> using{' '}
          <a
            href={`https://caffeine.ai/?utm_source=Caffeine-footer&utm_medium=referral&utm_content=${appIdentifier}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground transition-colors hover:text-primary"
          >
            caffeine.ai
          </a>
        </p>
      </div>
    </footer>
  );
}
