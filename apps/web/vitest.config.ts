import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Single root test config. Components run under jsdom; the pure scoring engine
// runs fine here too. `npm run test:scoring` narrows to lib/scoring for a fast loop.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: [
      'lib/**/*.test.{ts,tsx}',
      'components/**/*.test.{ts,tsx}',
      'tests/**/*.test.{ts,tsx}',
      'inngest/**/*.test.{ts,tsx}',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
