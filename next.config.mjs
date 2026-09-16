import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: rootDir,
  },
  experimental: {
    webpackBuildWorker: true,
    parallelServerBuildTraces: true,
    parallelServerCompiles: true,
  },
  async headers() {
    return [
      {
        // Applies to every route. Agora's RTC/RTM SDKs need to reach their
        // own endpoints over WebSocket/HTTPS from the browser, so `connect-src`
        // stays open rather than pinned to a fixed host list that would break
        // on Agora's infra changes; everything else here is intentionally strict.
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // 'wasm-unsafe-eval' (not the broader 'unsafe-eval') is required —
              // Agora's RTM SDK compiles and instantiates a WASM module for its
              // sync/presence layer client-side. Without it, WebAssembly.instantiate
              // is blocked by CSP, RTM login fails outright, and the conversation
              // never starts — caught live on the deployed site (see git history).
              "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https: wss:",
              "media-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
