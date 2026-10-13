import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The deck route reads its PDF off the filesystem at request time; make
  // sure the file ships with the function bundle on Vercel.
  outputFileTracingIncludes: {
    '/slt/wrtt/deck': ['./src/app/slt/wrtt/deck/*.pdf'],
    // DESIGN mode reads the compressed real-set examples from disk at runtime (src/lib/studforge/omr-examples.ts).
    '/api/studforge/idea': ['./public/studforge/data/omr-blueprints/*.json'],
  },
  // Void Warden was replaced by Hole Haul.
  async redirects() {
    return [
      { source: '/void-warden', destination: '/hole-haul', permanent: true },
      { source: '/void-warden-game', destination: '/hole-haul', permanent: true },
      { source: '/void-warden/:path*', destination: '/hole-haul', permanent: true },
      { source: '/void-warden-game/:path*', destination: '/hole-haul', permanent: true },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/map-mobile-game',
        destination: '/map-mobile-game/index.html',
      },
      {
        source: '/map-mobile-game/',
        destination: '/map-mobile-game/index.html',
      },
      {
        source: '/slt',
        destination: '/slt/index.html',
      },
      {
        source: '/slt/',
        destination: '/slt/index.html',
      },
      // The pillar sub-pages are static files like the landing page. On
      // slt.ventures the middleware serves them at /growth-advisors etc.;
      // these cover the /slt/... spellings on the primary domain.
      {
        source: '/slt/growth-advisors',
        destination: '/slt/growth-advisors.html',
      },
      {
        source: '/slt/platforms',
        destination: '/slt/platforms.html',
      },
      {
        source: '/slt/capital',
        destination: '/slt/capital.html',
      },
    ];
  },
};

export default nextConfig;
