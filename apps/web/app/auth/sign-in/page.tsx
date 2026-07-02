// app/auth/sign-in/page.tsx
//
// Sign-in. Server component that reads DEMO_MODE and renders the client form. The
// "Continue as demo user" button only appears in DEMO_MODE.

import { PrismLogo } from '@/components/brand/PrismLogo';
import { isDemoMode } from '@/lib/config/flags';
import { SignInForm } from './SignInForm';

export default function SignInPage() {
  const demoMode = isDemoMode();

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        padding: 48,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <PrismLogo size={44} />
        <h1 className="display" style={{ fontSize: 22, fontWeight: 700 }}>
          Sign in to Prism
        </h1>
        <p style={{ fontSize: 12.5, color: 'var(--mut2)' }}>One light · four signals</p>
      </div>
      <SignInForm demoMode={demoMode} />
    </div>
  );
}
