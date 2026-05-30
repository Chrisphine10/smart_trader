import { NextResponse, type NextRequest } from "next/server";
import { requireUserFromHeader } from "./db";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function readBody(request: NextRequest) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 1_000_000) throw new Error("Request body too large");
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function currentUser(request: NextRequest) {
  return requireUserFromHeader(request.headers.get("authorization"));
}

export function handleRoute(fn: () => Response | Promise<Response>) {
  return Promise.resolve(fn()).catch((err) => {
    const message = err instanceof Error ? err.message : "Internal server error";
    return error(message, message === "Unauthorized" ? 401 : 400);
  });
}

export function rateLimit(request: NextRequest, key: string, limit = 30, windowMs = 60_000) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "local";
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return null;
  }
  bucket.count += 1;
  if (bucket.count > limit) return error("Too many requests. Please try again shortly.", 429);
  return null;
}
