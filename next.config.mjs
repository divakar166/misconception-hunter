import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== 'production';

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
              // 'wasm-unsafe-eval' (not the broader 'unsafe-eval') is required in
              // every environment — Agora's RTM SDK compiles and instantiates a
              // WASM module for its sync/presence layer client-side. Without it,
              // WebAssembly.instantiate is blocked by CSP and RTM login fails
              // outright — caught live on the deployed site (see git history).
              //
              // 'unsafe-eval' itself is added ONLY in development: Next.js's Fast
              // Refresh runtime uses eval() for hot module reloading, which this
              // CSP otherwise blocks too — breaking `pnpm dev` entirely, not just
              // hot reload (the whole entry bundle throws at evaluation time,
              // so nothing ever mounts). The production build doesn't need or
              // get this — headers are a runtime response, not baked into the
              // build, so this had to be caught by testing in an actual browser,
              // not by `pnpm run verify`.
              `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
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
