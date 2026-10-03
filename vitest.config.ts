import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for the app's pure logic (selectors, formatting). They run in
// Node, so they cover code that doesn't touch React Native or native modules.
// The resilience tests against a real server live in simulator/.

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@shared\//, replacement: fileURLToPath(new URL('./shared/', import.meta.url)) },
      { find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) },
    ],
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
