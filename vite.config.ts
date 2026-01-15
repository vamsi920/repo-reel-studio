import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  let componentTagger;
  if (mode === "development") {
    try {
      const tagger = await import("lovable-tagger");
      componentTagger = tagger.componentTagger;
    } catch {
      // lovable-tagger not available, skip
    }
  }

  return {
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
    plugins: [react(), componentTagger && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
