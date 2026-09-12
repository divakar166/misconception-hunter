import { NextRequest, NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { createTicket, verifyTicket } from '@/lib/session-ticket';

const EXPIRATION_TIME_IN_SECONDS = 3600;

interface AgoraSessionTicket {
  channel: string;
  uid: string;
}

function generateChannelName(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `ai-conversation-${timestamp}-${random}`;
}

function generateUid(): number {
  return Math.floor(Math.random() * 9_999_000) + 1000;
}

export async function GET(request: NextRequest) {
  const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
  const APP_CERTIFICATE = process.env.NEXT_AGORA_APP_CERTIFICATE;

  if (!APP_ID || !APP_CERTIFICATE) {
    return NextResponse.json(
      { error: 'Agora credentials are not set' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const incomingTicket = searchParams.get('ticket');

  // Two shapes of request:
  //   1. No ticket -> this is the start of a new session. The server picks
  //      the channel and uid; the caller does not get to request either
  //      (previously it could, via `?channel=`/`?uid=`, which let anyone mint
  //      a token to join or renew into an arbitrary existing channel).
  //   2. A valid ticket -> this is a token renewal for a session the server
  //      already started. The channel/uid come from the ticket, never from
  //      loose query params, so a renewal can only ever re-mint a token for
  //      the exact session the caller was already handed.
  let channelName: string;
  let uid: number;

  if (incomingTicket) {
    const payload = verifyTicket<AgoraSessionTicket>(incomingTicket);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired session ticket' },
        { status: 401 },
      );
    }
    channelName = payload.channel;
    uid = Number(payload.uid);
  } else {
    channelName = generateChannelName();
    uid = generateUid();
  }

  const expirationTime =
    Math.floor(Date.now() / 1000) + EXPIRATION_TIME_IN_SECONDS;

  try {
    const token = RtcTokenBuilder.buildTokenWithRtm(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uid.toString(),
      RtcRole.PUBLISHER,
      expirationTime,
      expirationTime,
    );

    // Re-issue a fresh ticket alongside the fresh token so a renewal chain
    // (renew -> get new ticket -> renew again) can continue indefinitely
    // without ever falling back to trusting client-supplied channel/uid.
    const ticket = createTicket<AgoraSessionTicket>(
      { channel: channelName, uid: uid.toString() },
      EXPIRATION_TIME_IN_SECONDS,
    );

    return NextResponse.json({
      token,
      uid: uid.toString(),
      channel: channelName,
      ticket,
    });
  } catch (error) {
    console.error('Error generating Agora token:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate Agora token',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
