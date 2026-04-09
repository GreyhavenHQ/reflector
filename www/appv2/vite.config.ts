import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR disabled via env var for AI Studio
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        // API requests → backend
        '/v1': {
          target: env.SERVER_API_URL || 'http://localhost:1250',
          changeOrigin: true,
          ws: true,
        },
        // Auth proxy requests → Express auth server
        '/auth': {
          target: env.AUTH_PROXY_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
