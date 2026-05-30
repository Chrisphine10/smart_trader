import type { NextRequest } from "next/server";
import { handleRoute, json, currentUser } from "../../../../lib/http";
import { listPositions } from "../../../../lib/repositories";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const user = currentUser(request);
    const isDemo = request.nextUrl.searchParams.get("isDemo") !== "false";
    return json({ positions: listPositions(user.id, isDemo) });
  });
}
