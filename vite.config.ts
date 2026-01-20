import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, _res) => {
            console.log("Proxy error:", err);
            console.log("\n⚠️  Make sure the ingestion server is running:");
            console.log("   npm run ingest:server\n");
          });
          proxy.on("proxyReq", (_proxyReq, req, _res) => {
            console.log(`→ Proxying ${req.method} ${req.url} to ingestion server`);
          });
        },
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
    extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".mts", ".json"],
    dedupe: ["react", "react-dom"],
  },
  build: {
    // Ensure all files are included
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
    // Ensure proper module resolution during build
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
  },
  optimizeDeps: {
    include: ["@supabase/supabase-js"],
    // Force pre-bundling of dependencies
    force: false,
  },
});
