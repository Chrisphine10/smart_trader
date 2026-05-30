import type { NextRequest } from "next/server";
import { currentUser, handleRoute, json, readBody } from "../../../../lib/http";
import { createP2PAd, listP2PAds } from "../../../../lib/repositories";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const { searchParams } = new URL(request.url);
    return json({ ads: listP2PAds({
      side: searchParams.get("side") ?? "sell",
      asset: searchParams.get("asset") ?? "USDT",
      fiatCurrency: searchParams.get("fiat") ?? "KES",
      paymentMethod: searchParams.get("paymentMethod") ?? "",
      minFiat: Number(searchParams.get("minFiat") ?? 0),
      maxFiat: Number(searchParams.get("maxFiat") ?? 0),
      sort: searchParams.get("sort") ?? "newest",
    }) });
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const user = currentUser(request);
    const body = await readBody(request);
    return json({ ad: createP2PAd(user, {
      side: String(body.side ?? "sell"),
      assetSymbol: String(body.assetSymbol ?? "USDT"),
      fiatCurrency: String(body.fiatCurrency ?? "KES"),
      price: Number(body.price ?? 132),
      availableAmount: Number(body.availableAmount ?? 100),
      minLimit: Number(body.minLimit ?? 500),
      maxLimit: Number(body.maxLimit ?? 50000),
      paymentMethods: String(body.paymentMethods ?? "M-Pesa,Bank Transfer,Paystack"),
      terms: body.terms ? String(body.terms) : undefined,
    }) }, 201);
  });
}
