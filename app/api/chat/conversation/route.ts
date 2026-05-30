import type { NextRequest } from "next/server";
import { currentUser, handleRoute, json } from "../../../../lib/http";
import { ensureConversation } from "../../../../lib/repositories";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const user = currentUser(request);
    return json({ conversation: ensureConversation(user.id) });
  });
}
