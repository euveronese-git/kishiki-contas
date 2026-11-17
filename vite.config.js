import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig, loadEnv } from "vite";

function iaLocal() {
  const names = new Set(["ai-parse", "ai-ask", "ai-summary", "avisos-diarios"]);
  return {
    name: "ia-veronese-local",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url || "").split("?")[0];
        const name = path.match(/^\/\.netlify\/functions\/([^/]+)\/?$/)?.[1];
        if (!names.has(name)) return next();
        try {
          const env = loadEnv(server.config.mode, process.cwd(), "");
          for (const [key, value] of Object.entries(env)) process.env[key] = value;
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const mod = await server.ssrLoadModule(`/netlify/functions/${name}.mjs`);
          const result = await mod.handler({
            httpMethod: req.method || "GET",
            headers: req.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
          res.statusCode = result.statusCode || 200;
          for (const [key, value] of Object.entries(result.headers || {})) res.setHeader(key, value);
          res.end(result.body || "");
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "invalid" }));
          server.config.logger.error(error);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    iaLocal(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "pwa-192.png", "pwa-512.png"],
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        importScripts: ["/push-sw.js"],
      },
    }),
  ],
});
