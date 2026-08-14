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
      {
        source: '/slt',
        destination: '/slt/index.html',
      },
      {
        source: '/slt/',
        destination: '/slt/index.html',
      },
    ];
  },
};

export default nextConfig;
