// Signed, stateless session tickets.
//
// Why this exists: `/api/generate-agora-token` used to accept a raw `channel`
// and `uid` from the query string and mint a PUBLISHER token for whatever was
// asked — meaning anyone who guessed or observed a channel name could mint a
// token to join (and publish audio into) someone else's live session. Same
// problem one level up: `/api/invite-agent` trusted a client-supplied
// `channel_name`, and `/api/stop-conversation` trusted a bare `agent_id` with
// no proof the caller was the one who started it.
//
// Rather than stand up a database/session store just to close this hole, we
// sign the session's identity (channel + uid, or agentId + channel) into an
// opaque ticket with a server-held secret. The client carries the ticket
// forward; the server only trusts channel/uid/agentId values that come out
// of a verified ticket, never ones passed loose in a request body or query
// string. This is stateless (works fine on Vercel's serverless functions)
// and costs nothing — no new infra, no Tier 3 database dependency.
//
// This is NOT user authentication — it does not identify *who* the caller
// is, only that they are the same party the server handed this specific
// channel/uid/agentId to a few minutes ago. Real auth (Tier 3) is still the
// right answer for anything beyond "don't let strangers hijack each other's
// demo sessions."

import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TICKET_TTL_SECONDS = 3600; // keep aligned with Agora token expiry

function getSecret(): string {
  // A dedicated secret is preferred so rotating it doesn't also rotate the
  // Agora certificate. Falling back to the certificate keeps local/dev setup
  // to the existing two Agora env vars — see env.local.example.
  const secret =
    process.env.SESSION_TICKET_SECRET || process.env.NEXT_AGORA_APP_CERTIFICATE;
  if (!secret) {
    throw new Error(
      'Missing SESSION_TICKET_SECRET (or NEXT_AGORA_APP_CERTIFICATE as a fallback) to sign session tickets',
    );
  }
  return secret;
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function sign(payloadEncoded: string): string {
  return createHmac('sha256', getSecret()).update(payloadEncoded).digest('base64url');
}

/**
 * Sign an arbitrary JSON-serializable payload into an opaque `payload.signature`
 * ticket string, valid for `ttlSeconds` from now.
 */
export function createTicket<T extends object>(
  payload: T,
  ttlSeconds: number = DEFAULT_TICKET_TTL_SECONDS,
): string {
  const withExpiry = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payloadEncoded = base64url(JSON.stringify(withExpiry));
  return `${payloadEncoded}.${sign(payloadEncoded)}`;
}

/**
 * Verify a ticket's signature and expiry, returning its payload (with `exp`)
 * if valid, or `null` if missing, malformed, tampered with, or expired.
 */
export function verifyTicket<T extends object>(
  ticket: string | null | undefined,
): (T & { exp: number }) | null {
  if (!ticket) return null;
  const dotIndex = ticket.indexOf('.');
  if (dotIndex < 0) return null;

  const payloadEncoded = ticket.slice(0, dotIndex);
  const signature = ticket.slice(dotIndex + 1);
  if (!payloadEncoded || !signature) return null;

  const expectedSignature = sign(payloadEncoded);

  // Compare as buffers of equal, fixed length to avoid a timing side-channel;
  // mismatched lengths are just treated as "not equal" rather than compared.
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: T & { exp: number };
  try {
    payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
