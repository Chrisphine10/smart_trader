import type { NextRequest } from "next/server";
import { currentUser, handleRoute, json } from "../../../../lib/http";
import { stopAutoSession } from "../../../../lib/repositories";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleRoute(async () => json({ session: stopAutoSession(currentUser(request).id) }));
}
