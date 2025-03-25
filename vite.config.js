import { defineConfig } from 'vite';

export default defineConfig(({ command, mode }) => {
  const isProduction = mode === 'production';
  const base = isProduction ? '/duForce/' : '/';

  return {
    base,
    // Add any other Vite configurations you might need
    build: {
      outDir: 'dist',
    },
  };
});
