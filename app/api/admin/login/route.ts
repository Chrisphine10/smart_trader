import type { NextRequest } from "next/server";
import { db, signToken, verifyPassword } from "../../../../lib/db";
import { error, handleRoute, json, readBody } from "../../../../lib/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const body = await readBody(request);
    const admin = db.prepare("SELECT * FROM admins WHERE lower(email) = lower(?)").get(String(body.email ?? "")) as { id: string; email: string; name: string; password_hash: string } | undefined;
    if (!admin || !verifyPassword(String(body.password ?? ""), admin.password_hash)) return error("Login failed", 401);
    return json({ admin: { id: admin.id, email: admin.email, name: admin.name }, token: signToken({ id: admin.id, email: admin.email, name: admin.name, kind: "admin" }) });
  });
}
