import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  // The two large chunks are lazy: the AG Grid core (~900 kB, table pages only) and
  // ExcelJS (~930 kB, loaded on export). The entry chunk stays well below this limit.
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000' },
      '/socket.io': { target: 'http://127.0.0.1:3000', ws: true },
    },
  },
});
