import type { NextRequest } from "next/server";
import { error, handleRoute, json, readBody } from "../../../../../../../lib/http";
import { resolveP2PDispute } from "../../../../../../../lib/repositories";
import { requireAdmin } from "../../route";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const admin = requireAdmin(request);
    if (!admin) return error("Unauthorized", 401);
    const body = await readBody(request);
    const resolution = String(body.resolution ?? "no_action");
    if (!["release_buyer", "refund_seller", "no_action"].includes(resolution)) return error("Invalid P2P dispute resolution");
    const { id } = await context.params;
    return json({ order: resolveP2PDispute(admin.id, id, resolution as "release_buyer" | "refund_seller" | "no_action", String(body.notes ?? "")) });
  });
}
