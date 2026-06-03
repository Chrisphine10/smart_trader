import type { NextRequest } from "next/server";
import { currentUser, handleRoute, json, readBody } from "../../../../lib/http";
import { money } from "../../../../lib/db";
import { submitWithdrawal } from "../../../../lib/repositories";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const user = currentUser(request);
    const body = await readBody(request);
    const method = String(body.method ?? "mpesa");
    return json({
      success: true,
      ...(submitWithdrawal(
        user,
        method === "crypto"
          ? {
            method,
            assetSymbol: String(body.assetSymbol ?? ""),
            network: String(body.network ?? ""),
            walletAddress: body.walletAddress ? String(body.walletAddress) : undefined,
          }
          : method,
        money(body.amount),
        body.walletAddress ? String(body.walletAddress) : undefined,
      )),
    });
  });
}
