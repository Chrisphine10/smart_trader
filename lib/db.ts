import { randomBytes, randomUUID, pbkdf2Sync, createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config";

const databasePath = resolve(process.cwd(), config.databasePath);
mkdirSync(dirname(databasePath), { recursive: true });

const globalForDb = globalThis as unknown as { tagOptionDb?: DatabaseSync };

export const db = globalForDb.tagOptionDb ?? new DatabaseSync(databasePath);
globalForDb.tagOptionDb = db;

db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");
db.exec("PRAGMA journal_mode = WAL");

export type User = {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  balance: number;
  real_balance: number;
  demo_balance: number;
  is_demo: number;
  is_admin: number;
  two_factor_enabled: number;
  mpesa_phone: string | null;
  mpesa_phone_verified: number;
  referral_code: string;
  referred_by: string | null;
  trc20_address: string;
  kyc_status?: string;
  created_at: string;
};

export type Admin = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
};

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = pbkdf2Sync(password, salt, 120_000, 32, "sha256");
  const expected = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      real_balance REAL NOT NULL DEFAULT 0,
      demo_balance REAL NOT NULL DEFAULT 10000,
      is_demo INTEGER NOT NULL DEFAULT 1,
      is_admin INTEGER NOT NULL DEFAULT 0,
      two_factor_enabled INTEGER NOT NULL DEFAULT 0,
      mpesa_phone TEXT,
      mpesa_phone_verified INTEGER NOT NULL DEFAULT 0,
      referral_code TEXT NOT NULL UNIQUE,
      referred_by TEXT,
      trc20_address TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      asset TEXT NOT NULL,
      trade_type TEXT NOT NULL,
      direction TEXT NOT NULL,
      stake REAL NOT NULL,
      potential_payout REAL NOT NULL,
      entry_price REAL NOT NULL,
      entry_digit INTEGER NOT NULL,
      exit_price REAL,
      exit_digit INTEGER,
      ticks INTEGER NOT NULL DEFAULT 1,
      current_tick INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      profit_loss REAL NOT NULL DEFAULT 0,
      is_demo INTEGER NOT NULL DEFAULT 1,
      selected_digit INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT,
      balance_after REAL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      position_id TEXT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      balance_after REAL NOT NULL,
      description TEXT NOT NULL,
      asset TEXT,
      direction TEXT,
      trade_type TEXT,
      position_stake REAL,
      profit_loss REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      method TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'pending',
      reference TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      method TEXT NOT NULL,
      amount REAL NOT NULL,
      wallet_address TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS referral_commissions (
      id TEXT PRIMARY KEY,
      referrer_id TEXT NOT NULL,
      referred_user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'open',
      last_message_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT,
      sender_type TEXT NOT NULL,
      message TEXT,
      image_url TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auto_trading_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      mode TEXT NOT NULL DEFAULT 'manual',
      direction TEXT NOT NULL,
      original_stake REAL NOT NULL,
      current_stake REAL NOT NULL,
      target_profit REAL,
      target_loss REAL,
      loss_multiple REAL NOT NULL DEFAULT 1,
      asset TEXT NOT NULL,
      is_demo INTEGER NOT NULL,
      session_pl REAL NOT NULL DEFAULT 0,
      waiting_for_close INTEGER NOT NULL DEFAULT 0,
      is_processing INTEGER NOT NULL DEFAULT 0,
      has_open_position INTEGER NOT NULL DEFAULT 0,
      selected_digit INTEGER,
      trade_type TEXT NOT NULL DEFAULT 'over_under',
      stop_reason TEXT,
      trades_count INTEGER NOT NULL DEFAULT 0,
      wins_count INTEGER NOT NULL DEFAULT 0,
      losses_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      stopped_at TEXT
    );

    CREATE TABLE IF NOT EXISTS market_ticks (
      id TEXT PRIMARY KEY,
      asset TEXT NOT NULL,
      price REAL NOT NULL,
      last_digit INTEGER NOT NULL,
      sequence INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exchange_assets (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      precision INTEGER NOT NULL DEFAULT 8,
      enabled INTEGER NOT NULL DEFAULT 1,
      withdraw_enabled INTEGER NOT NULL DEFAULT 0,
      min_withdraw REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exchange_networks (
      id TEXT PRIMARY KEY,
      asset_symbol TEXT NOT NULL,
      network TEXT NOT NULL,
      chain_name TEXT NOT NULL,
      testnet INTEGER NOT NULL DEFAULT 1,
      deposit_enabled INTEGER NOT NULL DEFAULT 1,
      withdraw_enabled INTEGER NOT NULL DEFAULT 0,
      fee REAL NOT NULL DEFAULT 0,
      min_withdraw REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(asset_symbol, network)
    );

    CREATE TABLE IF NOT EXISTS crypto_balances (
      user_id TEXT NOT NULL,
      asset_symbol TEXT NOT NULL,
      account_type TEXT NOT NULL DEFAULT 'spot',
      available REAL NOT NULL DEFAULT 0,
      locked REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, asset_symbol, account_type)
    );

    CREATE TABLE IF NOT EXISTS wallet_addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      asset_symbol TEXT NOT NULL,
      network TEXT NOT NULL,
      address TEXT NOT NULL,
      encrypted_private_key TEXT NOT NULL,
      testnet INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, asset_symbol, network)
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      asset_symbol TEXT NOT NULL,
      account_type TEXT NOT NULL DEFAULT 'spot',
      amount REAL NOT NULL,
      balance_after REAL NOT NULL,
      locked_after REAL NOT NULL DEFAULT 0,
      type TEXT NOT NULL,
      reference_id TEXT,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exchange_markets (
      symbol TEXT PRIMARY KEY,
      base_asset TEXT NOT NULL,
      quote_asset TEXT NOT NULL,
      price_precision INTEGER NOT NULL DEFAULT 2,
      quantity_precision INTEGER NOT NULL DEFAULT 6,
      min_notional REAL NOT NULL DEFAULT 5,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exchange_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      market_symbol TEXT NOT NULL,
      account_type TEXT NOT NULL DEFAULT 'spot',
      side TEXT NOT NULL,
      type TEXT NOT NULL,
      price REAL,
      quantity REAL NOT NULL,
      filled_quantity REAL NOT NULL DEFAULT 0,
      average_price REAL,
      status TEXT NOT NULL DEFAULT 'open',
      fee_asset TEXT,
      fee_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exchange_trades (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      market_symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      price REAL NOT NULL,
      quantity REAL NOT NULL,
      fee_asset TEXT NOT NULL,
      fee_amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS futures_positions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      market_symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      margin REAL NOT NULL,
      leverage INTEGER NOT NULL,
      quantity REAL NOT NULL,
      entry_price REAL NOT NULL,
      mark_price REAL NOT NULL,
      liquidation_price REAL NOT NULL,
      unrealized_pnl REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS p2p_ads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      side TEXT NOT NULL,
      asset_symbol TEXT NOT NULL,
      fiat_currency TEXT NOT NULL DEFAULT 'KES',
      price REAL NOT NULL,
      available_amount REAL NOT NULL,
      min_limit REAL NOT NULL,
      max_limit REAL NOT NULL,
      payment_methods TEXT NOT NULL,
      terms TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS p2p_orders (
      id TEXT PRIMARY KEY,
      ad_id TEXT NOT NULL,
      buyer_id TEXT NOT NULL,
      seller_id TEXT NOT NULL,
      asset_symbol TEXT NOT NULL,
      fiat_currency TEXT NOT NULL,
      asset_amount REAL NOT NULL,
      fiat_amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'escrow_locked',
      payment_reference TEXT,
      proof_note TEXT,
      dispute_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paid_at TEXT,
      released_at TEXT,
      disputed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS p2p_messages (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS kyc_submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'basic',
      status TEXT NOT NULL DEFAULT 'submitted',
      full_name TEXT NOT NULL,
      document_type TEXT NOT NULL,
      document_number TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'KE',
      notes TEXT,
      admin_notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      actor_type TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  addColumnIfMissing("deposits", "provider_reference", "TEXT");
  addColumnIfMissing("deposits", "checkout_url", "TEXT");
  addColumnIfMissing("deposits", "phone", "TEXT");
  addColumnIfMissing("deposits", "admin_notes", "TEXT");
  addColumnIfMissing("deposits", "reviewed_at", "TEXT");
  addColumnIfMissing("deposits", "is_demo", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("deposits", "provider_event_id", "TEXT");
  addColumnIfMissing("deposits", "provider_status", "TEXT");
  addColumnIfMissing("deposits", "callback_payload", "TEXT");
  addColumnIfMissing("deposits", "failure_reason", "TEXT");
  addColumnIfMissing("withdrawals", "admin_notes", "TEXT");
  addColumnIfMissing("withdrawals", "reviewed_at", "TEXT");
  addColumnIfMissing("withdrawals", "reference", "TEXT");
  addColumnIfMissing("withdrawals", "is_demo", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("withdrawals", "reviewed_by", "TEXT");
  addColumnIfMissing("auto_trading_sessions", "strategy", "TEXT NOT NULL DEFAULT 'smart'");
  addColumnIfMissing("auto_trading_sessions", "max_trades", "INTEGER NOT NULL DEFAULT 25");
  addColumnIfMissing("auto_trading_sessions", "duration_ticks", "INTEGER NOT NULL DEFAULT 5");
  addColumnIfMissing("auto_trading_sessions", "leverage", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing("users", "kyc_status", "TEXT NOT NULL DEFAULT 'unverified'");
  addColumnIfMissing("p2p_orders", "cancelled_at", "TEXT");
  addColumnIfMissing("p2p_orders", "expires_at", "TEXT");
  addColumnIfMissing("p2p_orders", "resolved_at", "TEXT");
  addColumnIfMissing("p2p_orders", "resolved_by", "TEXT");
  addColumnIfMissing("p2p_orders", "resolution", "TEXT");
  addColumnIfMissing("p2p_orders", "admin_notes", "TEXT");
  addColumnIfMissing("p2p_orders", "fee_amount", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("p2p_orders", "fee_asset", "TEXT");

  seedAdmin();
  seedAppSettings();
  seedExchange();
}

function addColumnIfMissing(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seedAppSettings() {
  const defaults: Record<string, string> = {
    "payments.mode": process.env.PAYMENTS_MODE === "live" ? "live" : "sandbox",
    "payments.currency": "KES",
    "payments.usdKesRate": "129.09",
    "payments.minDeposit": "1",
    "payments.minWithdrawal": "1",
    "payments.withdrawalReview": "true",
    "mpesa.enabled": "true",
    "mpesa.environment": "sandbox",
    "mpesa.shortCode": "174379",
    "mpesa.transactionType": "CustomerPayBillOnline",
    "mpesa.accountReference": "Hydra Trade",
    "mpesa.consumerKey": process.env.MPESA_CONSUMER_KEY ?? "",
    "mpesa.consumerSecret": process.env.MPESA_CONSUMER_SECRET ?? "",
    "mpesa.passkey": process.env.MPESA_PASSKEY ?? "",
    "mpesa.callbackUrl": `${config.appUrl}/api/auth/mpesa/callback`,
    "paystack.enabled": "true",
    "paystack.publicKey": process.env.PAYSTACK_PUBLIC_KEY ?? "",
    "paystack.secretKey": process.env.PAYSTACK_SECRET_KEY ?? "",
    "paystack.currency": "KES",
    "paystack.callbackUrl": `${config.appUrl}/trade`,
    "risk.maxStake": "500",
    "risk.maxOpenPositions": "10",
    "risk.maxBotSessions": "1",
    "risk.dailyWithdrawalLimit": "1000",
    "risk.maxWithdrawal": "5000",
    "escrow.bitcoinAddress": process.env.SYSTEM_ESCROW_BTC_ADDRESS ?? "bitcoin:BC1Q2JYAXPRTDMWVGY6E6YKX2E9K9RYSRG68DZ528W",
    "escrow.winPayoutPercent": "10",
  };
  const insert = db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)");
  Object.entries(defaults).forEach(([key, value]) => insert.run(key, value));
}

function seedExchange() {
  const assetStmt = db.prepare("INSERT OR IGNORE INTO exchange_assets (symbol, name, precision, enabled, withdraw_enabled, min_withdraw) VALUES (?, ?, ?, 1, ?, ?)");
  [
    ["USDT", "Tether USD", 6, 0, 5],
    ["BTC", "Bitcoin", 8, 0, 0.0002],
    ["ETH", "Ethereum", 8, 0, 0.005],
  ].forEach((asset) => assetStmt.run(...asset));

  const networkStmt = db.prepare("INSERT OR IGNORE INTO exchange_networks (id, asset_symbol, network, chain_name, testnet, deposit_enabled, withdraw_enabled, fee, min_withdraw) VALUES (?, ?, ?, ?, 1, 1, 0, ?, ?)");
  [
    ["USDT", "TRC20", "Tron Nile Testnet", 1, 5],
    ["USDT", "ERC20", "Ethereum Sepolia", 3, 10],
    ["BTC", "BTC", "Bitcoin Testnet", 0.00005, 0.0002],
    ["ETH", "ETH", "Ethereum Sepolia", 0.001, 0.005],
  ].forEach(([asset, network, chain, fee, min]) => networkStmt.run(randomUUID(), asset, network, chain, fee, min));

  const marketStmt = db.prepare("INSERT OR IGNORE INTO exchange_markets (symbol, base_asset, quote_asset, price_precision, quantity_precision, min_notional, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)");
  [
    ["BTCUSDT", "BTC", "USDT", 2, 6, 5],
    ["ETHUSDT", "ETH", "USDT", 2, 5, 5],
    ["BNBUSDT", "BNB", "USDT", 2, 4, 5],
  ].forEach((market) => marketStmt.run(...market));
}

export function seedAdmin() {
  const existing = db.prepare("SELECT id FROM admins WHERE email = ?").get(config.adminEmail);
  if (existing) return;
  db.prepare("INSERT INTO admins (id, email, name, password_hash) VALUES (?, ?, ?, ?)").run(
    randomUUID(),
    config.adminEmail,
    config.adminName,
    hashPassword(config.adminPassword),
  );
}

export function referralCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export function trc20Address() {
  return `T${randomBytes(17).toString("hex").slice(0, 33)}`;
}

export function signToken(payload: Record<string, unknown>, expiresInSeconds = 86_400): string {
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const signature = createHmac("sha256", config.jwtSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyToken<T extends Record<string, unknown>>(token: string | null | undefined): T | null {
  if (!token) return null;
  const [encoded, signature] = token.replace(/^Bearer\s+/i, "").split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", config.jwtSecret).update(encoded).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T & { exp?: number };
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function publicUser(user: User) {
  const active = user.is_demo ? user.demo_balance : user.real_balance;
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    balance: active.toFixed(2),
    real_balance: user.real_balance,
    demo_balance: user.demo_balance,
    is_demo: Boolean(user.is_demo),
    is_admin: Boolean(user.is_admin),
    two_factor_enabled: Boolean(user.two_factor_enabled),
    mpesa_phone: user.mpesa_phone,
    mpesa_phone_verified: Boolean(user.mpesa_phone_verified),
    active_balance: active,
    referral_code: user.referral_code,
    kyc_status: user.kyc_status ?? "unverified",
  };
}

export function getUserById(id: string): User | null {
  return (db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined) ?? null;
}

export function getUserByEmail(email: string): User | null {
  return (db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email) as User | undefined) ?? null;
}

function restoreEphemeralUserFromToken(payload: { id: string; email?: string; username?: string }): User | null {
  if (!process.env.NETLIFY && !config.databasePath.startsWith("/tmp/")) return null;
  const email = String(payload.email ?? `trader-${payload.id}@hydra.local`).trim().toLowerCase();
  const username = String(payload.username ?? email.split("@")[0] ?? "Trader").trim() || "Trader";
  db.prepare(`
    INSERT OR IGNORE INTO users (id, email, username, password_hash, balance, real_balance, demo_balance, is_demo, referral_code, trc20_address)
    VALUES (?, ?, ?, ?, 10000, 0, 10000, 1, ?, ?)
  `).run(payload.id, email, username, hashPassword(randomUUID()), referralCode(), trc20Address());
  return getUserById(payload.id);
}

export function requireUserFromHeader(authorization: string | null): User {
  const payload = verifyToken<{ id: string; email?: string; username?: string; kind: string }>(authorization);
  if (!payload?.id || payload.kind !== "user") throw new Error("Unauthorized");
  const user = getUserById(payload.id) ?? restoreEphemeralUserFromToken(payload);
  if (!user) throw new Error("Unauthorized");
  return user;
}

export function money(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

if (process.env.npm_lifecycle_event !== "build") {
  migrate();
}
