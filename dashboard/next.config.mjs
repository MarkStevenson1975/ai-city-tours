/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow remote images from Wikipedia / OSM / Supabase Storage
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'staticmap.openstreetmap.de' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  // Allow up to ~5 MB image uploads via Server Actions
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
};

export default nextConfig;
