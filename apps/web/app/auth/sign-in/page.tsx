import { PrismLogo } from '@/components/brand/PrismLogo';
import { Icon } from '@/components/ui/Icon';
import { SignInForm } from './SignInForm';

const ERROR_MESSAGES: Record<string, string> = {
  auth: 'That sign-in link is invalid or expired. Request a fresh one below.',
  unmatched: 'This email is not assigned to an active Prism team member. Ask your administrator to add it in Connect.',
  workspace: 'Your login succeeded, but Prism could not link the workspace. Ask your administrator to retry the invitation.',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? ERROR_MESSAGES[params.error] ?? 'Could not complete sign-in.' : null;

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="auth-brand"><span><PrismLogo size={30} /></span><strong>Prism</strong></div>
        <div>
          <span className="auth-eyebrow">Private developer workspace</span>
          <h1>Connect your coding agent without sharing your code.</h1>
          <p>Sign in with the email linked to your GitHub identity. Your one-time Codex or Claude Code command will be waiting inside.</p>
        </div>
        <div className="auth-contract">
          <span><Icon name="check" size={16} /><b>Real users only</b></span>
          <span><Icon name="check" size={16} /><b>One-time personal command</b></span>
          <span><Icon name="check" size={16} /><b>Prompts and source code stay local</b></span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <span className="page-kicker">Passwordless access</span>
          <h2>Sign in to your workspace</h2>
          <p>Use the same email your Prism administrator invited. Supabase will send a secure magic link.</p>
          <SignInForm initialEmail={params.email ?? ''} initialError={error} />
          <small>After sign-in: choose Codex or Claude Code → generate command → copy → run in Terminal.</small>
        </div>
      </section>
    </main>
  );
}
