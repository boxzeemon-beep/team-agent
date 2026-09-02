import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist/server",
  clean: true,
  noExternal: ["@team-agent/shared"],
  removeNodeProtocol: false,
});
