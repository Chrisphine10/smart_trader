export const chartTimeframes = ["1s", "5s", "15s", "1m", "5m", "1h"] as const;

export type ChartTimeframe = (typeof chartTimeframes)[number];
export type ChartHistoryPoint = { price: number; timestamp: string; sequence: number; lastDigit?: number };

export const timeframeSamples: Record<ChartTimeframe, number> = {
  "1s": 80,
  "5s": 16,
  "15s": 10,
  "1m": 8,
  "5m": 6,
  "1h": 5,
};

export const timeframeBucketSize: Record<ChartTimeframe, number> = {
  "1s": 1,
  "5s": 5,
  "15s": 15,
  "1m": 60,
  "5m": 150,
  "1h": 300,
};

export const timeframeLabels: Record<ChartTimeframe, string> = {
  "1s": "Raw 1-second ticks",
  "5s": "5-tick close",
  "15s": "15-tick close",
  "1m": "60-tick close",
  "5m": "150-tick close",
  "1h": "300-tick close",
};

export function buildTimeframeHistory(history: ChartHistoryPoint[], timeframe: ChartTimeframe) {
  const sampleSize = timeframeSamples[timeframe];
  const bucketSize = timeframeBucketSize[timeframe];
  if (bucketSize <= 1) return history.slice(-sampleSize);

  const rawHistory = history.slice(-(sampleSize * bucketSize));
  const offset = rawHistory.length % bucketSize;
  const alignedHistory = offset ? rawHistory.slice(offset) : rawHistory;
  const source = alignedHistory.length >= bucketSize ? alignedHistory : rawHistory;
  const grouped: ChartHistoryPoint[] = [];

  for (let index = 0; index < source.length; index += bucketSize) {
    const close = source.slice(index, index + bucketSize).at(-1);
    if (close) grouped.push(close);
  }

  return grouped.length >= 2 ? grouped.slice(-sampleSize) : history.slice(-Math.min(sampleSize, history.length));
}
