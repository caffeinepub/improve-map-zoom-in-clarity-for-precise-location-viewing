import { Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-border/40 bg-card/30 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-center">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          © 2025. Built with{' '}
          <Heart className="h-3.5 w-3.5 fill-primary text-primary" /> using{' '}
          <a
            href="https://caffeine.ai"
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
