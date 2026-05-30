import type { NextRequest } from "next/server";
import { db } from "../../../../../lib/db";
import { currentUser, handleRoute, json } from "../../../../../lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ conversationId: string }> }) {
  return handleRoute(async () => {
    currentUser(request);
    const { conversationId } = await context.params;
    const messages = db.prepare("SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC").all(conversationId);
    return json({ messages });
  });
}
