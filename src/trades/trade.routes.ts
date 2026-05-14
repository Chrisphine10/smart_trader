import { Router } from "express";
import { ZodError } from "zod";
import { createTrade, deleteTrade, getTradeById, listTrades } from "./trade.repository.js";
import { createTradeSchema } from "./trade.schema.js";

export const tradeRouter = Router();

tradeRouter.get("/", (_request, response) => {
  response.json({ data: listTrades() });
});

tradeRouter.post("/", (request, response) => {
  try {
    const input = createTradeSchema.parse(request.body);
    const trade = createTrade(input);
    response.status(201).json({ data: trade });
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({ error: "Invalid trade payload.", details: error.flatten() });
      return;
    }

    throw error;
  }
});

tradeRouter.get("/:id", (request, response) => {
  const trade = getTradeById(request.params.id);

  if (!trade) {
    response.status(404).json({ error: "Trade not found." });
    return;
  }

  response.json({ data: trade });
});

tradeRouter.delete("/:id", (request, response) => {
  const deleted = deleteTrade(request.params.id);

  if (!deleted) {
    response.status(404).json({ error: "Trade not found." });
    return;
  }

  response.status(204).send();
});
