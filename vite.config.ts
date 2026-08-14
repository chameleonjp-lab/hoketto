import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/hoketto/',
  build: {
    chunkSizeWarningLimit: 1500,
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    passWithNoTests: false,
  },
});
