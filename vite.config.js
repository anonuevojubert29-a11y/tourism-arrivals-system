import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("recharts")) return "charts";
          if (id.includes("victory-vendor") || id.includes("d3-")) return "chart-math";
          if (id.includes("lodash")) return "lodash";
          if (id.includes("react-smooth") || id.includes("react-transition-group")) return "chart-motion";
          if (id.includes("react") || id.includes("scheduler")) return "react-vendor";
          return undefined;
        },
      },
    },
  },
});
