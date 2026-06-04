import { defineConfig } from 'vite';

// Vite dev server runs on http://localhost:5173 (pointer lock + ES modules need
// localhost/https, not file://). `server.open` launches the browser on `npm run dev`.
export default defineConfig({
  server: {
    open: true,
    host: 'localhost',
  },
  build: {
    target: 'esnext',
  },
});
