import { beforeAll, describe, expect, it } from "vitest";
import { config } from "../lib/config";
import { db, hashPassword, migrate, publicUser, referralCode, seedAdmin, trc20Address, verifyPassword, type User } from "../lib/db";
import { market } from "../lib/market";
import { calculateEscrowSplit, createManualTrade, maybeCreateAutoTrade, settleOpenPositions, startAutoSession } from "../lib/repositories";
import { assets, chooseSmartDigitContract, forexAssets, isForexAsset, payoutMultiplier, potentialPayout, pricePrecisionForAsset, resolveDigitTrade, type Direction } from "../lib/trading";

function createTradingUser(label: string): User {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO users (id, email, username, password_hash, balance, real_balance, demo_balance, is_demo, referral_code, trc20_address, kyc_status)
    VALUES (?, ?, ?, ?, 1000, 1000, 10000, 0, ?, ?, 'approved')
  `).run(id, `${label}-${id}@example.test`, label, hashPassword("password123"), referralCode(), trc20Address());
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
}

function createDemoTradingUser(label: string): User {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO users (id, email, username, password_hash, balance, real_balance, demo_balance, is_demo, referral_code, trc20_address, kyc_status)
    VALUES (?, ?, ?, ?, 1000, 0, 1000, 1, ?, ?, 'approved')
  `).run(id, `${label}-${id}@example.test`, label, hashPassword("password123"), referralCode(), trc20Address());
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
}

describe("trading math", () => {
  beforeAll(() => {
    migrate();
  });

  it("syncs the configured admin login on migration", () => {
    const admin = db.prepare("SELECT * FROM admins WHERE lower(email) = lower(?)").get(config.adminEmail) as { id: string; password_hash: string };
    db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(hashPassword("old-admin-password"), admin.id);

    seedAdmin();

    const fresh = db.prepare("SELECT * FROM admins WHERE id = ?").get(admin.id) as { password_hash: string };
    expect(verifyPassword(config.adminPassword, fresh.password_hash)).toBe(true);
  });

  it("marks generated demo sessions without treating registered demo mode as temporary", () => {
    const registered = createTradingUser("registered-demo-mode");
    db.prepare("UPDATE users SET is_demo = 1, balance = demo_balance WHERE id = ?").run(registered.id);
    const registeredDemoMode = db.prepare("SELECT * FROM users WHERE id = ?").get(registered.id) as User;

    const temporaryDemo = createDemoTradingUser("temporary-demo");
    db.prepare("UPDATE users SET email = ?, username = 'Demo Trader' WHERE id = ?").run(`demo-${temporaryDemo.id}@tagoption.local`, temporaryDemo.id);
    const temporaryDemoSession = db.prepare("SELECT * FROM users WHERE id = ?").get(temporaryDemo.id) as User;

    expect((publicUser(registeredDemoMode) as Record<string, unknown>).is_temporary_demo).toBe(false);
    expect((publicUser(temporaryDemoSession) as Record<string, unknown>).is_temporary_demo).toBe(true);
  });

  it("calculates over and under payouts from selected digit", () => {
    expect(potentialPayout(25, "over", 5)).toBe(59.38);
    expect(potentialPayout(25, "under", 5)).toBe(47.5);
  });

  it("returns zero for impossible over or under bets", () => {
    expect(payoutMultiplier("over", 9)).toBe(0);
    expect(payoutMultiplier("under", 0)).toBe(0);
  });

  it("resolves digit contracts", () => {
    expect(resolveDigitTrade("over", 5, 7)).toBe(true);
    expect(resolveDigitTrade("under", 5, 7)).toBe(false);
    expect(resolveDigitTrade("match", 5, 5)).toBe(true);
    expect(resolveDigitTrade("differ", 5, 5)).toBe(false);
    expect(resolveDigitTrade("even", 5, 8)).toBe(true);
    expect(resolveDigitTrade("odd", 5, 8)).toBe(false);
  });

  it("calculates even and odd payouts", () => {
    expect(potentialPayout(10, "even")).toBe(19.52);
    expect(potentialPayout(10, "odd")).toBe(19.52);
  });

  it("splits winning payouts into user net and system escrow", () => {
    expect(calculateEscrowSplit(180, 10)).toEqual({ escrowFee: 18, netPayout: 162 });
    expect(calculateEscrowSplit(99.99, 10)).toEqual({ escrowFee: 10, netPayout: 89.99 });
    expect(calculateEscrowSplit(10.55, 10, 0.55)).toEqual({ escrowFee: 0.06, netPayout: 10.49 });
  });

  it("settles wins with a balanced gross payout and escrow fee ledger", () => {
    const user = createTradingUser("ledger-win");
    const position = createManualTrade(user, {
      asset: "volatility_10_1s",
      direction: "over",
      stake: 25,
      selectedDigit: 5,
      isDemo: false,
      durationTicks: 1,
    }, {
      asset: "volatility_10_1s",
      price: 100,
      lastDigit: 5,
      sequence: 1,
      timestamp: new Date(2026, 0, 1, 0, 0, 0).toISOString(),
    }) as Record<string, unknown>;

    expect(position.potential_payout).toBe(59.38);

    const [closed] = settleOpenPositions(user.id, "volatility_10_1s", {
      asset: "volatility_10_1s",
      price: 101,
      lastDigit: 7,
      sequence: 2,
      timestamp: new Date(2026, 0, 1, 0, 0, 1).toISOString(),
    });

    expect(closed).toMatchObject({ status: "won", profit_loss: 30.94, balance_after: 1030.94 });
    const transactions = db.prepare("SELECT type, amount FROM transactions WHERE user_id = ?").all(user.id) as Array<{ type: string; amount: number }>;
    expect(transactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "stake", amount: -25 }),
      expect.objectContaining({ type: "payout", amount: 59.38 }),
      expect.objectContaining({ type: "system_escrow_fee", amount: -3.44 }),
    ]));
    const amountSum = transactions.reduce((sum, transaction) => Math.round((sum + transaction.amount) * 100) / 100, 0);
    expect(amountSum).toBe(30.94);
  });

  it("does not apply system escrow to demo wins", () => {
    const user = createDemoTradingUser("demo-ledger-win");
    createManualTrade(user, {
      asset: "volatility_10_1s",
      direction: "over",
      stake: 25,
      selectedDigit: 5,
      isDemo: true,
      durationTicks: 1,
    }, {
      asset: "volatility_10_1s",
      price: 100,
      lastDigit: 5,
      sequence: 1,
      timestamp: new Date(2026, 0, 1, 0, 0, 0).toISOString(),
    });

    const [closed] = settleOpenPositions(user.id, "volatility_10_1s", {
      asset: "volatility_10_1s",
      price: 101,
      lastDigit: 7,
      sequence: 2,
      timestamp: new Date(2026, 0, 1, 0, 0, 1).toISOString(),
    });

    expect(closed).toMatchObject({ status: "won", profit_loss: 34.38, balance_after: 1034.38 });
    const transactions = db.prepare("SELECT type, amount FROM transactions WHERE user_id = ?").all(user.id) as Array<{ type: string; amount: number }>;
    expect(transactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "stake", amount: -25 }),
      expect.objectContaining({ type: "payout", amount: 59.38 }),
    ]));
    expect(transactions.some((transaction) => transaction.type === "system_escrow_fee")).toBe(false);
    const amountSum = transactions.reduce((sum, transaction) => Math.round((sum + transaction.amount) * 100) / 100, 0);
    expect(amountSum).toBe(34.38);
  });

  it("keeps low-payout differ wins profitable after escrow and rejects invalid trade input", () => {
    const user = createTradingUser("differ-win");
    createManualTrade(user, {
      asset: "volatility_10_1s",
      direction: "differ",
      stake: 10,
      selectedDigit: 5,
      isDemo: false,
      durationTicks: 1,
    }, {
      asset: "volatility_10_1s",
      price: 100,
      lastDigit: 5,
      sequence: 1,
      timestamp: new Date(2026, 0, 1, 0, 0, 0).toISOString(),
    });

    const [closed] = settleOpenPositions(user.id, "volatility_10_1s", {
      asset: "volatility_10_1s",
      price: 101,
      lastDigit: 7,
      sequence: 2,
      timestamp: new Date(2026, 0, 1, 0, 0, 1).toISOString(),
    });

    expect(closed).toMatchObject({ status: "won", profit_loss: 0.49, balance_after: 1000.49 });
    expect(() => createManualTrade(user, {
      asset: "volatility_10_1s",
      direction: "differ",
      stake: 10,
      selectedDigit: 99,
      isDemo: false,
      durationTicks: 1,
    }, {
      asset: "volatility_10_1s",
      price: 100,
      lastDigit: 5,
      sequence: 1,
      timestamp: new Date(2026, 0, 1, 0, 0, 0).toISOString(),
    })).toThrow("Selected digit");
    expect(() => createManualTrade(user, {
      asset: "volatility_10_1s",
      direction: "sideways" as Direction,
      stake: 10,
      selectedDigit: 5,
      isDemo: false,
      durationTicks: 1,
    }, {
      asset: "volatility_10_1s",
      price: 100,
      lastDigit: 5,
      sequence: 1,
      timestamp: new Date(2026, 0, 1, 0, 0, 0).toISOString(),
    })).toThrow("Unsupported trade direction");
  });

  it("replaces an active real auto session and keeps even/odd trade metadata", () => {
    const user = createTradingUser("auto-session");
    const firstSession = startAutoSession(user, {
      asset: "volatility_10_1s",
      direction: "even",
      stake: 10,
      isDemo: false,
      selectedDigit: 5,
    });
    expect(firstSession).toMatchObject({ active: true, direction: "even", tradeType: "even_odd", strategy: "smart" });

    const replacementSession = startAutoSession(user, {
      asset: "volatility_10_1s",
      direction: "odd",
      stake: 10,
      isDemo: false,
      selectedDigit: 5,
    });
    expect(replacementSession).toMatchObject({ active: true, direction: "odd", tradeType: "even_odd", strategy: "smart" });
  });

  it("chooses a smart contract from recent digit edge", () => {
    const history = [
      ...Array.from({ length: 110 }, (_, index) => ({ price: 100 + index / 100, lastDigit: 7 })),
      ...Array.from({ length: 20 }, (_, index) => ({ price: 101 + index / 100, lastDigit: index % 10 })),
    ];
    const decision = chooseSmartDigitContract({ history, lastDigit: 7, movement: 0.3 });

    expect(decision.direction).toBe("match");
    expect(decision.selectedDigit).toBe(7);
    expect(decision.edge).toBeGreaterThan(0);
  });

  it("auto smart strategy opens the dynamically selected contract", () => {
    const user = createTradingUser("smart-auto");
    startAutoSession(user, {
      asset: "volatility_10_1s",
      direction: "even",
      stake: 10,
      isDemo: false,
      selectedDigit: 5,
      strategy: "smart",
      durationTicks: 15,
    });

    const history = [
      ...Array.from({ length: 120 }, (_, index) => ({ price: 100 + index / 100, sequence: index, timestamp: new Date(2026, 0, 1, 0, 0, index).toISOString(), lastDigit: 7 })),
      ...Array.from({ length: 20 }, (_, index) => ({ price: 101 + index / 100, sequence: index + 120, timestamp: new Date(2026, 0, 1, 0, 2, index).toISOString(), lastDigit: index % 10 })),
    ];
    const position = maybeCreateAutoTrade(user.id, {
      asset: "volatility_10_1s",
      price: 102,
      lastDigit: 7,
      sequence: 200,
      timestamp: new Date(2026, 0, 1, 0, 3, 0).toISOString(),
      history,
      movement: 0.4,
    }) as Record<string, unknown>;

    expect(position.direction).toBe("match");
    expect(position.selected_digit).toBe(7);
    expect(position.ticks).toBe(15);
  });

  it("forex auto opens Buy or Sell price contracts with leverage", () => {
    const user = createTradingUser("forex-auto");
    const session = startAutoSession(user, {
      asset: "eur_usd",
      direction: "over",
      stake: 10,
      isDemo: false,
      contractMode: "forex",
      leverage: 20,
      strategy: "forex_trend",
      durationTicks: 30,
    });

    expect(session).toMatchObject({ active: true, direction: "over", tradeType: "forex", leverage: 20 });

    const position = maybeCreateAutoTrade(user.id, {
      asset: "eur_usd",
      price: 1.08765,
      lastDigit: 5,
      sequence: 1,
      timestamp: new Date(2026, 0, 1, 0, 0, 0).toISOString(),
      movement: 0.1,
    }) as Record<string, unknown>;

    expect(position.trade_type).toBe("forex");
    expect(position.direction).toBe("over");
    expect(position.potential_payout).toBe(170);
    expect(position.ticks).toBe(30);
  });

  it("lists XAU/USD as a forex-style market with 2-decimal pricing", () => {
    expect(assets).toContain("xau_usd");
    expect(forexAssets).toContain("xau_usd");
    expect(isForexAsset("xau_usd")).toBe(true);
    expect(pricePrecisionForAsset("xau_usd")).toBe(2);
    expect(pricePrecisionForAsset("usd_jpy")).toBe(3);
    expect(pricePrecisionForAsset("eur_usd")).toBe(5);

    const tick = market.current("xau_usd");
    const decimalPlaces = String(tick.price).split(".")[1]?.length ?? 0;

    expect(tick.asset).toBe("xau_usd");
    expect(tick.price).toBeGreaterThan(1000);
    expect(decimalPlaces).toBeLessThanOrEqual(2);
  });

  it("supports XAU/USD manual Buy and Sell price contracts", () => {
    const user = createTradingUser("xau-manual");
    const position = createManualTrade(user, {
      asset: "xau_usd",
      direction: "over",
      stake: 10,
      isDemo: false,
      contractMode: "forex",
      leverage: 10,
      durationTicks: 12,
    }, {
      asset: "xau_usd",
      price: 2365.25,
      lastDigit: 5,
      sequence: 1,
      timestamp: new Date(2026, 0, 1, 0, 0, 0).toISOString(),
      movement: 1.2,
    }) as Record<string, unknown>;

    expect(position.asset).toBe("xau_usd");
    expect(position.trade_type).toBe("forex");
    expect(position.direction).toBe("over");
    expect(position.potential_payout).toBe(90);
    expect(position.ticks).toBe(12);
  });

  it("supports XAU/USD auto trading sessions", () => {
    const user = createTradingUser("xau-auto");
    const session = startAutoSession(user, {
      asset: "xau_usd",
      direction: "under",
      stake: 10,
      isDemo: false,
      contractMode: "forex",
      leverage: 10,
      strategy: "forex_trend",
      durationTicks: 20,
    });

    expect(session).toMatchObject({ active: true, asset: "xau_usd", direction: "under", tradeType: "forex", leverage: 10 });

    const position = maybeCreateAutoTrade(user.id, {
      asset: "xau_usd",
      price: 2364.8,
      lastDigit: 8,
      sequence: 1,
      timestamp: new Date(2026, 0, 1, 0, 0, 0).toISOString(),
      movement: -1.1,
    }) as Record<string, unknown>;

    expect(position.asset).toBe("xau_usd");
    expect(position.trade_type).toBe("forex");
    expect(position.direction).toBe("under");
    expect(position.potential_payout).toBe(90);
    expect(position.ticks).toBe(20);
  });
});
