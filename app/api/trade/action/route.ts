import { type NextRequest } from "next/server";
import { createManualTrade, getAutoSession, getFreshUser, maybeCreateAutoTrade, startAutoSession, stopAutoSession, updateAutoSessionSettings } from "../../../../lib/repositories";
import { market } from "../../../../lib/market";
import { publicUser, requireUserFromHeader } from "../../../../lib/db";
import { error, handleRoute, json, readBody } from "../../../../lib/http";
import type { Direction } from "../../../../lib/trading";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const user = requireUserFromHeader(request.headers.get("authorization"));
    const body = await readBody(request);
    const type = String(body.type ?? "");
    const config = (body.config ?? {}) as Record<string, unknown>;
    const asset = String(config.asset ?? "volatility_10_1s");
    const tick = market.current(asset);

    if (type === "manual_trade") {
      const position = createManualTrade(user, {
        asset,
        direction: String(config.direction ?? "over") as Direction,
        stake: Number(config.stake ?? 0),
        selectedDigit: Number(config.selectedDigit ?? 5),
        isDemo: Boolean(config.isDemo),
        durationTicks: Number(config.durationTicks ?? 5),
        contractMode: config.contractMode === "forex" ? "forex" : "digit",
        leverage: Number(config.leverage ?? 1),
      }, tick);
      return json({ position, user: publicUser(getFreshUser(user.id)) });
    }

    if (type === "auto_trading_start") {
      const session = startAutoSession(user, {
        asset,
        direction: String(config.direction ?? "over") as Direction,
        stake: Number(config.stake ?? 0),
        targetProfit: Number(config.targetProfit ?? 0),
        targetLoss: Number(config.targetLoss ?? 0),
        lossMultiple: Number(config.lossMultiple ?? 1),
        isDemo: Boolean(config.isDemo),
        selectedDigit: Number(config.selectedDigit ?? 5),
        strategy: String(config.strategy ?? "smart"),
        maxTrades: Number(config.maxTrades ?? 25),
        durationTicks: Number(config.durationTicks ?? 5),
        contractMode: config.contractMode === "forex" ? "forex" : "digit",
        leverage: Number(config.leverage ?? 1),
      });
      const position = maybeCreateAutoTrade(user.id, tick);
      return json({ session, position, user: publicUser(getFreshUser(user.id)) });
    }

    if (type === "auto_trading_stop") {
      return json({ session: stopAutoSession(user.id), user: publicUser(getFreshUser(user.id)) });
    }

    if (type === "auto_trading_status") {
      return json({ session: getAutoSession(user.id), user: publicUser(getFreshUser(user.id)) });
    }

    if (type === "auto_trading_update_settings") {
      return json({
        session: updateAutoSessionSettings(user.id, { durationTicks: Number(config.durationTicks ?? 5) }),
        user: publicUser(getFreshUser(user.id)),
      });
    }

    return error("Unsupported trade action", 400);
  });
}
