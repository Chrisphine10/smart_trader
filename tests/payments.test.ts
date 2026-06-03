import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db, hashPassword, migrate, referralCode, trc20Address, type User } from "../lib/db";
import { ensureCryptoAddress, listCryptoNetworks, recordManualCryptoDeposit, reviewDeposit, submitWithdrawal, updateAppSettings } from "../lib/repositories";

function createPaymentUser(label: string, balance = 100): User {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO users (id, email, username, password_hash, balance, real_balance, demo_balance, is_demo, referral_code, trc20_address, kyc_status)
    VALUES (?, ?, ?, ?, ?, ?, 10000, 0, ?, ?, 'approved')
  `).run(id, `${label}-${id}@example.test`, label, hashPassword("password123"), balance, balance, referralCode(), trc20Address());
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
}

function setNetwork(assetSymbol: string, network: string, depositEnabled: boolean, withdrawEnabled: boolean) {
  db.prepare(`
    UPDATE exchange_networks
    SET deposit_enabled = ?, withdraw_enabled = ?
    WHERE asset_symbol = ? AND network = ?
  `).run(depositEnabled ? 1 : 0, withdrawEnabled ? 1 : 0, assetSymbol, network);
}

describe("web3 payment rails", () => {
  beforeAll(() => {
    migrate();
    updateAppSettings({ "trc20.enabled": "true", "trc20.withdrawals.enabled": "true" });
    [
      ["USDT", "TRC20"],
      ["USDT", "ERC20"],
      ["USDC", "ERC20"],
      ["BTC", "BTC"],
      ["ETH", "ETH"],
      ["BNB", "BSC"],
      ["SOL", "SOL"],
      ["XRP", "XRP"],
      ["LTC", "LTC"],
      ["DOGE", "DOGE"],
    ].forEach(([asset, network]) => setNetwork(asset, network, true, true));
  });

  it("lists seeded crypto networks while preserving legacy TRC20 availability", () => {
    const networks = listCryptoNetworks();
    const keys = networks.map((item) => `${item.assetSymbol}:${item.network}`);

    expect(keys).toEqual(expect.arrayContaining(["USDT:TRC20", "USDT:ERC20", "USDC:ERC20", "BTC:BTC", "ETH:ETH", "BNB:BSC", "SOL:SOL", "XRP:XRP", "LTC:LTC", "DOGE:DOGE"]));
    expect(networks.find((item) => item.assetSymbol === "USDT" && item.network === "TRC20")).toMatchObject({
      assetName: "Tether USD",
      chainName: "Tron Nile Testnet",
      depositEnabled: true,
      withdrawEnabled: true,
      testnet: true,
    });
  });

  it("creates and reuses addresses for supported Web3 payment networks", () => {
    const user = createPaymentUser("crypto-address");
    const trc20 = ensureCryptoAddress(user, "USDT", "TRC20");
    const erc20 = ensureCryptoAddress(user, "USDT", "ERC20");
    const usdc = ensureCryptoAddress(user, "USDC", "ERC20");
    const btc = ensureCryptoAddress(user, "BTC", "BTC");
    const eth = ensureCryptoAddress(user, "ETH", "ETH");
    const bnb = ensureCryptoAddress(user, "BNB", "BSC");
    const sol = ensureCryptoAddress(user, "SOL", "SOL");
    const xrp = ensureCryptoAddress(user, "XRP", "XRP");
    const ltc = ensureCryptoAddress(user, "LTC", "LTC");
    const doge = ensureCryptoAddress(user, "DOGE", "DOGE");

    expect(trc20.address).toBe(user.trc20_address);
    expect(erc20.address).toMatch(/^0x[a-f0-9]{40}$/);
    expect(usdc.address).toMatch(/^0x[a-f0-9]{40}$/);
    expect(btc.address).toMatch(/^tb1q[a-f0-9]{38}$/);
    expect(eth.address).toMatch(/^0x[a-f0-9]{40}$/);
    expect(bnb.address).toMatch(/^0x[a-f0-9]{40}$/);
    expect(sol.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{44}$/);
    expect(xrp.address).toMatch(/^r[1-9A-HJ-NP-Za-km-z]{33}$/);
    expect(ltc.address).toMatch(/^tltc1q[a-f0-9]{38}$/);
    expect(doge.address).toMatch(/^n[1-9A-HJ-NP-Za-km-z]{33}$/);
    expect(ensureCryptoAddress(user, "USDT", "ERC20").address).toBe(erc20.address);
  });

  it("creates manual crypto deposits that admins can approve", () => {
    const user = createPaymentUser("crypto-deposit", 0);
    const result = recordManualCryptoDeposit(user, {
      amount: 42,
      assetSymbol: "USDT",
      network: "ERC20",
      reference: `0x${randomUUID().replaceAll("-", "")}`,
    });

    expect(result).toMatchObject({ status: "pending", method: "crypto:USDT:ERC20", amount: 42 });
    const pending = db.prepare("SELECT method, status, provider_status FROM deposits WHERE id = ?").get(result.id) as Record<string, unknown>;
    expect(pending).toMatchObject({ method: "crypto:USDT:ERC20", status: "pending", provider_status: "manual_review" });

    reviewDeposit("admin-test", result.id, "approve", "Reference verified");
    const fresh = db.prepare("SELECT real_balance FROM users WHERE id = ?").get(user.id) as { real_balance: number };
    expect(fresh.real_balance).toBe(42);
  });

  it("validates crypto withdrawal network support, availability, limits, and balance updates", () => {
    const user = createPaymentUser("crypto-withdraw", 100);
    setNetwork("ETH", "ETH", true, false);

    expect(() => submitWithdrawal(user, { method: "crypto", assetSymbol: "ETH", network: "ETH", walletAddress: "0x1234567890123456789012345678901234567890" }, 10)).toThrow("withdrawals are disabled");
    expect(() => submitWithdrawal(user, { method: "crypto", assetSymbol: "ADA", network: "ADA", walletAddress: "addr_test1" }, 10)).toThrow("not supported");

    setNetwork("ETH", "ETH", true, true);
    expect(() => submitWithdrawal(user, { method: "crypto", assetSymbol: "ETH", network: "ETH", walletAddress: "0x1234567890123456789012345678901234567890" }, 0.5)).toThrow("Minimum withdrawal");

    const withdrawal = submitWithdrawal(user, { method: "crypto", assetSymbol: "ETH", network: "ETH", walletAddress: "0x1234567890123456789012345678901234567890" }, 10);
    expect(withdrawal).toMatchObject({ status: "pending", amount: 10, balance: 90 });
    const row = db.prepare("SELECT method, wallet_address FROM withdrawals WHERE id = ?").get(withdrawal.id) as Record<string, unknown>;
    expect(row).toMatchObject({ method: "crypto:ETH:ETH", wallet_address: "0x1234567890123456789012345678901234567890" });
  });
});
