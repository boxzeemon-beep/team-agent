import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
  },
  server: {
    port: 4311,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4310",
        ws: true,
      },
    },
  },
});
