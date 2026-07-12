import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/health": "http://localhost:3000",
      "/v1": "http://localhost:3000",
      "/uploads": "http://localhost:3000",
    },
  },
});
