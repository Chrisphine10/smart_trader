export type Direction = "over" | "under" | "match" | "differ" | "even" | "odd";

type SmartTick = {
  lastDigit?: number;
  movement?: number;
  digitStats?: Record<string, number>;
  history?: Array<{ price: number; lastDigit?: number }>;
};

export type SmartContractDecision = {
  direction: Direction;
  selectedDigit: number;
  confidence: number;
  edge: number;
  reason: string;
};

export function payoutMultiplier(direction: Direction, selectedDigit = 5): number {
  if (direction === "even" || direction === "odd") return 1.9522;
  if (direction === "match") return 9.5;
  if (direction === "differ") return 1.055;
  if (direction === "over") {
    const winningDigits = 9 - selectedDigit;
    return winningDigits <= 0 ? 0 : (10 / winningDigits) * 0.95;
  }
  const winningDigits = selectedDigit;
  return winningDigits <= 0 ? 0 : (10 / winningDigits) * 0.95;
}

export function potentialPayout(stake: number, direction: Direction, selectedDigit = 5): number {
  return Math.round(stake * payoutMultiplier(direction, selectedDigit) * 100) / 100;
}

export function resolveDigitTrade(direction: Direction, selectedDigit: number, exitDigit: number): boolean {
  if (direction === "even") return exitDigit % 2 === 0;
  if (direction === "odd") return exitDigit % 2 === 1;
  if (direction === "over") return exitDigit > selectedDigit;
  if (direction === "under") return exitDigit < selectedDigit;
  if (direction === "match") return exitDigit === selectedDigit;
  return exitDigit !== selectedDigit;
}

export function chooseSmartDigitContract(tick: SmartTick, fallbackDirection: Direction = "even", fallbackDigit = 5): SmartContractDecision {
  const probabilities = digitProbabilities(tick);
  const momentum = priceMomentum(tick);
  const candidates: SmartContractDecision[] = [];

  function add(direction: Direction, selectedDigit: number, probability: number, reason: string, scoreBias = 0) {
    const multiplier = payoutMultiplier(direction, selectedDigit);
    if (multiplier <= 0) return;
    const breakEven = 1 / multiplier;
    const edge = probability * multiplier - 1;
    const confidence = Math.max(0, Math.min(1, Math.abs(probability - breakEven) * multiplier));
    candidates.push({
      direction,
      selectedDigit,
      confidence,
      edge: Math.round((edge + scoreBias) * 10000) / 10000,
      reason,
    });
  }

  const evenProbability = probabilities.reduce((sum, probability, digit) => digit % 2 === 0 ? sum + probability : sum, 0);
  add("even", 5, evenProbability, "even digits have the stronger recent distribution");
  add("odd", 5, 1 - evenProbability, "odd digits have the stronger recent distribution");

  for (let digit = 0; digit <= 9; digit += 1) {
    add("match", digit, probabilities[digit], `digit ${digit} is appearing more often than break-even`);
    add("differ", digit, 1 - probabilities[digit], `digit ${digit} is the lowest-frequency digit to avoid`);
  }

  for (let digit = 1; digit <= 8; digit += 1) {
    const underProbability = probabilities.slice(0, digit).reduce((sum, probability) => sum + probability, 0);
    const overProbability = probabilities.slice(digit + 1).reduce((sum, probability) => sum + probability, 0);
    const trendBias = Math.max(-0.012, Math.min(0.012, momentum * 0.02));
    add("under", digit, underProbability, `recent movement favors digits below ${digit}`, -trendBias);
    add("over", digit, overProbability, `recent movement favors digits above ${digit}`, trendBias);
  }

  candidates.sort((left, right) => smartScore(right) - smartScore(left));
  return candidates[0] ?? {
    direction: fallbackDirection,
    selectedDigit: fallbackDigit,
    confidence: 0,
    edge: 0,
    reason: "fallback contract",
  };
}

function smartScore(decision: SmartContractDecision) {
  const variancePenalty = decision.direction === "match" ? 0.018 : 0;
  return decision.edge + decision.confidence * 0.02 - variancePenalty;
}

function digitProbabilities(tick: SmartTick) {
  const counts = Array.from({ length: 10 }, () => 1);
  const recentDigits = (tick.history ?? [])
    .slice(-150)
    .map((item) => item.lastDigit)
    .filter((digit): digit is number => typeof digit === "number" && digit >= 0 && digit <= 9);

  if (recentDigits.length >= 20) {
    recentDigits.forEach((digit, index) => {
      counts[digit] += index >= recentDigits.length * 0.55 ? 1.4 : 0.8;
    });
  } else {
    Object.entries(tick.digitStats ?? {}).forEach(([digit, count]) => {
      const index = Number(digit);
      if (index >= 0 && index <= 9) counts[index] += Math.max(0, Number(count));
    });
  }

  const total = counts.reduce((sum, count) => sum + count, 0);
  return counts.map((count) => count / total);
}

function priceMomentum(tick: SmartTick) {
  const history = (tick.history ?? []).slice(-24);
  if (history.length < 2) return Math.sign(Number(tick.movement ?? 0)) * 0.25;
  const first = history[0]?.price ?? 0;
  const last = history[history.length - 1]?.price ?? first;
  const averageMove = history.slice(1).reduce((sum, item, index) => sum + Math.abs(item.price - (history[index]?.price ?? item.price)), 0) / Math.max(1, history.length - 1);
  return averageMove > 0 ? Math.max(-1, Math.min(1, (last - first) / (averageMove * history.length))) : 0;
}

export const assets = [
  "volatility_10_1s",
  "volatility_25_1s",
  "volatility_50_1s",
  "volatility_75_1s",
  "volatility_100_1s",
  "volatility_10",
  "volatility_25",
  "volatility_50",
  "volatility_75",
  "volatility_100",
  "eur_usd",
  "gbp_usd",
  "usd_jpy",
  "aud_usd",
  "usd_cad",
  "usd_chf",
];

export const forexAssets = ["eur_usd", "gbp_usd", "usd_jpy", "aud_usd", "usd_cad", "usd_chf"];

export function isForexAsset(asset: string) {
  return forexAssets.includes(asset);
}

export function assetLabel(asset: string) {
  if (isForexAsset(asset)) return asset.replace("_", "/").toUpperCase();
  return asset.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
