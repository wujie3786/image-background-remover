/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable ISR for better caching (optional)
  // This allows the site to work with Cloudflare Pages
  experimental: {
    // Enable server actions if needed
  },
  // Remove output: 'export' to enable API routes on Cloudflare Pages
  // Cloudflare Pages now supports Next.js runtime natively
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Image optimization settings
  images: {
    unoptimized: true,
  },
  // For Cloudflare Pages deployment
  // The build command should be: npm run build
  // And the output directory: .next
}

module.exports = nextConfig
