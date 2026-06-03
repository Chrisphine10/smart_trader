import type { NextRequest } from "next/server";
import { db, verifyToken } from "../../../../lib/db";
import { error, handleRoute, json, readBody } from "../../../../lib/http";
import { listAppSettings, listCryptoNetworks, updateAppSettings, updateCryptoNetworkSettings } from "../../../../lib/repositories";

export const runtime = "nodejs";

const editableKeys = new Set([
  "payments.mode",
  "payments.currency",
  "payments.usdKesRate",
  "payments.minDeposit",
  "payments.minWithdrawal",
  "payments.withdrawalReview",
  "mpesa.enabled",
  "mpesa.withdrawals.enabled",
  "mpesa.environment",
  "mpesa.shortCode",
  "mpesa.transactionType",
  "mpesa.accountReference",
  "mpesa.consumerKey",
  "mpesa.consumerSecret",
  "mpesa.passkey",
  "mpesa.callbackUrl",
  "paystack.enabled",
  "paystack.publicKey",
  "paystack.secretKey",
  "paystack.currency",
  "paystack.callbackUrl",
  "card.enabled",
  "trc20.enabled",
  "trc20.withdrawals.enabled",
]);

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    if (!isAdmin(request)) return error("Unauthorized", 401);
    return json({ settings: maskSecrets(listAppSettings()), cryptoNetworks: listCryptoNetworks(true) });
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    if (!isAdmin(request)) return error("Unauthorized", 401);
    const body = await readBody(request);
    const values: Record<string, string> = {};
    Object.entries(body).forEach(([key, value]) => {
      if (!editableKeys.has(key)) return;
      const stringValue = String(value ?? "");
      if ((key.includes("Secret") || key.includes("passkey") || key.endsWith("secretKey")) && stringValue === "********") return;
      values[key] = stringValue;
    });
    updateAppSettings(values);
    const cryptoNetworks = Array.isArray(body.cryptoNetworks) ? updateCryptoNetworkSettings(body.cryptoNetworks as Array<{ id?: string; assetSymbol?: string; network?: string; depositEnabled?: boolean; withdrawEnabled?: boolean }>) : listCryptoNetworks(true);
    return json({ success: true, settings: maskSecrets(listAppSettings()), cryptoNetworks });
  });
}

function isAdmin(request: NextRequest) {
  const payload = verifyToken<{ id: string; kind: string }>(request.headers.get("authorization"));
  if (!payload?.id || payload.kind !== "admin") return false;
  const admin = db.prepare("SELECT id FROM admins WHERE id = ?").get(payload.id);
  return Boolean(admin);
}

function maskSecrets(settings: Record<string, string>) {
  return Object.fromEntries(Object.entries(settings).map(([key, value]) => [
    key,
    key.includes("Secret") || key.includes("passkey") || key.endsWith("secretKey") ? (value ? "********" : "") : value,
  ]));
}
