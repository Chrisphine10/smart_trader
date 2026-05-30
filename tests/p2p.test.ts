import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db, hashPassword, migrate, referralCode, trc20Address, type User } from "../lib/db";
import { cancelP2POrder, createP2PAd, createP2POrder, disputeP2POrder, getCryptoBalance, markP2PPaid, resolveP2PDispute, releaseP2POrder } from "../lib/repositories";

function createUser(label: string): User {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO users (id, email, username, password_hash, balance, real_balance, demo_balance, is_demo, referral_code, trc20_address, kyc_status)
    VALUES (?, ?, ?, ?, 0, 0, 10000, 0, ?, ?, 'approved')
  `).run(id, `${label}-${id}@example.test`, label, hashPassword("password123"), referralCode(), trc20Address());
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
}

function seedCrypto(userId: string, asset: string, available: number) {
  db.prepare(`
    INSERT INTO crypto_balances (user_id, asset_symbol, account_type, available, locked)
    VALUES (?, ?, 'spot', ?, 0)
    ON CONFLICT(user_id, asset_symbol, account_type) DO UPDATE SET available = excluded.available, locked = excluded.locked
  `).run(userId, asset, available);
}

describe("P2P escrow lifecycle", () => {
  beforeAll(() => {
    migrate();
  });

  it("locks seller crypto when creating sell ads and releases escrow to the buyer once", () => {
    const seller = createUser("seller");
    const buyer = createUser("buyer");
    seedCrypto(seller.id, "USDT", 100);

    const ad = createP2PAd(seller, {
      side: "sell",
      assetSymbol: "USDT",
      fiatCurrency: "KES",
      price: 130,
      availableAmount: 25,
      minLimit: 500,
      maxLimit: 10000,
      paymentMethods: "M-Pesa,Bank Transfer",
    }) as Record<string, any>;

    expect(ad.available_amount).toBe(25);
    expect(getCryptoBalance(seller.id, "USDT")).toMatchObject({ available: 75, locked: 25 });

    const order = createP2POrder(buyer, { adId: String(ad.id), assetAmount: 10, paymentMethod: "M-Pesa" }) as Record<string, any>;
    expect(order.status).toBe("escrow_locked");
    expect(() => markP2PPaid(seller, String(order.id), "WRONG")).toThrow("Only the buyer");

    markP2PPaid(buyer, String(order.id), "MPESA-1", "Paid from test");
    expect(() => markP2PPaid(buyer, String(order.id), "MPESA-2")).toThrow("Only escrow-locked");

    const released = releaseP2POrder(seller, String(order.id)) as Record<string, any>;
    expect(released.status).toBe("released");
    expect(getCryptoBalance(seller.id, "USDT")).toMatchObject({ available: 75, locked: 15 });
    expect(getCryptoBalance(buyer.id, "USDT")).toMatchObject({ available: 10, locked: 0 });
    expect(() => releaseP2POrder(seller, String(order.id))).toThrow("Only payment-sent");
  });

  it("validates order limits, payment method, KYC, and self-trading", () => {
    const maker = createUser("maker");
    const taker = createUser("taker");
    const unverified = createUser("unverified");
    db.prepare("UPDATE users SET kyc_status = 'unverified' WHERE id = ?").run(unverified.id);
    const freshUnverified = db.prepare("SELECT * FROM users WHERE id = ?").get(unverified.id) as User;
    seedCrypto(maker.id, "USDT", 50);

    const ad = createP2PAd(maker, {
      side: "sell",
      assetSymbol: "USDT",
      fiatCurrency: "KES",
      price: 100,
      availableAmount: 20,
      minLimit: 500,
      maxLimit: 1000,
      paymentMethods: "M-Pesa",
    }) as Record<string, any>;

    expect(() => createP2POrder(maker, { adId: String(ad.id), assetAmount: 5, paymentMethod: "M-Pesa" })).toThrow("own P2P ad");
    expect(() => createP2POrder(freshUnverified, { adId: String(ad.id), assetAmount: 5, paymentMethod: "M-Pesa" })).toThrow("KYC approval");
    expect(() => createP2POrder(taker, { adId: String(ad.id), assetAmount: 2, paymentMethod: "M-Pesa" })).toThrow("outside ad limits");
    expect(() => createP2POrder(taker, { adId: String(ad.id), assetAmount: 6, paymentMethod: "Cash" })).toThrow("Payment method");
    expect(() => createP2POrder(taker, { adId: "preview-1", assetAmount: 6, paymentMethod: "M-Pesa" })).toThrow("Preview ads");
  });

  it("cancels unpaid buy-ad orders and unlocks the taker seller balance", () => {
    const buyer = createUser("buy-maker");
    const seller = createUser("sell-taker");
    seedCrypto(seller.id, "USDT", 30);

    const ad = createP2PAd(buyer, {
      side: "buy",
      assetSymbol: "USDT",
      fiatCurrency: "KES",
      price: 100,
      availableAmount: 12,
      minLimit: 100,
      maxLimit: 5000,
      paymentMethods: "Bank Transfer",
    }) as Record<string, any>;

    const order = createP2POrder(seller, { adId: String(ad.id), assetAmount: 5, paymentMethod: "Bank Transfer" }) as Record<string, any>;
    expect(getCryptoBalance(seller.id, "USDT")).toMatchObject({ available: 25, locked: 5 });

    const cancelled = cancelP2POrder(buyer, String(order.id)) as Record<string, any>;
    expect(cancelled.status).toBe("cancelled");
    expect(getCryptoBalance(seller.id, "USDT")).toMatchObject({ available: 30, locked: 0 });
    const restoredAd = db.prepare("SELECT available_amount, status FROM p2p_ads WHERE id = ?").get(String(ad.id)) as Record<string, any>;
    expect(restoredAd).toMatchObject({ available_amount: 12, status: "active" });
    expect(() => cancelP2POrder(buyer, String(order.id))).toThrow("Only unpaid");
  });

  it("lets admins resolve disputes once by refunding seller escrow", () => {
    const seller = createUser("seller-dispute");
    const buyer = createUser("buyer-dispute");
    seedCrypto(seller.id, "USDT", 80);

    const ad = createP2PAd(seller, {
      side: "sell",
      assetSymbol: "USDT",
      fiatCurrency: "KES",
      price: 100,
      availableAmount: 20,
      minLimit: 100,
      maxLimit: 5000,
      paymentMethods: "M-Pesa",
    }) as Record<string, any>;

    const order = createP2POrder(buyer, { adId: String(ad.id), assetAmount: 6, paymentMethod: "M-Pesa" }) as Record<string, any>;
    markP2PPaid(buyer, String(order.id), "MPESA-DISPUTE");
    disputeP2POrder(seller, String(order.id), "Reference not found");

    const resolved = resolveP2PDispute("admin-test", String(order.id), "refund_seller", "Payment not confirmed") as Record<string, any>;
    expect(resolved.status).toBe("refunded");
    expect(resolved.resolution).toBe("admin_refund");
    expect(getCryptoBalance(seller.id, "USDT")).toMatchObject({ available: 66, locked: 14 });
    expect(() => resolveP2PDispute("admin-test", String(order.id), "refund_seller")).toThrow("Only disputed");
  });
});
