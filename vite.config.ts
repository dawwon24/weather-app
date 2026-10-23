import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // The production build is served from GitHub Pages at /weather-app/; local dev stays at /.
  base: command === 'build' ? '/weather-app/' : '/',
  // Own fixed port: the 3D viewers' launchers treat 5173–5190 as theirs, and a fixed
  // origin keeps saved settings (localStorage) from scattering across ports.
  server: { port: 5192, strictPort: true },
}));
