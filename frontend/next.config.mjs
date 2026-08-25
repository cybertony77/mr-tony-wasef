/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  devIndicators: false,
  // Keep next/image unoptimized for now (we serve Cloudinary URLs that already
  // expose their own CDN-level optimizations). `remotePatterns` is still
  // declared so we can flip `unoptimized` off later without code changes.
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
    domains: ['localhost', '192.168.1.8'],
  },
  // Video proxy streams (Zoom/Google/R2 fallback) can run for hours.
  // Keep this well above any single recording length; it is not a "max watch" limit
  // for healthy streams — only a safety bound for stuck proxied connections.
  experimental: {
    proxyTimeout: 3 * 60 * 60 * 1000, // 3 hours
  },
  async redirects() {
    return [
      {
        source: '/dashboard/testimonials',
        destination: '/dashboard/students_reviews',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return {
      // Parent iframe src stays `/api/youtube/:videoId` (no youtube.com in Elements).
      beforeFiles: [
        {
          source: '/api/youtube/:videoId',
          destination: '/youtube-player/:videoId',
        },
      ],
    };
  },
  async headers() {
    return [
      // Global headers
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'camera=(self)', // allow camera for same-origin
          },
        ],
      },
      //  Existing logo caching rule
      {
        source: '/logo.png',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000',
          },
        ],
      },
      // Cache all SVG files for 1 year
      {
        source: '/:path*.svg',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000',
          },
        ],
      },
    ];
  },
};

export default nextConfig;