export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="py-12 px-6 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo & Tagline */}
          <div className="text-center md:text-left">
            <a href="#" className="text-xl font-bold tracking-tight">
              <span className="gradient-text">Tony Toubia</span>
            </a>
            <p className="text-sm text-foreground-muted mt-1">
              Building the 5% of AI that actually works.
            </p>
          </div>

          {/* Quick Links */}
          <div className="flex flex-wrap justify-center gap-6 text-sm">
            <a href="#about" className="text-foreground-secondary hover:text-foreground transition-colors">
              About
            </a>
            <a href="#projects" className="text-foreground-secondary hover:text-foreground transition-colors">
              Projects
            </a>
            <a href="#recognition" className="text-foreground-secondary hover:text-foreground transition-colors">
              Recognition
            </a>
            <a href="#speaking" className="text-foreground-secondary hover:text-foreground transition-colors">
              Speaking
            </a>
            <a href="#contact" className="text-foreground-secondary hover:text-foreground transition-colors">
              Contact
            </a>
          </div>

          {/* Social Links */}
          <div className="flex items-center gap-4">
            <a
              href="https://www.linkedin.com/in/tonytoubia"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-border/50 text-foreground-secondary hover:text-accent-primary transition-colors"
              aria-label="LinkedIn"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
              </svg>
            </a>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-foreground-muted">
          <p>&copy; {currentYear} Tony Toubia. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Made with
            <span className="text-accent-secondary">&hearts;</span>
            in Kansas City
          </p>
        </div>
      </div>
    </footer>
  );
}
