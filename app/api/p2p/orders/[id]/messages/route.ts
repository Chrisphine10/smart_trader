import type { NextRequest } from "next/server";
import { currentUser, handleRoute, json, readBody } from "../../../../../../lib/http";
import { addP2POrderMessage, listP2POrderMessages } from "../../../../../../lib/repositories";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = currentUser(request);
    const { id } = await context.params;
    return json({ messages: listP2POrderMessages(user, id) });
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = currentUser(request);
    const body = await readBody(request);
    const { id } = await context.params;
    return json({ message: addP2POrderMessage(user, id, String(body.message ?? "")) }, 201);
  });
}
