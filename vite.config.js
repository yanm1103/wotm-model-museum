import { defineConfig } from "vite";

// base relativa: o build funciona em qualquer subpasta da hospedagem
export default defineConfig({
  base: "./",
  build: { chunkSizeWarningLimit: 1000 }, // o three.js sozinho passa dos 500 kB padrão
});
