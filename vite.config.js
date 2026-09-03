import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          katex: ['katex'],
          docx: ['docx'],
          confetti: ['canvas-confetti']
        }
      }
    }
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api/handwriting': {
        target: 'https://www.google.com.tw/inputtools/request',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/handwriting/, '?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8')
      }
    }
  }
});
