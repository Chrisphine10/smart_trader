import { z } from "zod";

export const createTradeSchema = z.object({
  symbol: z.string().trim().min(1).max(16).transform((value) => value.toUpperCase()),
  side: z.enum(["buy", "sell"]),
  quantity: z.number().positive(),
  price: z.number().positive(),
  executedAt: z.string().datetime(),
  notes: z.string().trim().max(1_000).optional(),
});

export type CreateTradeInput = z.infer<typeof createTradeSchema>;

export type Trade = CreateTradeInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
