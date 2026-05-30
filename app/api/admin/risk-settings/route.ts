import type { NextRequest } from "next/server";
import { db, verifyToken } from "../../../../lib/db";
import { error, handleRoute, json, readBody } from "../../../../lib/http";
import { listRiskSettings, updateRiskSettings } from "../../../../lib/repositories";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    if (!isAdmin(request)) return error("Unauthorized", 401);
    return json({ settings: listRiskSettings() });
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    if (!isAdmin(request)) return error("Unauthorized", 401);
    const body = await readBody(request);
    const settings = updateRiskSettings(Object.fromEntries(Object.entries(body).map(([key, value]) => [key, String(value ?? "")])));
    return json({ success: true, settings });
  });
}

function isAdmin(request: NextRequest) {
  const payload = verifyToken<{ id: string; kind: string }>(request.headers.get("authorization"));
  if (!payload?.id || payload.kind !== "admin") return false;
  return Boolean(db.prepare("SELECT id FROM admins WHERE id = ?").get(payload.id));
}
