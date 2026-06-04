import { defineConfig } from 'vite';

// Vite dev server runs on http://localhost:5173 (pointer lock + ES modules need
// localhost/https, not file://). `server.open` launches the browser on `npm run dev`.
export default defineConfig({
  // GitHub Pages serves project sites from /<repo>/, so asset URLs must be
  // prefixed with the repo name. Use '/' instead if you move to a custom domain.
  base: '/The-Range/',
  server: {
    open: true,
    host: 'localhost',
  },
  build: {
    target: 'esnext',
  },
});
