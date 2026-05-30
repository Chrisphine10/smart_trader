import type { NextRequest } from "next/server";
import { currentUser, handleRoute, json } from "../../../../../../lib/http";
import { cancelP2POrder } from "../../../../../../lib/repositories";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = currentUser(request);
    const { id } = await context.params;
    return json({ order: cancelP2POrder(user, id) });
  });
}
