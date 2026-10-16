import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages ではリポジトリ名のサブパスで配信されるため、相対パスで出力する。
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
