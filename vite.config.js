import { defineConfig } from "vite";

export default defineConfig({
  base: "/duForce/",
  optimizeDeps: {
    include: ["pixi.js"], // Ensure PixiJS is optimized properly
  },
});
