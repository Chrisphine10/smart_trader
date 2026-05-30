import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { config, validateProductionConfig } from "./lib/config";
import { migrate } from "./lib/db";
import { attachWebSocketServer } from "./lib/ws-server";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

validateProductionConfig();
migrate();
await app.prepare();

const server = createServer((request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Content-Security-Policy", "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: ws: wss:");
  handle(request, response);
});

attachWebSocketServer(server);

server.listen(config.port, () => {
  console.log(`Hydra Trade listening on http://localhost:${config.port}`);
});
