import type { NextRequest } from "next/server";
import { db, verifyToken } from "../../../../lib/db";
import { error, handleRoute, json } from "../../../../lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const payload = verifyToken<{ id: string; kind: string }>(request.headers.get("authorization"));
    if (!payload?.id || payload.kind !== "admin") return error("Unauthorized", 401);
    const admin = db.prepare("SELECT id, email, name, created_at FROM admins WHERE id = ?").get(payload.id);
    return json({ admin });
  });
}
