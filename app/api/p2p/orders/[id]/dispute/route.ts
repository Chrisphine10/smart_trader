import type { NextRequest } from "next/server";
import { currentUser, handleRoute, json, readBody } from "../../../../../../lib/http";
import { disputeP2POrder } from "../../../../../../lib/repositories";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = currentUser(request);
    const body = await readBody(request);
    const { id } = await context.params;
    return json({ order: disputeP2POrder(user, id, String(body.reason ?? "Payment confirmation issue")) });
  });
}
