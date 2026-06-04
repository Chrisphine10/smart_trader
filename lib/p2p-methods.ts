export const p2pAssets = ["USDT", "BTC", "ETH", "USDC", "BNB", "SOL", "XRP", "LTC", "DOGE"];

export const p2pWeb3PaymentMethods = ["BTC", "ETH", "USDT", "USDC", "BNB", "SOL", "XRP", "LTC", "DOGE"];

export const defaultP2PWeb3PaymentMethods = ["BTC", "ETH", "USDT"];

export function normalizeP2PWeb3Method(value: string) {
  const normalized = value.trim().toUpperCase();
  return p2pWeb3PaymentMethods.includes(normalized) ? normalized : "";
}

export function parseP2PWeb3PaymentMethods(value: string) {
  return Array.from(new Set(
    value
      .split(",")
      .map(normalizeP2PWeb3Method)
      .filter(Boolean),
  ));
}
