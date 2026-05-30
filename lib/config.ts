import "dotenv/config";

const isProduction = process.env.NODE_ENV === "production";
const isBuild = process.env.npm_lifecycle_event === "build";

export const config = {
  port: Number.parseInt(process.env.PORT ?? "3000", 10),
  databasePath: process.env.DATABASE_PATH ?? (isBuild ? `${process.env.TEMP ?? "/tmp"}/smart_trader_build.sqlite` : process.env.NETLIFY ? "/tmp/smart_trader.sqlite" : "./data/smart_trader.sqlite"),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  adminEmail: process.env.ADMIN_EMAIL ?? "admin@tagoption.local",
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin12345",
  adminName: process.env.ADMIN_NAME ?? "Hydra Trade Admin",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? process.env.RENDER_EXTERNAL_URL ?? "http://localhost:3000",
};

export function validateProductionConfig() {
  if (!isProduction) return;
  const problems: string[] = [];
  if (!process.env.JWT_SECRET || ["change-me-in-local-dev", "dev-secret-change-me"].includes(config.jwtSecret)) problems.push("JWT_SECRET must be set to a strong production secret");
  if (!process.env.ADMIN_PASSWORD || ["admin12345", "password", "changeme"].includes(config.adminPassword.toLowerCase())) problems.push("ADMIN_PASSWORD must be changed from the default");
  if ((!process.env.NEXT_PUBLIC_APP_URL && !process.env.RENDER_EXTERNAL_URL) || config.appUrl.includes("localhost")) problems.push("NEXT_PUBLIC_APP_URL or RENDER_EXTERNAL_URL must be the public HTTPS app URL");
  if (!process.env.DATABASE_PATH) problems.push("DATABASE_PATH must point to persistent managed storage");
  if (process.env.PAYMENTS_MODE === "live") {
    if (!process.env.MPESA_CONSUMER_KEY || !process.env.MPESA_CONSUMER_SECRET || !process.env.MPESA_PASSKEY) problems.push("M-Pesa live mode requires Daraja credentials");
    if (!process.env.PAYSTACK_SECRET_KEY || !process.env.PAYSTACK_PUBLIC_KEY) problems.push("Paystack live mode requires public and secret keys");
  }
  if (problems.length) throw new Error(`Production configuration is unsafe:\n- ${problems.join("\n- ")}`);
}
