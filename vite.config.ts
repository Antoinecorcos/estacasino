import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Le client est compilé dans dist/client, servi ensuite par le Worker (assets).
// En développement (`npm run dev:client`), l'API est relayée vers `wrangler dev`.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist/client", emptyOutDir: true },
  server: {
    proxy: {
      "/api": { target: "http://localhost:8787", ws: true, changeOrigin: true },
    },
  },
});
