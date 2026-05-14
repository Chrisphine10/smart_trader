import { createApp } from "./app.js";
import { config } from "./config.js";
import { closeDatabase } from "./database/connection.js";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Smart Trader API listening on http://localhost:${config.port}`);
});

function shutdown() {
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
