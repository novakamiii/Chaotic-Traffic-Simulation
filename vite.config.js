import { defineConfig } from 'vite';

export default defineConfig({
  base: '/dist/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/main.js',
      output: {
        entryFileNames: 'app.js',
      },
    },
  },
});
