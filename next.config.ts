import type { NextConfig } from "next";

// Agent-written cards render inside this page. If card HTML ever gets past the sanitizer
// (lib/card-html.ts), the browser still only loads images, media, fonts and requests from
// this origin, so a card cannot beacon or send data elsewhere.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    const headers = [{ key: "Content-Security-Policy", value: contentSecurityPolicy }];
    // vinext's `/:path*` does not match the bare root, where the card feed renders.
    return [{ source: "/", headers }, { source: "/:path*", headers }];
  },
};

export default nextConfig;
