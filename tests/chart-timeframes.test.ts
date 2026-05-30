import { describe, expect, it } from "vitest";
import { buildTimeframeHistory, chartTimeframes, timeframeBucketSize, timeframeLabels, timeframeSamples } from "../lib/chart-timeframes";

const history = Array.from({ length: 1800 }).map((_, index) => ({
  price: 10_000 + index,
  timestamp: new Date(2026, 0, 1, 0, 0, index).toISOString(),
  sequence: index + 1,
  lastDigit: index % 10,
}));

describe("chart timeframe aggregation", () => {
  it("supports every trading chart timeframe button", () => {
    for (const timeframe of chartTimeframes) {
      const points = buildTimeframeHistory(history, timeframe);
      expect(timeframeLabels[timeframe]).toBeTruthy();
      expect(timeframeBucketSize[timeframe]).toBeGreaterThanOrEqual(1);
      expect(points).toHaveLength(timeframeSamples[timeframe]);
      expect(points.at(-1)?.sequence).toBe(1800);
    }
  });

  it("keeps 1s as raw ticks and 5s as five-tick closes", () => {
    const raw = buildTimeframeHistory(history, "1s");
    const fiveSecond = buildTimeframeHistory(history, "5s");

    expect(raw.at(-2)?.sequence).toBe(1799);
    expect(raw.at(-1)?.sequence).toBe(1800);
    expect(fiveSecond.at(-2)?.sequence).toBe(1795);
    expect(fiveSecond.at(-1)?.sequence).toBe(1800);
  });
});
