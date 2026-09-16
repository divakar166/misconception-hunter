'use client';

import { useState, type ReactNode } from 'react';
import AgoraRTC, { AgoraRTCProvider } from 'agora-rtc-react';

// Browser-only RTC client provider. Loaded via next/dynamic with ssr:false
// from LandingPage, so this module (and agora-rtc-react's browser-only
// globals) never evaluate on the server.
//
// This lives in its own file on purpose. It was previously built inside the
// dynamic() factory itself — `dynamic(async () => { ...; return { default:
// function AgoraProviders() {...} } })` — which returns a component defined
// inline rather than a real module. A bundler that statically analyzes
// dynamic imports can fail to resolve that shape, leaving the component
// `undefined` at render time: React then throws "Element type is invalid"
// (minified error #130) and the whole conversation subtree dies before the
// factory ever runs. A plain `import('./AgoraProvider')` with a static
// specifier and a normal default export resolves reliably.
export default function AgoraProvider({ children }: { children: ReactNode }) {
  // Lazy useState initializer rather than useMemo: useMemo is a cache React is
  // allowed to discard and recompute, which would create a second RTC client
  // for the same session. State is kept, so exactly one client exists per mount.
  const [client] = useState(() =>
    AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' }),
  );

  return <AgoraRTCProvider client={client}>{children}</AgoraRTCProvider>;
}
