import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Same paths Nginx serves in Docker, so uploads are same-origin and need no CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // reachable from a phone on the same Wi-Fi
    proxy: {
      '^/api/': 'http://localhost:3000',
      '^/harngun-receipts(/|$)': 'http://localhost:9000',
    },
  },
});
