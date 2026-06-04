import { randomUUID } from "node:crypto";
import { db } from "./db";
import { assets, isForexAsset, pricePrecisionForAsset } from "./trading";
import type { Tick } from "./repositories";

type Listener = (tick: Tick) => void;

class SyntheticMarket {
  private prices = new Map<string, number>();
  private sequence = new Map<string, number>();
  private history = new Map<string, Tick[]>();
  private trend = new Map<string, number>();
  private listeners = new Set<Listener>();
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    assets.forEach((asset, index) => {
      const profile = marketProfile(asset);
      this.prices.set(asset, profile.anchor + (Math.random() - 0.5) * profile.volatility * 8);
      this.sequence.set(asset, 0);
      this.history.set(asset, []);
      this.trend.set(asset, 0);
    });
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      for (const asset of assets) this.nextTick(asset);
    }, 1000);
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  current(asset: string) {
    return this.nextTick(asset, false);
  }

  private nextTick(asset: string, persist = true): Tick {
    const previous = this.prices.get(asset) ?? 9500;
    const profile = marketProfile(asset);
    const oldTrend = this.trend.get(asset) ?? 0;
    const meanReversion = (profile.anchor - previous) * profile.reversion;
    const volatilityShock = gaussianRandom() * profile.volatility;
    const microMove = (Math.random() - 0.5) * profile.microNoise;
    const regimeShift = Math.random() < profile.regimeChance ? (Math.random() - 0.5) * profile.volatility * 0.8 : 0;
    const nextTrend = oldTrend * profile.persistence + volatilityShock * 0.18 + regimeShift;
    const precision = 10 ** pricePrecisionForAsset(asset);
    const minPrice = isForexAsset(asset) ? asset === "xau_usd" ? 100 : 0.0001 : 100;
    const price = Math.max(minPrice, Math.round((previous + nextTrend + meanReversion + microMove) * precision) / precision);
    const sequence = (this.sequence.get(asset) ?? 0) + 1;
    const lastDigit = Number(String(price.toFixed(2)).replace(".", "").slice(-1));
    const timestamp = new Date().toISOString();
    const prior = this.history.get(asset) ?? [];
    const history = [...prior, { asset, price, lastDigit, sequence, timestamp }].slice(-1800);
    const digitStats = Array.from({ length: 10 }).reduce<Record<string, number>>((acc, _, digit) => {
      acc[digit] = 0;
      return acc;
    }, {});
    history.forEach((item) => {
      digitStats[item.lastDigit] = (digitStats[item.lastDigit] ?? 0) + 1;
    });
    const tick: Tick = {
      asset,
      price,
      lastDigit,
      sequence,
      timestamp,
      history: history.map(({ price, timestamp, sequence, lastDigit }) => ({ price, timestamp, sequence, lastDigit })),
      digitStats,
      movement: moneyLike(price - previous),
      volatility: profile.displayVolatility,
    };

    this.prices.set(asset, price);
    this.sequence.set(asset, sequence);
    this.history.set(asset, history);
    this.trend.set(asset, nextTrend);

    if (persist) {
      db.prepare("INSERT INTO market_ticks (id, asset, price, last_digit, sequence) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), asset, price, lastDigit, sequence);
      this.listeners.forEach((listener) => listener(tick));
    }
    return tick;
  }
}

function marketProfile(asset: string) {
  const forexAnchors: Record<string, { anchor: number; volatility: number; displayVolatility?: number }> = {
    eur_usd: { anchor: 1.085, volatility: 0.0018 },
    gbp_usd: { anchor: 1.272, volatility: 0.0022 },
    usd_jpy: { anchor: 156.4, volatility: 0.18 },
    aud_usd: { anchor: 0.664, volatility: 0.0016 },
    usd_cad: { anchor: 1.366, volatility: 0.0017 },
    usd_chf: { anchor: 0.912, volatility: 0.0015 },
    xau_usd: { anchor: 2365, volatility: 2.8, displayVolatility: 2.8 },
  };
  const forex = forexAnchors[asset];
  if (forex) {
    return {
      anchor: forex.anchor,
      volatility: forex.volatility,
      microNoise: forex.volatility * 0.4,
      persistence: 0.74,
      reversion: 0.008,
      regimeChance: 0.02,
      displayVolatility: forex.displayVolatility ?? Math.round(forex.volatility * 100000) / 10,
    };
  }

  const index = asset.includes("100") ? 100 : asset.includes("75") ? 75 : asset.includes("50") ? 50 : asset.includes("25") ? 25 : 10;
  const oneSecond = asset.includes("_1s");
  return {
    anchor: 9400 + index * 11,
    volatility: (index / 100) * (oneSecond ? 9.5 : 6.5) + 1.8,
    microNoise: oneSecond ? 3.2 : 1.8,
    persistence: oneSecond ? 0.62 : 0.78,
    reversion: oneSecond ? 0.002 : 0.0035,
    regimeChance: oneSecond ? 0.045 : 0.025,
    displayVolatility: index,
  };
}

function gaussianRandom() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function moneyLike(value: number) {
  return Math.round(value * 100) / 100;
}

const globalForMarket = globalThis as unknown as { tagOptionMarket?: SyntheticMarket };
export const market = globalForMarket.tagOptionMarket ?? new SyntheticMarket();
globalForMarket.tagOptionMarket = market;
