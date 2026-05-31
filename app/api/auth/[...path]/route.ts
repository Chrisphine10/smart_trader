import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { type NextRequest } from "next/server";
import { db, getUserByEmail, getUserById, hashPassword, money, publicUser, referralCode, requireUserFromHeader, signToken, trc20Address, verifyPassword } from "../../../../lib/db";
import { error, handleRoute, json, rateLimit, readBody } from "../../../../lib/http";
import { initiateMpesaDeposit, initiatePaystackDeposit } from "../../../../lib/payments";
import { confirmProviderDeposit, getAppSetting } from "../../../../lib/repositories";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleRoute(async () => {
    const path = (await context.params).path.join("/");
    if (path === "me") {
      const user = requireUserFromHeader(request.headers.get("authorization"));
      return json({ user: publicUser(user) });
    }
    if (path === "exchange-rate") {
      return json({ from: "USD", to: "KES", rate: Number(getAppSetting("payments.usdKesRate", "129.09")), lastUpdated: new Date().toISOString() });
    }
    if (path === "trc20/my-address") {
      const user = requireUserFromHeader(request.headers.get("authorization"));
      return json({ address: user.trc20_address });
    }
    if (path === "deposits") {
      const user = requireUserFromHeader(request.headers.get("authorization"));
      const deposits = db.prepare("SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
      return json({ deposits });
    }
    return error("Not found", 404);
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleRoute(async () => {
    const path = (await context.params).path.join("/");
    const limited = ["login", "register", "demo", "mpesa/stk-push", "paystack/initialize", "card/deposit"].includes(path) ? rateLimit(request, path, path === "login" ? 10 : 30) : null;
    if (limited) return limited;
    if (path === "mpesa/callback") return handleMpesaCallback(request);
    if (path === "paystack/webhook") return handlePaystackWebhook(request);
    const body = await readBody(request);

    if (path === "login") {
      const user = getUserByEmail(String(body.email ?? ""));
      if (!user || !verifyPassword(String(body.password ?? ""), user.password_hash)) return error("Invalid email or password", 401);
      const realModeUser = setRealTradeMode(user.id);
      const token = signToken({ id: realModeUser.id, email: realModeUser.email, username: realModeUser.username, kind: "user", pending2FA: false });
      return json({ user: publicUser(realModeUser), token });
    }

    if (path === "login/verify-2fa") {
      const payload = { id: String(body.tempToken ?? ""), email: "demo@tagoption.local", username: "Trader", kind: "user" };
      return json({ token: signToken(payload), user: publicUser(getUserById(payload.id) ?? createDemoUser()) });
    }

    if (path === "register") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const username = String(body.username ?? "").trim() || email.split("@")[0] || "Trader";
      if (!email.includes("@")) return error("Valid email is required");
      if (password.length < 6) return error("Password must be at least 6 characters");
      if (getUserByEmail(email)) return error("Email already exists", 409);
      const id = randomUUID();
      db.prepare(`
        INSERT INTO users (id, email, username, password_hash, balance, real_balance, demo_balance, is_demo, referral_code, referred_by, trc20_address)
        VALUES (?, ?, ?, ?, 0, 0, 10000, 0, ?, ?, ?)
      `).run(id, email, username, hashPassword(password), referralCode(), body.referralCode ? String(body.referralCode) : null, trc20Address());
      const user = getUserById(id)!;
      return json({ user: publicUser(user), token: signToken({ id: user.id, email: user.email, username: user.username, kind: "user" }) }, 201);
    }

    if (path === "demo") {
      const user = createDemoUser();
      return json({ user: publicUser(user), token: signToken({ id: user.id, email: user.email, username: user.username, kind: "user" }) });
    }

    if (path === "switch-account") {
      const user = requireUserFromHeader(request.headers.get("authorization"));
      const mode = String(body.mode ?? "demo") === "demo";
      db.prepare("UPDATE users SET is_demo = ?, balance = ? WHERE id = ?").run(mode ? 1 : 0, mode ? user.demo_balance : user.real_balance, user.id);
      const fresh = getUserById(user.id)!;
      return json({ user: publicUser(fresh), token: signToken({ id: fresh.id, email: fresh.email, username: fresh.username, kind: "user" }) });
    }

    if (path === "reset-demo") {
      const user = requireUserFromHeader(request.headers.get("authorization"));
      db.prepare("UPDATE users SET demo_balance = 10000, balance = CASE WHEN is_demo = 1 THEN 10000 ELSE balance END WHERE id = ?").run(user.id);
      return json({ user: publicUser(getUserById(user.id)!) });
    }

    if (path === "mpesa/stk-push") {
      const user = requireUserFromHeader(request.headers.get("authorization"));
      const amount = money(body.amount);
      const minDeposit = Number(getAppSetting("payments.minDeposit", "1"));
      if (amount < minDeposit) return error(`Minimum deposit is $${minDeposit}`);
      const phone = String(body.phone ?? user.mpesa_phone ?? "");
      if (!phone && amount > 0) return error("M-Pesa phone number is required");
      return json(await initiateMpesaDeposit(user, amount, phone));
    }

    if (path === "card/deposit") {
      const user = requireUserFromHeader(request.headers.get("authorization"));
      const amount = money(body.amount);
      const minDeposit = Number(getAppSetting("payments.minDeposit", "1"));
      if (amount < minDeposit) return error(`Minimum deposit is $${minDeposit}`);
      return json(await initiatePaystackDeposit(user, amount));
    }

    if (path === "paystack/initialize") {
      const user = requireUserFromHeader(request.headers.get("authorization"));
      const amount = money(body.amount);
      const minDeposit = Number(getAppSetting("payments.minDeposit", "1"));
      if (amount < minDeposit) return error(`Minimum deposit is $${minDeposit}`);
      return json(await initiatePaystackDeposit(user, amount));
    }

    return error("Not found", 404);
  });
}

async function handleMpesaCallback(request: NextRequest) {
  const payload = await request.json().catch(() => ({})) as Record<string, any>;
  const callback = payload?.Body?.stkCallback ?? payload?.stkCallback ?? payload;
  const reference = String(callback?.CheckoutRequestID ?? callback?.checkoutRequestId ?? callback?.reference ?? "");
  if (!reference) return error("Missing M-Pesa checkout reference");
  const resultCode = Number(callback?.ResultCode ?? callback?.resultCode ?? 1);
  const result = confirmProviderDeposit({
    provider: "mpesa",
    reference,
    eventId: String(callback?.MerchantRequestID ?? callback?.merchantRequestId ?? reference),
    status: resultCode === 0 ? "success" : "failed",
    payload,
    failureReason: resultCode === 0 ? undefined : String(callback?.ResultDesc ?? "M-Pesa payment failed"),
  });
  return json({ success: true, ...result });
}

async function handlePaystackWebhook(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const secret = getAppSetting("paystack.secretKey", "");
  if (secret) {
    const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
    const ok = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!ok) return error("Invalid Paystack signature", 401);
  }
  const payload = JSON.parse(rawBody || "{}") as Record<string, any>;
  const data = payload.data ?? {};
  const reference = String(data.reference ?? payload.reference ?? "");
  if (!reference) return error("Missing Paystack reference");
  const result = confirmProviderDeposit({
    provider: "paystack",
    reference,
    eventId: String(payload.id ?? data.id ?? reference),
    status: payload.event === "charge.success" || data.status === "success" ? "success" : "failed",
    payload,
    failureReason: data.gateway_response ? String(data.gateway_response) : "Paystack payment was not successful",
  });
  return json({ success: true, ...result });
}

function setRealTradeMode(userId: string) {
  db.prepare("UPDATE users SET is_demo = 0, balance = real_balance WHERE id = ?").run(userId);
  return getUserById(userId)!;
}

function createDemoUser() {
  const email = `demo-${Date.now()}@tagoption.local`;
  const id = randomUUID();
  db.prepare(`
    INSERT INTO users (id, email, username, password_hash, balance, real_balance, demo_balance, is_demo, referral_code, trc20_address)
    VALUES (?, ?, 'Demo Trader', ?, 10000, 0, 10000, 1, ?, ?)
  `).run(id, email, hashPassword(randomUUID()), referralCode(), trc20Address());
  return getUserById(id)!;
}
