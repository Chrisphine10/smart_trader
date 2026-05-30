import type { NextRequest } from "next/server";
import { db } from "../../../../lib/db";
import { currentUser, handleRoute, json } from "../../../../lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const user = currentUser(request);
    return json({ referrals: db.prepare("SELECT id, email, username, created_at FROM users WHERE referred_by = ? ORDER BY created_at DESC").all(user.referral_code) });
  });
}
