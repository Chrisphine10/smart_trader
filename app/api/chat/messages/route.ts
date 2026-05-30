import type { NextRequest } from "next/server";
import { currentUser, handleRoute, json, readBody } from "../../../../lib/http";
import { addChatMessage } from "../../../../lib/repositories";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const user = currentUser(request);
    const body = await readBody(request);
    const message = addChatMessage(String(body.conversationId), user.id, String(body.message ?? ""));
    return json({ message });
  });
}
