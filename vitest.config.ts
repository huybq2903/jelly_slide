import { defineConfig } from 'vitest/config';

// Không quét bản copy do pipeline publish của Falcon IDE tạo ra.
export default defineConfig({
  test: { exclude: ['**/node_modules/**', 'dist/**', '.falcon-publish/**'] },
});
