import type { NextRequest } from "next/server";
import { currentUser, handleRoute, json, readBody } from "../../../../lib/http";
import { submitKyc } from "../../../../lib/repositories";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const user = currentUser(request);
    const body = await readBody(request);
    const fullName = String(body.fullName ?? "").trim();
    const documentType = String(body.documentType ?? "national_id").trim();
    const documentNumber = String(body.documentNumber ?? "").trim();
    if (!fullName) throw new Error("Full name is required for KYC");
    if (!documentNumber) throw new Error("Document number is required for KYC");
    return json({ submission: submitKyc(user, {
      fullName,
      documentType,
      documentNumber,
      country: String(body.country ?? "KE"),
      notes: body.notes ? String(body.notes) : undefined,
    }) }, 201);
  });
}
