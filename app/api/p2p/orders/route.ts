import type { NextRequest } from "next/server";
import { currentUser, handleRoute, json, readBody } from "../../../../lib/http";
import { defaultP2PWeb3PaymentMethods } from "../../../../lib/p2p-methods";
import { createP2POrder, listUserP2POrders } from "../../../../lib/repositories";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const user = currentUser(request);
    return json({ orders: listUserP2POrders(user.id) });
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const user = currentUser(request);
    const body = await readBody(request);
    return json({ order: createP2POrder(user, {
      adId: String(body.adId ?? ""),
      assetAmount: Number(body.assetAmount ?? 10),
      paymentMethod: String(body.paymentMethod ?? defaultP2PWeb3PaymentMethods[0]),
    }) }, 201);
  });
}
