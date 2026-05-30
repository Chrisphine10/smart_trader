import type { NextRequest } from "next/server";
import { handleRoute, json, readBody, error } from "../../../../../../lib/http";
import { reviewWithdrawal } from "../../../../../../lib/repositories";
import { requireAdmin } from "../../route";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const admin = requireAdmin(request);
    if (!admin) return error("Unauthorized", 401);
    const { id } = await context.params;
    const body = await readBody(request);
    const action = String(body.action ?? "approve") === "reject" ? "reject" : "approve";
    return json({ payment: reviewWithdrawal(admin.id, id, action, String(body.notes ?? ""), String(body.reference ?? "")) });
  });
}
