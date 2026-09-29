import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base: './' にすると GitHub Pages のサブパス（/X_KPISals/）でもそのまま動く
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
