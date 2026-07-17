// lib/config/flags.ts
//
// Runtime feature flags derived from env. All lazy + side-effect-free so they are
// safe to import anywhere (server or client). `DEMO_MODE` defaults to false; it only
// controls deterministic narrative-model selection and never creates an app identity.

import { serverEnv } from './env';

export type AppEnv = 'local' | 'production';

/** True when deterministic demo narration is explicitly requested. */
export function isDemoMode(): boolean {
  // serverEnv.DEMO_MODE is already coerced to boolean by the zod transform.
  // On the client (where serverEnv isn't available) default to false.
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  }
  return serverEnv.DEMO_MODE !== false;
}

export function appEnv(): AppEnv {
  if (typeof window !== 'undefined') return 'local';
  return serverEnv.APP_ENV;
}

export function isLocal(): boolean {
  return appEnv() === 'local';
}

export function isProd(): boolean {
  return appEnv() === 'production';
}

/** Convenience constants for non-conditional reads (evaluated lazily on first use). */
export const DEMO_MODE = {
  get value(): boolean {
    return isDemoMode();
  },
};

export const APP_ENV = {
  get value(): AppEnv {
    return appEnv();
  },
};
