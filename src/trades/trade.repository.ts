import { randomUUID } from "node:crypto";
import { db } from "../database/connection.js";
import type { CreateTradeInput, Trade } from "./trade.schema.js";

type TradeRow = {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  executed_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function toTrade(row: TradeRow): Trade {
  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    quantity: row.quantity,
    price: row.price,
    executedAt: row.executed_at,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listTrades(): Trade[] {
  const rows = db
    .prepare("SELECT * FROM trades ORDER BY executed_at DESC, created_at DESC")
    .all() as TradeRow[];

  return rows.map(toTrade);
}

export function getTradeById(id: string): Trade | null {
  const row = db.prepare("SELECT * FROM trades WHERE id = ?").get(id) as TradeRow | undefined;
  return row ? toTrade(row) : null;
}

export function createTrade(input: CreateTradeInput): Trade {
  const id = randomUUID();

  db.prepare(`
    INSERT INTO trades (id, symbol, side, quantity, price, executed_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.symbol,
    input.side,
    input.quantity,
    input.price,
    input.executedAt,
    input.notes ?? null,
  );

  const trade = getTradeById(id);
  if (!trade) {
    throw new Error("Failed to load created trade.");
  }

  return trade;
}

export function deleteTrade(id: string): boolean {
  const result = db.prepare("DELETE FROM trades WHERE id = ?").run(id);
  return result.changes > 0;
}
