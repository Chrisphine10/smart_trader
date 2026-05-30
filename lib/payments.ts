import { config } from "./config";
import { money, type User } from "./db";
import { getAppSetting, recordDeposit, recordPendingDeposit } from "./repositories";

type PaymentResult = {
  success: boolean;
  mode: "sandbox" | "live";
  provider: "mpesa" | "paystack";
  message: string;
  checkoutUrl?: string;
  reference?: string;
  id?: string;
  amount?: number;
  balance?: number;
  providerResponse?: unknown;
};

export async function initiateMpesaDeposit(user: User, amountUsd: number, phone: string): Promise<PaymentResult> {
  if (setting("mpesa.enabled", "true") !== "true") throw new Error("M-Pesa deposits are disabled by admin");
  const amount = money(amountUsd);
  const mode = paymentMode();
  const amountKes = usdToKes(amount);
  if (user.is_demo || mode === "sandbox" || !setting("mpesa.consumerKey") || !setting("mpesa.consumerSecret") || !setting("mpesa.passkey")) {
    const result = recordDeposit(user, "mpesa", amount, Boolean(user.is_demo));
    return {
      success: true,
      mode: "sandbox",
      provider: "mpesa",
      message: "Sandbox M-Pesa STK push approved and credited",
      ...result,
    };
  }

  const reference = `MPESA-${Date.now()}`;
  const token = await darajaToken();
  const shortcode = setting("mpesa.shortCode", "174379");
  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${shortcode}${setting("mpesa.passkey")}${timestamp}`).toString("base64");
  const response = await fetch(`${darajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: setting("mpesa.transactionType", "CustomerPayBillOnline"),
      Amount: amountKes,
      PartyA: normalizePhone(phone),
      PartyB: shortcode,
      PhoneNumber: normalizePhone(phone),
      CallBackURL: setting("mpesa.callbackUrl", `${config.appUrl}/api/auth/mpesa/callback`),
      AccountReference: setting("mpesa.accountReference", "Hydra Trade"),
      TransactionDesc: "Hydra Trade wallet deposit",
    }),
  });
  const providerResponse = await response.json().catch(() => ({}));
  const checkoutRequestId = String((providerResponse as Record<string, unknown>).CheckoutRequestID ?? reference);
  const pending = recordPendingDeposit(user, "mpesa", amount, checkoutRequestId, undefined, normalizePhone(phone));
  return {
    ...pending,
    success: response.ok,
    mode: "live",
    provider: "mpesa",
    message: response.ok ? "M-Pesa STK push sent. Deposit will credit after callback confirmation." : "M-Pesa STK push failed",
    reference: checkoutRequestId,
    providerResponse,
  };
}

export async function initiatePaystackDeposit(user: User, amountUsd: number): Promise<PaymentResult> {
  if (setting("paystack.enabled", "true") !== "true") throw new Error("Paystack deposits are disabled by admin");
  const amount = money(amountUsd);
  const mode = paymentMode();
  const reference = `PSTK-${Date.now()}`;
  const secretKey = setting("paystack.secretKey");
  if (user.is_demo || mode === "sandbox" || !secretKey) {
    const result = recordDeposit(user, "paystack", amount, Boolean(user.is_demo));
    return {
      success: true,
      mode: "sandbox",
      provider: "paystack",
      message: "Sandbox Paystack payment approved and credited",
      reference,
      ...result,
    };
  }

  const currency = setting("paystack.currency", "KES");
  const unitAmount = currency.toUpperCase() === "USD" ? Math.round(amount * 100) : Math.round(usdToKes(amount) * 100);
  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      amount: unitAmount,
      currency,
      reference,
      callback_url: setting("paystack.callbackUrl", `${config.appUrl}/trade`),
      metadata: { userId: user.id, amountUsd: amount },
    }),
  });
  const payload = await response.json().catch(() => ({})) as { data?: { authorization_url?: string; reference?: string } };
  const checkoutUrl = payload.data?.authorization_url;
  const pending = recordPendingDeposit(user, "paystack", amount, payload.data?.reference ?? reference, checkoutUrl);
  return {
    ...pending,
    success: response.ok,
    mode: "live",
    provider: "paystack",
    message: response.ok ? "Paystack checkout created. Complete payment to credit wallet." : "Paystack initialization failed",
    checkoutUrl,
    reference: payload.data?.reference ?? reference,
    providerResponse: payload,
  };
}

function paymentMode(): "sandbox" | "live" {
  return setting("payments.mode", "sandbox") === "live" ? "live" : "sandbox";
}

function setting(key: string, fallback = "") {
  return getAppSetting(key, fallback).trim();
}

function usdToKes(amountUsd: number) {
  return Math.max(1, Math.round(amountUsd * Number(setting("payments.usdKesRate", "129.09"))));
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  return digits;
}

function darajaBaseUrl() {
  return setting("mpesa.environment", "sandbox") === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
}

async function darajaToken() {
  const credentials = Buffer.from(`${setting("mpesa.consumerKey")}:${setting("mpesa.consumerSecret")}`).toString("base64");
  const response = await fetch(`${darajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!response.ok) throw new Error("Unable to authenticate with Daraja");
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("Daraja did not return an access token");
  return payload.access_token;
}

function darajaTimestamp() {
  return new Date().toISOString().replaceAll("-", "").replaceAll(":", "").replaceAll("T", "").replaceAll("Z", "").replaceAll(".", "").slice(0, 14);
}
