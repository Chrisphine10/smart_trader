import type { NextRequest } from "next/server";
import { currentUser, handleRoute, json, readBody } from "../../../../lib/http";
import { money } from "../../../../lib/db";
import { submitWithdrawal } from "../../../../lib/repositories";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const user = currentUser(request);
    const body = await readBody(request);
    return json({ success: true, ...(submitWithdrawal(user, String(body.method ?? "mpesa"), money(body.amount), body.walletAddress ? String(body.walletAddress) : undefined)) });
  });
}
