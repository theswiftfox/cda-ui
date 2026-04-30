// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Elena Gantner

import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import * as https from "node:https";
import * as http from "node:http";

/**
 * Vite dev-server plugin: generic forward proxy at /__proxy/<encoded-url>.
 *
 * Scripts call cda.fetch("https://some-external-server/path?q=1") and the
 * script runner rewrites it to /__proxy/<encodeURIComponent(url)>.  The Vite
 * dev server (Node.js) forwards the request with rejectUnauthorized:false,
 * completely bypassing browser CORS and TLS restrictions.
 *
 * This plugin only exists during `vite dev` — it is NOT part of the
 * production build or the CDA binary.
 */
function externalProxy(): Plugin {
  return {
    name: "cda-external-proxy",
    configureServer(server) {
      const agent = new https.Agent({ rejectUnauthorized: false });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.middlewares.use("/__proxy", (req: any, res: any) => {
        // Connect strips the mount path; req.url = /<encoded-target-url>
        const encoded = (req.url || "").slice(1); // drop leading /
        const targetUrl = decodeURIComponent(encoded);

        if (
          !targetUrl ||
          (!targetUrl.startsWith("http://") &&
            !targetUrl.startsWith("https://"))
        ) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Usage: /__proxy/<encodeURIComponent(url)>");
          return;
        }

        let parsed: URL;
        try {
          parsed = new URL(targetUrl);
        } catch {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Invalid URL");
          return;
        }

        const isHttps = parsed.protocol === "https:";
        const requestFn = isHttps ? https.request : http.request;

        // Collect incoming request body
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          const body =
            chunks.length > 0 ? Buffer.concat(chunks) : undefined;

          // Forward headers, fix host
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(
            req.headers as Record<string, string>
          )) {
            if (
              !value ||
              ["host", "connection", "origin", "referer"].includes(key)
            )
              continue;
            headers[key] = value;
          }
          headers["host"] = parsed.host;

          const proxyReq = requestFn(
            targetUrl,
            {
              method: req.method || "GET",
              headers,
              agent: isHttps ? agent : undefined,
            },
            (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
              proxyRes.pipe(res);
            }
          );

          proxyReq.on("error", (err: Error) => {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end(`Proxy error: ${err.message}`);
          });

          if (body) proxyReq.write(body);
          proxyReq.end();
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), externalProxy()],
  // When embedded in the CDA binary, the UI is served at /ui/.
  // This ensures all asset references (JS, CSS) use the correct prefix.
  base: "/ui/",
  server: {
    port: 5173,
    proxy: {
      "/vehicle": {
        target: "http://localhost:20002",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:20002",
        changeOrigin: true,
      },
    },
  },
});
