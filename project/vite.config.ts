import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/Dokoiku-./",  // ← これ追加
  server: {
    host: true,
  },
});
