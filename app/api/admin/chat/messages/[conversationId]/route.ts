import type { NextRequest } from "next/server";
import { db, verifyToken } from "../../../../../../lib/db";
import { error, handleRoute, json, readBody } from "../../../../../../lib/http";
import { addAdminSupportMessage, listSupportMessages } from "../../../../../../lib/repositories";

export const runtime = "nodejs";

function requireAdmin(request: NextRequest) {
  const payload = verifyToken<{ id: string; kind: string }>(request.headers.get("authorization"));
  if (!payload?.id || payload.kind !== "admin") return null;
  return db.prepare("SELECT id, email, name FROM admins WHERE id = ?").get(payload.id) as { id: string } | undefined;
}

export async function GET(request: NextRequest, context: { params: Promise<{ conversationId: string }> }) {
  return handleRoute(async () => {
    const admin = requireAdmin(request);
    if (!admin) return error("Unauthorized", 401);
    const { conversationId } = await context.params;
    return json({ messages: listSupportMessages(conversationId) });
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ conversationId: string }> }) {
  return handleRoute(async () => {
    const admin = requireAdmin(request);
    if (!admin) return error("Unauthorized", 401);
    const { conversationId } = await context.params;
    const body = await readBody(request);
    const message = String(body.message ?? "").trim();
    if (!message) return error("Message is required", 400);
    return json({ message: addAdminSupportMessage(conversationId, admin.id, message) }, 201);
  });
}
