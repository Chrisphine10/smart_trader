import type { NextRequest } from "next/server";
import { db, verifyToken } from "../../../../../lib/db";
import { error, handleRoute, json } from "../../../../../lib/http";
import { listSupportConversations } from "../../../../../lib/repositories";

export const runtime = "nodejs";

function requireAdmin(request: NextRequest) {
  const payload = verifyToken<{ id: string; kind: string }>(request.headers.get("authorization"));
  if (!payload?.id || payload.kind !== "admin") return null;
  return db.prepare("SELECT id, email, name FROM admins WHERE id = ?").get(payload.id);
}

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const admin = requireAdmin(request);
    if (!admin) return error("Unauthorized", 401);
    return json({ conversations: listSupportConversations() });
  });
}
