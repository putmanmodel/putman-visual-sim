import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@core": new URL("../core/src/index.ts", import.meta.url).pathname,
    },
  },
  server: {
    fs: {
      allow: [".."],
    },
  },
});