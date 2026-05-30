import { type NextRequest } from "next/server";
import { getAutoSession, getFreshUser, maybeCreateAutoTrade, recordAutoSettlement, settleOpenPositions } from "../../../../lib/repositories";
import { market } from "../../../../lib/market";
import { getUserById, publicUser, verifyToken } from "../../../../lib/db";
import { handleRoute, json } from "../../../../lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const asset = request.nextUrl.searchParams.get("asset") ?? "volatility_10_1s";
    const tick = market.current(asset);
    const payload = verifyToken<{ id: string; kind: string }>(request.headers.get("authorization"));
    const user = payload?.kind === "user" && payload.id ? getUserById(payload.id) : null;

    if (!user) return json({ tick });

    const updates = settleOpenPositions(user.id, asset, tick);
    const autoTrading = recordAutoSettlement(user.id, updates);
    const autoPosition = maybeCreateAutoTrade(user.id, tick);
    const freshUser = getFreshUser(user.id);

    return json({
      tick,
      positions: autoPosition ? [autoPosition, ...updates] : updates,
      user: publicUser(freshUser),
      autoTrading: autoTrading ?? getAutoSession(user.id),
    });
  });
}
