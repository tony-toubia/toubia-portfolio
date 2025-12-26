import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    ];
  },
};

export default nextConfig;
