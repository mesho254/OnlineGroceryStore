import { defineConfig, transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    {
      name: "treat-js-files-as-jsx",
      async transform(code, id) {
        if (!/src[\\/].*\.js$/.test(id)) return null;
        return transformWithEsbuild(code, id, {
          loader: "jsx",
          jsx: "automatic",
        });
      },
    },
    react(),
  ],
  server: {
    port: 3000,
    open: false,
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react-is",
      "recharts",
      "react-router-dom",
      "react-redux",
      "@reduxjs/toolkit",
      "@tanstack/react-query",
      "axios",
      "framer-motion",
    ],
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
  },
});
