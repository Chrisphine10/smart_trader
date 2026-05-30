import type { NextRequest } from "next/server";
import { currentUser, handleRoute, json } from "../../../../lib/http";
import { getAutoSession } from "../../../../lib/repositories";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => json({ session: getAutoSession(currentUser(request).id) }));
}
