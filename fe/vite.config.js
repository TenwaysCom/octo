import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    strictPort: true,
    // Keep browser cookies and plugin origin checks on the Vite origin while
    // forwarding API traffic to the local Octo server.
    proxy: {
      "/api": {
        target: "http://localhost:3040",
        changeOrigin: true,
      },
    },
  },
});
