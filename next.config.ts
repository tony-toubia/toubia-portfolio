import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The deck route reads its PDF off the filesystem at request time; make
  // sure the file ships with the function bundle on Vercel.
  outputFileTracingIncludes: {
    '/slt/wrtt/deck': ['./src/app/slt/wrtt/deck/*.pdf'],
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
    ];
  },
};

export default nextConfig;
