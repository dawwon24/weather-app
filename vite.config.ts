import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // The production build is served from GitHub Pages at /weather-app/; local dev stays at /.
  base: command === 'build' ? '/weather-app/' : '/',
  server: { port: 5173 },
}));
