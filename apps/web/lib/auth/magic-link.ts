// Server-owned passwordless delivery. Supabase still creates and verifies the
// one-time token; Resend only transports a Prism-hosted callback URL so production
// login does not depend on the Supabase project's redirect allowlist being updated.

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { normalizeWorkspaceEmail } from '@/lib/auth/workspace';
import { publicEnv, requireSupabasePublic, serverEnv } from '@/lib/config/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { appTable } from '@/lib/supabase/server';

export type MagicLinkDelivery = 'resend' | 'supabase';

export interface WorkspaceMagicLinkResult {
  status: 'sent' | 'not_linked';
  delivery: MagicLinkDelivery | null;
}

function callbackUrl(): URL {
  return new URL('/auth/callback', publicEnv.NEXT_PUBLIC_APP_URL);
}

function emailHtml(link: string): string {
  const safeLink = link.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#18251f">
      <p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5b4df0">Prism workspace</p>
      <h1 style="font-size:30px;line-height:1.15;margin:12px 0">Open your private workspace</h1>
      <p style="font-size:16px;line-height:1.6;color:#58655f">Use this one-time link to sign in, then generate your personal Codex or Claude Code setup command.</p>
      <p style="margin:28px 0"><a href="${safeLink}" style="display:inline-block;background:#5b46e8;color:#fff;text-decoration:none;padding:14px 22px;border-radius:8px;font-weight:700">Sign in to Prism</a></p>
      <p style="font-size:13px;line-height:1.5;color:#7a8781">This link is single-use. Prism does not collect prompts, responses, source code, commands, or tool payloads.</p>
    </div>`;
}

/** Send a magic link only when exactly one active real employee owns the email. */
export async function sendWorkspaceMagicLink(rawEmail: string): Promise<WorkspaceMagicLinkResult> {
  const email = normalizeWorkspaceEmail(rawEmail);
  if (!email) return { status: 'not_linked', delivery: null };

  const admin = createAdminClient();
  const employees = await appTable(admin)
    .from('employees')
    .select('id')
    .eq('email', email)
    .eq('active', true)
    .limit(2);
  if (employees.error) throw new Error('Could not validate workspace access.');
  const rows = Array.isArray(employees.data) ? employees.data : [];
  if (rows.length !== 1) return { status: 'not_linked', delivery: null };

  const redirectTo = callbackUrl().toString();
  if (serverEnv.RESEND_API_KEY) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    });
    if (error || !data.properties?.hashed_token) {
      throw new Error(error?.message ?? 'Could not create the one-time login link.');
    }

    const hostedCallback = callbackUrl();
    hostedCallback.searchParams.set('token_hash', data.properties.hashed_token);
    hostedCallback.searchParams.set('type', 'magiclink');

    const resend = new Resend(serverEnv.RESEND_API_KEY);
    const { error: deliveryError } = await resend.emails.send({
      from: serverEnv.AUTH_FROM_EMAIL ?? 'Prism <onboarding@resend.dev>',
      to: email,
      subject: 'Sign in to your Prism workspace',
      html: emailHtml(hostedCallback.toString()),
    });
    if (deliveryError) throw new Error(deliveryError.message || 'Could not deliver the login email.');
    return { status: 'sent', delivery: 'resend' };
  }

  // Local/keyless email fallback. Hosted deployments should use Resend or configure
  // the exact callback in Supabase Auth → URL Configuration.
  const { url, anonKey } = requireSupabasePublic();
  const supabase = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });
  if (error) throw error;
  return { status: 'sent', delivery: 'supabase' };
}
