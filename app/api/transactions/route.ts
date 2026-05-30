import type { NextRequest } from "next/server";
import { currentUser, handleRoute, json } from "../../../lib/http";
import { listTransactions } from "../../../lib/repositories";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const user = currentUser(request);
    const limit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "40", 10);
    return json({ transactions: listTransactions(user.id, limit) });
  });
}
