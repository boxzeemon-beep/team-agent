import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  root: "web",
  base: mode === "pages" ? "/team-agent/" : "/",
  plugins: [react()],
  build: {
    outDir: mode === "pages" ? "../dist/pages" : "../dist/web",
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
}));
