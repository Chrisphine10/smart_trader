import type { NextRequest } from "next/server";
import { db, verifyToken } from "../../../../lib/db";
import { error, handleRoute, json, readBody } from "../../../../lib/http";
import { listKycSubmissions, reviewKyc } from "../../../../lib/repositories";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    if (!isAdmin(request)) return error("Unauthorized", 401);
    const { searchParams } = new URL(request.url);
    return json({ submissions: listKycSubmissions(searchParams.get("status") ?? "") });
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const admin = requireAdmin(request);
    if (!admin) return error("Unauthorized", 401);
    const body = await readBody(request);
    const status = String(body.status ?? "approved");
    if (!["approved", "rejected", "restricted"].includes(status)) return error("Invalid KYC status");
    return json({ submission: reviewKyc(admin.id, String(body.id ?? ""), status as "approved" | "rejected" | "restricted", String(body.notes ?? "")) });
  });
}

function requireAdmin(request: NextRequest) {
  const payload = verifyToken<{ id: string; kind: string }>(request.headers.get("authorization"));
  if (!payload?.id || payload.kind !== "admin") return null;
  return db.prepare("SELECT id, email, name FROM admins WHERE id = ?").get(payload.id) as { id: string; email: string; name: string } | undefined;
}

function isAdmin(request: NextRequest) {
  return Boolean(requireAdmin(request));
}
