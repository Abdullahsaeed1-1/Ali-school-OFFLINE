import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,      // Always use this port — never auto-increment to 5174/5175
    strictPort: true, // Fail loudly if 5173 is already in use instead of silently switching
  },
});
