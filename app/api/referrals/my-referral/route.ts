import type { NextRequest } from "next/server";
import { config } from "../../../../lib/config";
import { db } from "../../../../lib/db";
import { currentUser, handleRoute, json } from "../../../../lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const user = currentUser(request);
    const recentReferrals = db.prepare("SELECT id, email, username, created_at FROM users WHERE referred_by = ? ORDER BY created_at DESC LIMIT 10").all(user.referral_code);
    const commissions = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM referral_commissions WHERE referrer_id = ?").get(user.id) as { total: number };
    return json({
      referralCode: user.referral_code,
      referralLink: `${config.appUrl}/register?ref=${user.referral_code}`,
      referralPercentage: "10.00",
      totalReferrals: recentReferrals.length,
      totalEarned: commissions.total,
      pendingCommission: commissions.total,
      recentReferrals,
    });
  });
}
