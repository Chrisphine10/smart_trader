import type { NextRequest } from "next/server";
import { currentUser, handleRoute, json } from "../../../../../lib/http";
import { addChatMessage } from "../../../../../lib/repositories";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const user = currentUser(request);
    const form = await request.formData();
    const conversationId = String(form.get("conversationId"));
    const message = addChatMessage(conversationId, user.id, "Sandbox image received");
    return json({ message: { ...message, image_url: "/icons/icon.svg" } });
  });
}
