import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: false,
  server: { fs: { deny: ['**/private/**', '**/.git/**', '**/.env*'] } },
});
