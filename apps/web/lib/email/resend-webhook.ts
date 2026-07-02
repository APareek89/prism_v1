// lib/email/resend-webhook.ts
//
// Verify + parse a Resend webhook. Resend signs webhooks with Svix, so the signature
// scheme is Svix's: given headers `svix-id`, `svix-timestamp`, `svix-signature` and a
// secret `whsec_<base64>`, the signed content is `${id}.${timestamp}.${rawBody}` and the
// signature is base64(HMAC-SHA256(secret, signedContent)). The `svix-signature` header
// is a space-separated list of `v1,<sig>` entries; a match on ANY entry verifies.
//
// KEYLESS-SAFE: with no RESEND_WEBHOOK_SECRET the verifier returns { ok:false } and the
// route degrades (200, no DB patch) — an unsigned callback is never trusted.
//
// This module is pure (Node crypto only) so it unit-tests without a DB or network.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/config/env';

export interface ResendWebhookHeaders {
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
}

export interface VerifiedResendEvent {
  ok: boolean;
  detail: string;
  type: string | null; // "email.opened" | "email.delivered" | …
  messageId: string | null; // Resend email id (matches comms_outbox.provider_message_id)
  timestamp: string | null; // event time (ISO) when present
}

const MISS: Omit<VerifiedResendEvent, 'ok' | 'detail'> = {
  type: null,
  messageId: null,
  timestamp: null,
};

/** Read the three Svix headers off a Request. */
export function readResendHeaders(req: Request): ResendWebhookHeaders {
  return {
    svixId: req.headers.get('svix-id') ?? req.headers.get('webhook-id'),
    svixTimestamp: req.headers.get('svix-timestamp') ?? req.headers.get('webhook-timestamp'),
    svixSignature: req.headers.get('svix-signature') ?? req.headers.get('webhook-signature'),
  };
}

/**
 * Verify the Svix signature over the raw body and, on success, extract the event type +
 * Resend message id. Returns { ok:false } (never throws) on any failure so the route can
 * always answer 200. `rawBody` MUST be the exact bytes received (used for the HMAC).
 */
export function verifyResendWebhook(rawBody: string, headers: ResendWebhookHeaders): VerifiedResendEvent {
  const secret = serverEnv.RESEND_WEBHOOK_SECRET;
  if (!secret) return { ok: false, detail: 'RESEND_WEBHOOK_SECRET not configured', ...MISS };

  const { svixId, svixTimestamp, svixSignature } = headers;
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, detail: 'missing svix headers', ...MISS };
  }

  const expected = signContent(secret, `${svixId}.${svixTimestamp}.${rawBody}`);
  if (!expected) return { ok: false, detail: 'bad signing secret', ...MISS };

  // svix-signature is space-separated "v1,<b64sig>" tokens; match any.
  const provided = svixSignature
    .split(' ')
    .map((tok) => (tok.includes(',') ? tok.slice(tok.indexOf(',') + 1) : tok))
    .filter(Boolean);

  const verified = provided.some((sig) => safeEqualB64(sig, expected));
  if (!verified) return { ok: false, detail: 'invalid signature', ...MISS };

  const parsed = parseEvent(rawBody);
  return { ok: true, detail: 'verified', ...parsed };
}

/** base64(HMAC-SHA256(secretBytes, content)). secret is `whsec_<base64>`. */
function signContent(secret: string, content: string): string | null {
  try {
    const b64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
    const keyBytes = Buffer.from(b64, 'base64');
    if (keyBytes.length === 0) return null;
    return createHmac('sha256', keyBytes).update(content, 'utf8').digest('base64');
  } catch {
    return null;
  }
}

/** Constant-time base64 signature comparison. */
function safeEqualB64(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, 'base64');
    const bb = Buffer.from(b, 'base64');
    if (ab.length !== bb.length || ab.length === 0) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

interface ParsedEvent {
  type: string | null;
  messageId: string | null;
  timestamp: string | null;
}

/** Pull { type, messageId, timestamp } out of a Resend event body. Resend nests the
 *  email id under data.email_id (falling back to data.id). Never throws. */
function parseEvent(rawBody: string): ParsedEvent {
  try {
    const obj = JSON.parse(rawBody) as {
      type?: unknown;
      created_at?: unknown;
      data?: { email_id?: unknown; id?: unknown; created_at?: unknown } | null;
    };
    const data = obj.data ?? null;
    const messageId =
      pickString(data?.email_id) ?? pickString(data?.id) ?? null;
    const timestamp =
      pickString(obj.created_at) ?? pickString(data?.created_at) ?? null;
    return { type: pickString(obj.type), messageId, timestamp };
  } catch {
    return { type: null, messageId: null, timestamp: null };
  }
}

function pickString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
