import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        // www served the full site as a duplicate origin, which broke Google OAuth
        // (PKCE cookie on www, Supabase allowlist on the apex) and splits cookies/SEO.
        // One canonical host: everything on www 308s to the apex.
        source: "/:path*",
        has: [{ type: "host", value: "www.paypigeon.io" }],
        destination: "https://paypigeon.io/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
