import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Google 頭像
      },
      {
        protocol: 'https',
        hostname: 'profile.line-scdn.net', // LINE 頭像
      },
    ],
  },
};

export default nextConfig;
