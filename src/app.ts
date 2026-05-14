import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { tradeRouter } from "./trades/trade.routes.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.use("/api/trades", tradeRouter);

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    console.error(error);
    response.status(500).json({ error: "Internal server error." });
  };

  app.use(errorHandler);

  return app;
}
