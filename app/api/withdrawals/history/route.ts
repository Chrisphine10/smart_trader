import type { NextRequest } from "next/server";
import { db } from "../../../../lib/db";
import { currentUser, handleRoute, json } from "../../../../lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const user = currentUser(request);
    const withdrawals = db.prepare("SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
    return json({ withdrawals });
  });
}
