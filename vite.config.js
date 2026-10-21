import { defineConfig } from "vite";

// relative base: the build works from any subfolder of the host
export default defineConfig({
  base: "./",
  build: { chunkSizeWarningLimit: 1000 }, // three.js alone is over the default 500 kB
});
