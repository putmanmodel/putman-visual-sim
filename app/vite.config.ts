import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/putman-visual-sim/",
  plugins: [react()],
});