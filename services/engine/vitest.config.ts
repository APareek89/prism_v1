import { defineConfig } from 'vitest/config';

// Pure engine — node environment, no DOM, no setup files.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
