import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      server: {
        host: env.VITE_HOST || '0.0.0.0', // permitir acesso via rede ou WSL
        port: Number(env.VITE_PORT) || 5173,
        strictPort: true, // falha rápido se porta ocupada (ajuda a diagnosticar)
        open: false,
        cors: true
      },
      preview: {
        host: env.VITE_HOST || '0.0.0.0',
        port: Number(env.VITE_PREVIEW_PORT) || 4173,
        strictPort: true
      }
    };
});
