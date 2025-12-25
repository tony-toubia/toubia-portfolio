'use client';

import Image from 'next/image';

export default function Hero() {
  return (
    <section className="min-h-screen flex items-center justify-center px-6 pt-20">
      <div className="max-w-6xl mx-auto w-full">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Text Content */}
          <div className="order-2 md:order-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-primary/10 text-accent-primary text-sm font-medium mb-6">
              <span className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
              Building the 5% of AI that actually works
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Tony Toubia
            </h1>

            <p className="text-xl md:text-2xl text-foreground-secondary mb-4">
              <span className="gradient-text font-semibold">Mad Scientist</span> &bull; Enterprise AI Leader &bull; Business Value Architect
            </p>

            <p className="text-lg text-foreground-muted mb-8 max-w-xl">
              VP, Global Salesforce Lead at Merkle. Turning agentic AI pilots into production systems that drive real business outcomes. If McKinsey says 95% of AI projects fail, I&apos;m responsible for the other 5%.
            </p>

            <div className="flex flex-wrap gap-4">
              <a
                href="#projects"
                className="inline-flex items-center gap-2 px-6 py-3 bg-accent-primary text-white font-medium rounded-lg hover:bg-accent-primary/90 transition-colors"
              >
                View My Work
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </a>
              <a
                href="#contact"
                className="inline-flex items-center gap-2 px-6 py-3 border border-border font-medium rounded-lg hover:border-accent-primary hover:text-accent-primary transition-colors"
              >
                Let&apos;s Connect
              </a>
            </div>

            {/* Quick Stats */}
            <div className="flex flex-wrap gap-8 mt-12 pt-8 border-t border-border">
              <div>
                <div className="text-2xl font-bold gradient-text">15+</div>
                <div className="text-sm text-foreground-muted">Years Experience</div>
              </div>
              <div>
                <div className="text-2xl font-bold gradient-text">5</div>
                <div className="text-sm text-foreground-muted">Salesforce Certifications</div>
              </div>
              <div>
                <div className="text-2xl font-bold gradient-text">2</div>
                <div className="text-sm text-foreground-muted">Advisory Boards</div>
              </div>
            </div>
          </div>

          {/* Profile Image */}
          <div className="order-1 md:order-2 flex justify-center">
            <div className="relative">
              {/* Gradient ring */}
              <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-accent-primary via-accent-tertiary to-accent-secondary blur-sm opacity-75" />
              <div className="relative w-64 h-64 md:w-80 md:h-80 rounded-full overflow-hidden border-4 border-background">
                <Image
                  src="/images/headshot.jpg"
                  alt="Tony Toubia"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
              {/* KC Badge */}
              <div className="absolute -bottom-2 -right-2 bg-card-bg border border-border rounded-full px-4 py-2 shadow-lg">
                <span className="text-sm font-medium">Kansas City, MO</span>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="hidden md:flex justify-center mt-16">
          <a href="#about" className="animate-bounce text-foreground-muted hover:text-accent-primary transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
