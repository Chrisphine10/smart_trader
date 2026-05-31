"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowLeftRight, ArrowUp, Banknote, Bell, Bot, ChevronDown, CircleUserRound, Copy, CreditCard, Grid3X3, LogOut, Minus, Moon, Plus, Smartphone, Sun, Target, TrendingUp, Volume2, VolumeX, Wallet } from "lucide-react";
import { buildTimeframeHistory, chartTimeframes, timeframeBucketSize, type ChartTimeframe } from "../lib/chart-timeframes";
import { assets, assetLabel, forexAssets, isForexAsset, payoutMultiplier, potentialPayout, type Direction } from "../lib/trading";
import { Logo } from "./logo";

type User = {
  id: string;
  email: string;
  username: string;
  balance: string;
  real_balance: number;
  demo_balance: number;
  is_demo: boolean;
  active_balance: number;
  mpesa_phone?: string | null;
  mpesa_phone_verified?: boolean;
  referral_code?: string;
};

type Tick = {
  asset: string;
  price: number;
  lastDigit: number;
  sequence: number;
  timestamp: string;
  history?: Array<{ price: number; timestamp: string; sequence: number; lastDigit?: number }>;
  digitStats?: Record<string, number>;
  movement?: number;
  volatility?: number;
};

type AutoSession = {
  active: boolean;
  direction?: Direction;
  originalStake?: number | string | null;
  currentStake?: number | string | null;
  targetProfit?: number | string | null;
  targetLoss?: number | string | null;
  asset?: string;
  isDemo?: boolean;
  sessionPL?: number | string | null;
  waitingForClose?: boolean;
  hasOpenPosition?: boolean;
  selectedDigit?: number | string | null;
  tradeType?: string | null;
  strategy?: string | null;
  maxTrades?: number | string | null;
  stopReason?: string | null;
  tradesCount?: number | string | null;
  winsCount?: number | string | null;
  lossesCount?: number | string | null;
  durationTicks?: number | string | null;
  leverage?: number | string | null;
};

type TradeWorkspace = "Spot" | "Forex" | "P2P" | "Wallet" | "Bot";
type ContractGroup = "evenOdd" | "matchDiffer" | "overUnder";
type AmountMode = "stake" | "payout";
type ThemeMode = "dark" | "light";
type ActivityTab = "open" | "closed" | "transactions";
type ChartPoint = { x: number; y: number; lastDigit?: number };
type AiScanScope = "volatility" | "forex";
type AiRisk = "low" | "balanced" | "aggressive";
type AiTradeMode = "manual" | "auto";
type PendingTradeAction = { direction: Direction; mode: "manual" | "auto-start" | "auto-stop" };
type TradeSound = "entry" | "win" | "loss";
type TradeOutcome = {
  id: string;
  asset: string;
  detail: string;
  profitLoss: number;
};
type AiRecommendation = {
  scope: AiScanScope;
  risk: AiRisk;
  mode: AiTradeMode;
  asset: string;
  direction: Direction;
  selectedDigit: number;
  contractGroup: ContractGroup;
  timeframe: ChartTimeframe;
  durationTicks: number;
  stake: number;
  targetProfit: number;
  targetLoss: number;
  maxTrades: number;
  leverage: number;
  confidence: number;
  edge: number;
  score: number;
  probability: number;
  reason: string;
  scannedCount: number;
  scannedAt: string;
};

const quickStakeAmounts = [1, 5, 10, 25, 50, 100];
const digitOptions = Array.from({ length: 10 }, (_, digit) => digit);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatChartTimeLabel(timestamp: string | undefined, fallbackIndex: number) {
  if (!timestamp) return `${fallbackIndex}`;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return `${fallbackIndex}`;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function contractGroupForDirection(direction: Direction): ContractGroup {
  if (direction === "match" || direction === "differ") return "matchDiffer";
  if (direction === "over" || direction === "under") return "overUnder";
  return "evenOdd";
}

function directionLabel(direction: Direction, assetValue?: string) {
  if (assetValue && isForexAsset(assetValue)) return direction === "over" ? "Buy" : "Sell";
  return direction.charAt(0).toUpperCase() + direction.slice(1);
}

function riskPreset(risk: AiRisk, balance: number, forex = false) {
  const presets = {
    low: { rate: 0.004, cap: 10, profit: 5, loss: 2.5, trades: 8, leverage: 5, timeframe: forex ? "1m" : "15s" },
    balanced: { rate: 0.008, cap: 25, profit: 8, loss: 4, trades: 15, leverage: 10, timeframe: forex ? "15s" : "5s" },
    aggressive: { rate: 0.014, cap: 50, profit: 12, loss: 6, trades: 25, leverage: 20, timeframe: "1s" },
  } satisfies Record<AiRisk, { rate: number; cap: number; profit: number; loss: number; trades: number; leverage: number; timeframe: ChartTimeframe }>;
  const preset = presets[risk];
  const available = Math.max(0, Number(balance) || 0);
  const rawStake = available > 0 ? Math.min(preset.cap, Math.max(1, available * preset.rate)) : 1;
  const stake = Math.round(Math.max(0.1, available > 0 ? Math.min(rawStake, available) : rawStake) * 100) / 100;
  return {
    stake,
    targetProfit: Math.round(stake * preset.profit * 100) / 100,
    targetLoss: Math.round(stake * preset.loss * 100) / 100,
    maxTrades: preset.trades,
    leverage: preset.leverage,
    timeframe: preset.timeframe,
    durationTicks: tradeDurationForTimeframe(preset.timeframe),
  };
}

function digitProbabilitiesFromTick(tick: Tick) {
  const counts = Array.from({ length: 10 }, () => 1);
  const recentDigits = (tick.history ?? [])
    .slice(-180)
    .map((item) => item.lastDigit)
    .filter((digit): digit is number => typeof digit === "number" && digit >= 0 && digit <= 9);

  if (recentDigits.length >= 20) {
    recentDigits.forEach((digit, index) => {
      counts[digit] += index >= recentDigits.length * 0.6 ? 1.35 : 0.75;
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

function scoreDigitTick(tick: Tick, fallbackDigit: number) {
  const probabilities = digitProbabilitiesFromTick(tick);
  const options: Array<{ direction: Direction; selectedDigit: number; probability: number; reason: string }> = [];
  const safeFallbackDigit = clamp(Math.round(Number(fallbackDigit) || 5), 0, 9);
  const evenProbability = probabilities.reduce((sum, probability, digit) => digit % 2 === 0 ? sum + probability : sum, 0);
  const oddProbability = probabilities.reduce((sum, probability, digit) => digit % 2 === 1 ? sum + probability : sum, 0);

  options.push(
    { direction: "even", selectedDigit: safeFallbackDigit, probability: evenProbability, reason: "even bias" },
    { direction: "odd", selectedDigit: safeFallbackDigit, probability: oddProbability, reason: "odd bias" },
  );

  for (let digit = 0; digit <= 9; digit += 1) {
    options.push(
      { direction: "match", selectedDigit: digit, probability: probabilities[digit] ?? 0, reason: `D${digit} pressure` },
      { direction: "differ", selectedDigit: digit, probability: 1 - (probabilities[digit] ?? 0), reason: `avoid D${digit}` },
    );
  }

  for (let digit = 0; digit <= 8; digit += 1) {
    options.push({ direction: "over", selectedDigit: digit, probability: probabilities.slice(digit + 1).reduce((sum, probability) => sum + probability, 0), reason: `above D${digit}` });
  }

  for (let digit = 1; digit <= 9; digit += 1) {
    options.push({ direction: "under", selectedDigit: digit, probability: probabilities.slice(0, digit).reduce((sum, probability) => sum + probability, 0), reason: `below D${digit}` });
  }

  const ranked = options.map((option) => {
    const multiplier = payoutMultiplier(option.direction, option.selectedDigit);
    const breakEven = multiplier > 0 ? 1 / multiplier : 1;
    const edge = multiplier > 0 ? option.probability * multiplier - 1 : -1;
    const breakEvenConfidence = clamp(Math.abs(option.probability - breakEven) * Math.max(1, multiplier), 0, 1);
    const confidence = clamp(0.5 + Math.max(0, edge) * 0.8 + breakEvenConfidence * 0.25, 0.5, 0.96);
    const variancePenalty = option.direction === "match" ? 0.018 : 0;
    return {
      ...option,
      edge,
      confidence,
      score: edge + breakEvenConfidence * 0.02 - variancePenalty,
    };
  }).sort((left, right) => right.score - left.score);

  return ranked[0] ?? {
    direction: "even" as Direction,
    selectedDigit: safeFallbackDigit,
    probability: 0.5,
    reason: "fallback",
    edge: 0,
    confidence: 0,
    score: 0,
  };
}

function scoreForexTick(tick: Tick) {
  const history = (tick.history ?? []).slice(-80);
  const first = history[0]?.price ?? tick.price;
  const last = history.at(-1)?.price ?? tick.price;
  const averageMove = history.slice(1).reduce((sum, item, index) => sum + Math.abs(item.price - (history[index]?.price ?? item.price)), 0) / Math.max(1, history.length - 1);
  const netMove = last - first;
  const trendStrength = averageMove > 0 ? clamp(Math.abs(netMove) / (averageMove * Math.max(1, history.length / 4)), 0, 1) : clamp(Math.abs(Number(tick.movement ?? 0)) / Math.max(0.0001, Math.abs(tick.price) * 0.001), 0, 1);
  const direction: Direction = netMove >= 0 ? "over" : "under";
  const volatilityBoost = clamp(Number(tick.volatility ?? 0) / 100, 0, 0.15);
  const confidence = clamp(0.45 + trendStrength * 0.4 + volatilityBoost, 0, 0.98);
  return {
    direction,
    probability: confidence,
    edge: Math.round((trendStrength * 0.16 + volatilityBoost) * 10000) / 10000,
    confidence,
    score: confidence + trendStrength * 0.2,
    reason: netMove >= 0 ? "uptrend" : "downtrend",
  };
}

function tradeDurationForTimeframe(timeframe: ChartTimeframe) {
  return timeframeBucketSize[timeframe];
}

function defaultAutoDirection(contractGroup: ContractGroup, selectedDigit: number): Direction {
  if (contractGroup === "matchDiffer") return "match";
  if (contractGroup === "overUnder") return selectedDigit >= 9 ? "under" : "over";
  return "even";
}

function isInsufficientBalanceMessage(value: unknown) {
  return typeof value === "string" && value.toLowerCase().includes("insufficient balance");
}

function downsampleHistory<T>(items: T[], maxPoints = 80) {
  if (items.length <= maxPoints) return items;
  const step = (items.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => items[Math.round(index * step)]);
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function blendChartPoints(from: ChartPoint[], to: ChartPoint[], progress: number) {
  if (!from.length) return to;
  return to.map((target, index) => {
    const sourceIndex = Math.round((index / Math.max(to.length - 1, 1)) * Math.max(from.length - 1, 0));
    const source = from[sourceIndex] ?? target;
    return {
      ...target,
      x: target.x,
      y: source.y + (target.y - source.y) * progress,
    };
  });
}

function buildSmoothPath(points: ChartPoint[]) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const controlX = (previous.x + current.x) / 2;
    commands.push(`C ${controlX} ${previous.y}, ${controlX} ${current.y}, ${current.x} ${current.y}`);
  }
  return commands.join(" ");
}

function buildAreaPath(points: ChartPoint[]) {
  const linePath = buildSmoothPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return linePath && first && last ? `${linePath} L ${last.x} 300 L ${first.x} 300 Z` : "";
}

async function readJson<T>(response: Response, fallback: T): Promise<T> {
  const text = await response.text();
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    if (response.status === 401 || response.url.includes("/login")) throw new Error("Your session expired. Please log in again.");
    throw new Error("The server returned an unexpected page. Please refresh and try again.");
  }
}

async function fetchJson<T>(url: string, init: RequestInit | undefined, fallback: T): Promise<T> {
  const response = await fetch(url, init);
  return readJson(response, fallback);
}

export function TradeApp() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [asset, setAsset] = useState("volatility_10_1s");
  const [tick, setTick] = useState<Tick | null>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [stake, setStake] = useState(10);
  const [selectedDigit, setSelectedDigit] = useState(5);
  const [durationTicks, setDurationTicks] = useState(tradeDurationForTimeframe("1s"));
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [contractGroup, setContractGroup] = useState<ContractGroup>("evenOdd");
  const [amountMode, setAmountMode] = useState<AmountMode>("stake");
  const [targetProfit, setTargetProfit] = useState(200);
  const [targetLoss, setTargetLoss] = useState(999);
  const lossMultiple = 1;
  const botStrategy = "smart";
  const [maxTrades, setMaxTrades] = useState(25);
  const [forexLeverage, setForexLeverage] = useState(10);
  const [activeWorkspace, setActiveWorkspace] = useState<TradeWorkspace>("Spot");
  const [activeTimeframe, setActiveTimeframe] = useState<ChartTimeframe>("1s");
  const [activityTab, setActivityTab] = useState<ActivityTab>("open");
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [status, setStatus] = useState("connecting");
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletSection, setWalletSection] = useState<"history" | "deposit" | "withdraw" | "referrals">("deposit");
  const [chatOpen, setChatOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiAppliedConfig, setAiAppliedConfig] = useState<AiRecommendation | null>(null);
  const [referral, setReferral] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [autoSession, setAutoSession] = useState<AutoSession | null>(null);
  const [pendingTradeAction, setPendingTradeActionState] = useState<PendingTradeAction | null>(null);
  const [autoControlDirection, setAutoControlDirection] = useState<Direction | null>(null);
  const [lastTradeOutcome, setLastTradeOutcome] = useState<TradeOutcome | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingTradeActionRef = useRef<PendingTradeAction | null>(null);
  const audioEnabledRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const suppressNextEntrySoundRef = useRef(false);
  const defaultRealAppliedRef = useRef(false);
  const tradeOutcomeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positionStatusRef = useRef<Map<string, string>>(new Map());
  const displayedChartPointsRef = useRef<ChartPoint[]>([]);

  const setPendingTradeAction = useCallback((action: PendingTradeAction | null) => {
    pendingTradeActionRef.current = action;
    setPendingTradeActionState(action);
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem("trade-theme");
    if (savedTheme === "light" || savedTheme === "dark") setThemeMode(savedTheme);
    const savedAudio = localStorage.getItem("trade-audio-enabled");
    const nextAudioEnabled = savedAudio !== "false";
    audioEnabledRef.current = nextAudioEnabled;
    setAudioEnabled(nextAudioEnabled);
  }, []);

  useEffect(() => {
    localStorage.setItem("trade-theme", themeMode);
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const nextTheme = (event as CustomEvent<ThemeMode>).detail;
      if (nextTheme === "light" || nextTheme === "dark") setThemeMode(nextTheme);
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "trade-theme" && (event.newValue === "light" || event.newValue === "dark")) {
        setThemeMode(event.newValue);
      }
    };

    window.addEventListener("trade-theme-change", handleThemeChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("trade-theme-change", handleThemeChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const playTradeSound = useCallback((sound: TradeSound) => {
    if (!audioEnabledRef.current || typeof window === "undefined") return;
    const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const context = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = context;
    void context.resume();

    const now = context.currentTime;
    const sequence = sound === "win"
      ? [740, 932, 1175]
      : sound === "loss"
        ? [260, 196]
        : [520, 660];

    sequence.forEach((frequency, index) => {
      const start = now + index * 0.08;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = sound === "loss" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(sound === "loss" ? 0.06 : 0.075, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.15);
    });
  }, []);

  const toggleTradeAudio = useCallback(() => {
    const nextAudioEnabled = !audioEnabledRef.current;
    audioEnabledRef.current = nextAudioEnabled;
    setAudioEnabled(nextAudioEnabled);
    localStorage.setItem("trade-audio-enabled", nextAudioEnabled ? "true" : "false");
    if (nextAudioEnabled) window.setTimeout(() => playTradeSound("entry"), 0);
  }, [playTradeSound]);

  const playPositionSound = useCallback((position: any, previousStatus?: string) => {
    const nextStatus = String(position?.status ?? "");
    if (!nextStatus || previousStatus === nextStatus) return;
    if (nextStatus === "open") {
      if (suppressNextEntrySoundRef.current) {
        suppressNextEntrySoundRef.current = false;
        return;
      }
      playTradeSound("entry");
      return;
    }
    const profitLoss = Number(position?.profit_loss ?? 0);
    playTradeSound(nextStatus === "won" || profitLoss > 0 ? "win" : "loss");
  }, [playTradeSound]);

  const showTradeOutcome = useCallback((position: any) => {
    if (!position?.id || position.status === "open") return;
    const isForex = position.trade_type === "forex" || position.trade_type === "futures";
    const side = isForex ? (position.direction === "over" ? "BUY" : "SELL") : String(position.direction ?? "").toUpperCase();
    const detail = isForex
      ? `${side} forex`
      : position.trade_type === "even_odd"
        ? side
        : `${side} digit ${position.selected_digit ?? "-"}`;

    if (tradeOutcomeTimerRef.current) clearTimeout(tradeOutcomeTimerRef.current);
    setLastTradeOutcome({
      id: String(position.id),
      asset: String(position.asset ?? ""),
      detail,
      profitLoss: Number(position.profit_loss ?? 0),
    });
    tradeOutcomeTimerRef.current = setTimeout(() => {
      setLastTradeOutcome(null);
      tradeOutcomeTimerRef.current = null;
    }, 9000);
  }, []);

  useEffect(() => () => {
    if (tradeOutcomeTimerRef.current) clearTimeout(tradeOutcomeTimerRef.current);
  }, []);

  const redirectToTradeLogin = useCallback(() => {
    location.href = `/login?redirect=${encodeURIComponent("/trade")}&account=real`;
  }, []);

  const openDepositPrompt = useCallback((reason?: string) => {
    setWalletSection("deposit");
    setWalletOpen(true);
    setMessage(reason ?? "Add funds to your real account before placing this trade.");
  }, []);

  const load = useCallback(async (currentToken: string, modeOverride?: boolean) => {
    const headers = { Authorization: `Bearer ${currentToken}` };
    const me = await fetchJson<{ user: User | null }>("/api/auth/me", { headers }, { user: null });
    if (!me.user) throw new Error("Session expired");
    const isDemo = modeOverride ?? me.user?.is_demo ?? true;
    const [realPositions, tx, ref, autoStatus] = await Promise.all([
      fetchJson<{ positions: any[] }>(`/api/trade/positions?isDemo=${isDemo}`, { headers }, { positions: [] }).catch(() => ({ positions: [] })),
      fetchJson<{ transactions: any[] }>("/api/transactions?limit=40", { headers }, { transactions: [] }).catch(() => ({ transactions: [] })),
      fetchJson<any>("/api/referrals/my-referral", { headers }, null).catch(() => null),
      fetchJson<{ session?: AutoSession | null }>("/api/trade/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ type: "auto_trading_status" }),
      }, {}).catch((): { session?: AutoSession | null } => ({})),
    ]);
    setUser(me.user);
    const nextPositions = realPositions.positions ?? [];
    positionStatusRef.current = new Map(nextPositions.filter((position) => position?.id).map((position) => [String(position.id), String(position.status ?? "")]));
    setPositions(nextPositions);
    setTransactions(tx.transactions ?? []);
    setReferral(ref);
    if (autoStatus.session !== undefined) {
      const nextSession = autoStatus.session ?? null;
      setAutoSession(nextSession);
      setAutoControlDirection((current) => nextSession?.active ? current ?? nextSession.direction ?? null : null);
    }
  }, []);

  const applyPositionUpdate = useCallback((position: any) => {
    if (!position?.id) return;
    const id = String(position.id);
    const nextStatus = String(position.status ?? "");
    const previousStatus = positionStatusRef.current.get(id);
    if (nextStatus && previousStatus !== nextStatus) {
      positionStatusRef.current.set(id, nextStatus);
      playPositionSound(position, previousStatus);
      if (nextStatus !== "open") showTradeOutcome(position);
    }
    setPositions((items) => [position, ...items.filter((item) => item.id !== position.id)].slice(0, 60));
  }, [playPositionSound, showTradeOutcome]);

  const postTradeAction = useCallback(async (type: string, config: Record<string, unknown> = {}) => {
    if (!token) return;
    const response = await fetch("/api/trade/action", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type, config }),
    });
    const data = await readJson<{ position?: any; positions?: any[]; user?: User; session?: AutoSession | null; error?: string }>(response, {});
    if (!response.ok) {
      suppressNextEntrySoundRef.current = false;
      setPendingTradeAction(null);
      if (response.status === 401) {
        redirectToTradeLogin();
        return;
      }
      if (isInsufficientBalanceMessage(data.error)) {
        openDepositPrompt(data.error);
        return;
      }
      setMessage(data.error ?? "Trading request failed");
      return;
    }
    if (data.position) applyPositionUpdate(data.position);
    (data.positions ?? []).forEach(applyPositionUpdate);
    if (data.user) setUser(data.user);
    if (data.session !== undefined) {
      setAutoSession(data.session);
      const pendingAction = pendingTradeActionRef.current;
      setAutoControlDirection((current) => data.session?.active ? pendingAction?.mode === "auto-start" ? pendingAction.direction : current ?? data.session.direction ?? null : null);
      setMessage(data.session?.active ? "Auto-trading is running" : "Auto-trading stopped");
    }
    if (type === "manual_trade" || type === "auto_trading_start" || type === "auto_trading_stop") {
      if (!data.position) suppressNextEntrySoundRef.current = false;
      setPendingTradeAction(null);
    }
    await load(token).catch(() => undefined);
  }, [applyPositionUpdate, load, openDepositPrompt, redirectToTradeLogin, setPendingTradeAction, token]);

  useEffect(() => {
    const saved = localStorage.getItem("token");
    if (!saved) {
      redirectToTradeLogin();
      return;
    }
    setToken(saved);
    load(saved).catch(() => {
      localStorage.removeItem("token");
      redirectToTradeLogin();
    });
  }, [load, redirectToTradeLogin]);

  useEffect(() => {
    if (!token || !user || defaultRealAppliedRef.current) return;
    defaultRealAppliedRef.current = true;
    const params = new URLSearchParams(location.search);
    const requestedAccount = params.get("account");
    if (requestedAccount === "demo" && !user.is_demo) {
      switchAccount(true).catch(() => undefined);
      return;
    }
    if (requestedAccount !== "real" || !user.is_demo) return;
    switchAccount(false).finally(() => {
      params.delete("account");
      const query = params.toString();
      history.replaceState(null, "", query ? `/trade?${query}` : "/trade");
    });
  }, [token, user]);

  useEffect(() => {
    if (!token) return;
    if (!["localhost", "127.0.0.1"].includes(location.hostname)) return;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closedByEffect = false;
    const protocol = location.protocol === "https:" ? "wss" : "ws";

    function connect() {
      setStatus("connecting");
      const socket = new WebSocket(`${protocol}://${location.host}/ws`);
      wsRef.current = socket;
      socket.onopen = () => {
        setStatus("connected");
        socket.send(JSON.stringify({ type: "auth", token }));
        socket.send(JSON.stringify({ type: "subscribe", asset }));
      };
      socket.onclose = () => {
        setStatus("disconnected");
        if (!closedByEffect) retry = setTimeout(connect, 1200);
      };
      socket.onerror = () => setStatus("error");
      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === "price_update") setTick(payload.data);
        if (payload.type === "balance_update") setUser(payload.data);
        if (payload.type === "position_update") {
          applyPositionUpdate(payload.data);
          if (pendingTradeActionRef.current?.mode === "manual") setPendingTradeAction(null);
          if (token) load(token).catch(() => undefined);
        }
        if (payload.type === "auth_success" && payload.data?.user) {
          setUser(payload.data.user);
          if (payload.data.autoTrading !== undefined) {
            const session = payload.data.autoTrading;
            setAutoSession(session);
            setAutoControlDirection((current) => session?.active ? current ?? session.direction ?? null : null);
          }
        }
        if (payload.type === "auto_trading_response" || payload.type === "auto_trading_update") {
          const session = payload.session ?? payload.data;
          setAutoSession(session ?? null);
          const pendingAction = pendingTradeActionRef.current;
          setAutoControlDirection((current) => session?.active ? pendingAction?.mode === "auto-start" ? pendingAction.direction : current ?? session.direction ?? null : null);
          if (pendingAction?.mode !== "manual") setPendingTradeAction(null);
          if (session?.active) setMessage("Auto-trading is running");
          else if (session?.stopReason) setMessage(`Auto-trading stopped: ${String(session.stopReason).replaceAll("_", " ")}`);
          else setMessage(session ? "Auto-trading session updated" : "");
        }
        if (payload.type === "auth_error") redirectToTradeLogin();
      if (payload.type === "error") {
        const errorMessage = String(payload.data ?? "Trading request failed");
        suppressNextEntrySoundRef.current = false;
        setPendingTradeAction(null);
        if (isInsufficientBalanceMessage(errorMessage)) openDepositPrompt(errorMessage);
          else setMessage(errorMessage);
        }
      };
    }

    connect();

    return () => {
      closedByEffect = true;
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [applyPositionUpdate, asset, load, openDepositPrompt, redirectToTradeLogin, setPendingTradeAction, token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };

    async function pollTick() {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      const data = await fetchJson<{ tick?: Tick; positions?: any[]; user?: User; autoTrading?: AutoSession | null }>(
        `/api/market/tick?asset=${encodeURIComponent(asset)}`,
        { headers },
        {},
      );
      if (cancelled) return;
      if (data.tick) setTick(data.tick);
      (data.positions ?? []).forEach(applyPositionUpdate);
      if (data.user) setUser(data.user);
      if (data.autoTrading !== undefined) {
        setAutoSession(data.autoTrading);
        setAutoControlDirection((current) => data.autoTrading?.active ? current ?? data.autoTrading.direction ?? null : null);
      }
      setStatus("connected");
    }

    pollTick().catch(() => {
      if (!cancelled) setStatus("error");
    });
    const interval = setInterval(() => {
      pollTick().catch(() => {
        if (!cancelled) setStatus("error");
      });
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [applyPositionUpdate, asset, token]);

  function switchAsset(value: string) {
    setAsset(value);
    wsRef.current?.send(JSON.stringify({ type: "subscribe", asset: value }));
  }

  function selectTimeframe(timeframe: ChartTimeframe) {
    const nextDuration = tradeDurationForTimeframe(timeframe);
    setActiveTimeframe(timeframe);
    setDurationTicks(nextDuration);
    if (autoSession?.active) {
      sendTradeAction("auto_trading_update_settings", { durationTicks: nextDuration });
      setMessage(`Next auto trade duration set to ${nextDuration}s`);
    }
  }

  async function switchAccount(isDemo: boolean) {
    if (!token) return;
    const response = await fetch("/api/auth/switch-account", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: isDemo ? "demo" : "real" }),
    });
    const data = await readJson<{ user?: User; token?: string; error?: string }>(response, {});
    if (!response.ok) {
      setMessage(data.error ?? "Unable to switch account mode");
      return;
    }
    if (data.token) localStorage.setItem("token", data.token);
    if (data.user) setUser(data.user);
    const params = new URLSearchParams(location.search);
    if (isDemo) params.set("account", "demo");
    else params.delete("account");
    const query = params.toString();
    history.replaceState(null, "", query ? `/trade?${query}` : "/trade");
    load(data.token ?? token, data.user?.is_demo).catch(() => undefined);
  }

  function sendTradeAction(type: "manual_trade" | "auto_trading_start" | "auto_trading_stop" | "auto_trading_update_settings", config: Record<string, unknown> = {}) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, config }));
      return;
    }
    postTradeAction(type, config).catch((error) => setMessage(error instanceof Error ? error.message : "Trading request failed"));
  }

  function buildTradeConfig(direction: Direction, tradeAsset = asset) {
    const isForexTrade = isForexAsset(tradeAsset);
    return {
      direction,
      stake,
      targetProfit,
      targetLoss,
      lossMultiple,
      asset: tradeAsset,
      isDemo: user?.is_demo ?? true,
      selectedDigit,
      durationTicks,
      strategy: isForexTrade ? "forex_trend" : botStrategy,
      maxTrades,
      contractMode: isForexTrade ? "forex" : "digit",
      leverage: forexLeverage,
    };
  }

  function validateTradeFunds() {
    setMessage("");
    if (!token || !user) {
      redirectToTradeLogin();
      return false;
    }
    const stakeAmount = Number(stake) || 0;
    const activeBalance = Number(user.active_balance) || 0;
    if (stakeAmount > activeBalance) {
      openDepositPrompt(`Deposit at least $${(stakeAmount - activeBalance).toFixed(2)} more to place this trade.`);
      return false;
    }
    return true;
  }

  function startAutoTrading(direction = defaultAutoDirection(contractGroup, selectedDigit), tradeAsset = asset) {
    if (!validateTradeFunds()) return;
    setMode("auto");
    setActiveWorkspace(isForexAsset(tradeAsset) ? "Forex" : "Bot");
    setAutoControlDirection(direction);
    setPendingTradeAction({ direction, mode: "auto-start" });
    suppressNextEntrySoundRef.current = true;
    playTradeSound("entry");
    sendTradeAction("auto_trading_start", buildTradeConfig(direction, tradeAsset));
    setMessage("Starting auto-trading...");
  }

  function stopAutoTrading(nextWorkspace: TradeWorkspace = "Spot") {
    setMode("manual");
    setActiveWorkspace(nextWorkspace);
    setPendingTradeAction(null);
    suppressNextEntrySoundRef.current = false;
    setAutoControlDirection(null);
    if (autoSession?.active) {
      sendTradeAction("auto_trading_stop");
      setMessage("Stopping auto-trading...");
    } else {
      setMessage("");
    }
  }

  function stopAutoFromTradeButton(direction: Direction) {
    setPendingTradeAction({ direction, mode: "auto-stop" });
    sendTradeAction("auto_trading_stop");
    setMessage("Stopping auto-trading...");
  }

  function place(direction: Direction) {
    const activeStopDirection = autoControlDirection ?? autoSession?.direction ?? null;
    if (mode === "auto" && isAutoRunning && activeStopDirection === direction) {
      stopAutoFromTradeButton(direction);
      return;
    }
    if (!validateTradeFunds()) return;
    const config = buildTradeConfig(direction);
    if (mode === "auto") {
      startAutoTrading(direction);
      return;
    }
    setPendingTradeAction({ direction, mode: "manual" });
    suppressNextEntrySoundRef.current = true;
    playTradeSound("entry");
    sendTradeAction("manual_trade", config);
  }

  function selectWorkspace(tab: TradeWorkspace) {
    if (tab === "P2P") {
      location.href = "/p2p";
      return;
    }
    if (tab === "Wallet") {
      setActiveWorkspace(tab);
      setWalletSection("deposit");
      setWalletOpen(true);
      return;
    }
    if (tab === "Bot") {
      const botAsset = isForexAsset(asset) ? "volatility_10_1s" : asset;
      if (botAsset !== asset) switchAsset(botAsset);
      setMode("auto");
      setActiveWorkspace("Bot");
      setMessage("");
      return;
    }
    setActiveWorkspace(tab);
    if (tab === "Forex") {
      if (mode === "auto") stopAutoTrading("Forex");
      else setMode("manual");
      setAmountMode("stake");
      if (!isForexAsset(asset)) switchAsset(forexAssets[0]);
    }
    if (tab === "Spot") {
      if (mode === "auto") stopAutoTrading("Spot");
      else setMode("manual");
      if (isForexAsset(asset)) switchAsset("volatility_10_1s");
    }
  }

  function selectContractGroup(group: ContractGroup) {
    setContractGroup(group);
    if (activeWorkspace === "Forex") setActiveWorkspace(mode === "auto" ? "Bot" : "Spot");
    if (isForexAsset(asset)) switchAsset("volatility_10_1s");
  }

  function selectTradeMode(nextMode: "manual" | "auto") {
    if (activeWorkspace === "Forex") {
      if (!isForexAsset(asset)) switchAsset(forexAssets[0]);
      setAmountMode("stake");
      if (nextMode === "auto") {
        setMode("auto");
        setActiveWorkspace("Forex");
        setMessage("");
        return;
      }
      if (mode === "auto") stopAutoTrading("Forex");
      else {
        setMode("manual");
        setMessage("");
      }
      return;
    }

    if (nextMode === "auto") selectWorkspace("Bot");
    else selectWorkspace("Spot");
  }

  function applyAiConfig(config: AiRecommendation) {
    setAiAppliedConfig(config);
    setAmountMode("stake");
    setStake(config.stake);
    setTargetProfit(config.targetProfit);
    setTargetLoss(config.targetLoss);
    setMaxTrades(config.maxTrades);
    setForexLeverage(config.leverage);
    setSelectedDigit(config.selectedDigit);
    setActiveTimeframe(config.timeframe);
    setDurationTicks(config.durationTicks);
    setMode("auto");
    if (asset !== config.asset) switchAsset(config.asset);
    if (isForexAsset(config.asset)) {
      setActiveWorkspace("Forex");
    } else {
      setContractGroup(config.contractGroup);
      setActiveWorkspace("Bot");
    }
    setMessage(`AI loaded: ${assetLabel(config.asset)} ${directionLabel(config.direction, config.asset)}. Click Start to run.`);
    setAiOpen(false);
  }

  const isForexMode = activeWorkspace === "Forex";
  const payout = useMemo(() => ({
    even: potentialPayout(stake, "even"),
    odd: potentialPayout(stake, "odd"),
    over: potentialPayout(stake, "over", selectedDigit),
    under: potentialPayout(stake, "under", selectedDigit),
    match: potentialPayout(stake, "match", selectedDigit),
    differ: potentialPayout(stake, "differ", selectedDigit),
  }), [stake, selectedDigit]);
  const forexQuote = useMemo(() => {
    const margin = Math.max(0.1, Number(stake) || 0);
    const leverage = Math.max(1, Math.min(50, forexLeverage));
    const notional = margin * leverage;
    const payout = Math.round((margin + margin * leverage * 0.8) * 100) / 100;
    return { leverage, notional, payout };
  }, [forexLeverage, stake]);
  const forexProfit = Math.max(0, forexQuote.payout - stake);
  const contractActions = useMemo(() => {
    if (contractGroup === "matchDiffer") {
      return [
        { direction: "match" as Direction, label: "Match", icon: Target, payout: payout.match, tone: "green" as const, disabled: false },
        { direction: "differ" as Direction, label: "Differ", icon: AlertTriangle, payout: payout.differ, tone: "red" as const, disabled: false },
      ];
    }
    if (contractGroup === "overUnder") {
      return [
        { direction: "over" as Direction, label: "Over", icon: ArrowUp, payout: payout.over, tone: "green" as const, disabled: payout.over <= 0 },
        { direction: "under" as Direction, label: "Under", icon: ArrowDown, payout: payout.under, tone: "red" as const, disabled: payout.under <= 0 },
      ];
    }
    return [
      { direction: "even" as Direction, label: "Even", icon: Grid3X3, payout: payout.even, tone: "green" as const, disabled: false },
      { direction: "odd" as Direction, label: "Odd", icon: AlertTriangle, payout: payout.odd, tone: "red" as const, disabled: false },
    ];
  }, [contractGroup, payout]);
  const primaryPayout = isForexMode ? forexQuote.payout : contractActions[0]?.payout ?? 0;
  const primaryMultiplier = stake > 0 ? Math.max(0.01, primaryPayout / stake) : 1;
  const displayedTicketAmount = isForexMode ? stake : amountMode === "stake" ? stake : primaryPayout;

  function setTicketAmount(value: number) {
    const safeValue = Math.max(0.1, Number.isFinite(value) ? value : 0.1);
    if (!isForexMode && amountMode === "payout") {
      setStake(Math.round((safeValue / primaryMultiplier) * 100) / 100);
      return;
    }
    setStake(Math.round(safeValue * 100) / 100);
  }

  function adjustTicketAmount(delta: number) {
    setTicketAmount(displayedTicketAmount + delta);
  }

  const [displayedChartPoints, setDisplayedChartPoints] = useState<ChartPoint[]>([]);
  const chartHistory = useMemo(() => {
    const history = tick?.history ?? [];
    return buildTimeframeHistory(history, activeTimeframe);
  }, [activeTimeframe, tick]);
  const chartPointList = useMemo(() => {
    const history = downsampleHistory(chartHistory, 80);
    if (!history.length) return [];
    const prices = history.map((item) => item.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return history.map((item, index) => {
      const x = (index / Math.max(history.length - 1, 1)) * 640;
      const y = 236 - ((item.price - min) / Math.max(max - min, Number.EPSILON)) * 184;
      return { x, y, lastDigit: item.lastDigit };
    });
  }, [chartHistory]);
  const chartAxisLabels = useMemo(() => {
    const history = downsampleHistory(chartHistory, 80);
    if (!history.length) return { indexLabels: [] as Array<{ y: number; value: number }>, timeLabels: [] as Array<{ x: number; label: string }> };
    const prices = history.map((item) => item.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = Math.max(max - min, Number.EPSILON);
    const indexLabels = Array.from({ length: 5 }).map((_, index) => {
      const ratio = index / 4;
      return {
        y: 52 + ratio * 184,
        value: max - range * ratio,
      };
    });
    const sampleIndexes = [0, 0.25, 0.5, 0.75, 1]
      .map((ratio) => Math.round(ratio * Math.max(history.length - 1, 0)))
      .filter((index, position, items) => items.indexOf(index) === position);
    const timeLabels = sampleIndexes.map((historyIndex) => {
      const item = history[historyIndex];
      const x = (historyIndex / Math.max(history.length - 1, 1)) * 640;
      return {
        x: clamp(x, 72, 592),
        label: formatChartTimeLabel(item?.timestamp, historyIndex + 1),
      };
    });
    return { indexLabels, timeLabels };
  }, [chartHistory]);

  useEffect(() => {
    if (!chartPointList.length) {
      displayedChartPointsRef.current = [];
      setDisplayedChartPoints([]);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();
    const duration = 520;
    const from = displayedChartPointsRef.current.length ? displayedChartPointsRef.current : chartPointList;

    function animate(now: number) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const next = blendChartPoints(from, chartPointList, easeOutCubic(progress));
      displayedChartPointsRef.current = next;
      setDisplayedChartPoints(next);
      if (progress < 1) frame = requestAnimationFrame(animate);
    }

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [chartPointList]);

  const chartPath = useMemo(() => buildSmoothPath(displayedChartPoints), [displayedChartPoints]);
  const chartAreaPath = useMemo(() => buildAreaPath(displayedChartPoints), [displayedChartPoints]);
  const selectedIndexMarkers = useMemo(() => {
    if (isForexMode) return [] as ChartPoint[];
    return displayedChartPoints.filter((point) => point.lastDigit === selectedDigit).slice(-12);
  }, [displayedChartPoints, isForexMode, selectedDigit]);
  const chartChange = useMemo(() => {
    const history = chartHistory;
    const prices = history.map((item) => item.price);
    const first = prices[0] ?? 0;
    const last = prices.at(-1) ?? 0;
    return first ? ((last - first) / first) * 100 : 0;
  }, [chartHistory]);
  const lastChartPoint = displayedChartPoints[displayedChartPoints.length - 1] ?? { x: 0, y: 0 };
  const digitStats = useMemo(() => {
    const stats = tick?.digitStats ?? {};
    const total = Object.values(stats).reduce((sum, value) => sum + Number(value), 0);
    return Array.from({ length: 10 }).map((_, digit) => {
      const count = Number(stats[digit] ?? 0);
      const percentage = total ? (count / total) * 100 : 0;
      return { digit, count, percentage };
    });
  }, [tick]);
  const digitMeasures = useMemo(() => {
    const total = digitStats.reduce((sum, item) => sum + item.count, 0);
    const ranked = [...digitStats].sort((left, right) => right.percentage - left.percentage);
    const hot = ranked[0] ?? { digit: 0, count: 0, percentage: 0 };
    const cold = ranked[ranked.length - 1] ?? { digit: 0, count: 0, percentage: 0 };
    const evenCount = digitStats.filter((item) => item.digit % 2 === 0).reduce((sum, item) => sum + item.count, 0);
    const belowCount = digitStats.filter((item) => item.digit < selectedDigit).reduce((sum, item) => sum + item.count, 0);
    const aboveCount = digitStats.filter((item) => item.digit > selectedDigit).reduce((sum, item) => sum + item.count, 0);
    return {
      total,
      hot,
      cold,
      evenShare: total ? (evenCount / total) * 100 : 0,
      oddShare: total ? ((total - evenCount) / total) * 100 : 0,
      belowShare: total ? (belowCount / total) * 100 : 0,
      aboveShare: total ? (aboveCount / total) * 100 : 0,
    };
  }, [digitStats, selectedDigit]);
  const openPositions = positions.filter((position) => position.status === "open");
  const completedPositions = positions.filter((position) => position.status !== "open");
  const sessionProfitLoss = Number(autoSession?.sessionPL ?? 0);
  const isAutoRunning = Boolean(autoSession?.active);
  const activeAutoStopDirection = isAutoRunning ? autoControlDirection ?? autoSession?.direction ?? null : null;
  const movement = Number(tick?.movement ?? 0);
  const selectableAssets = isForexMode ? forexAssets : assets.filter((item) => !isForexAsset(item));
  const marketToggleTarget: TradeWorkspace = isForexMode ? "Spot" : "Forex";
  const marketToggleLabel = isForexMode ? "Index Trade" : "Forex";
  const showDigitSelector = !isForexMode && contractGroup !== "evenOdd";
  const pricePrecision = isForexAsset(asset) ? asset.includes("jpy") ? 3 : 5 : 2;
  const formatActivePrice = (value: number | undefined) => typeof value === "number" ? value.toFixed(pricePrecision) : "-";
  const tradeButtonLabel = (label: string, direction: Direction) => {
    if (pendingTradeAction?.direction === direction) {
      if (pendingTradeAction.mode === "manual") return "Starting trade";
      if (pendingTradeAction.mode === "auto-stop") return "Stopping...";
      return "Starting...";
    }
    if (mode === "auto") return activeAutoStopDirection === direction ? "Stop" : `Start ${label}`;
    return label;
  };
  const isTradeButtonDisabled = (direction: Direction, disabled = false) => {
    if (disabled) return true;
    if (pendingTradeAction) return true;
    return mode === "auto" && Boolean(activeAutoStopDirection) && activeAutoStopDirection !== direction;
  };

  if (!user) {
    return <main className="trade-theme flex min-h-screen items-center justify-center bg-ink text-white" data-theme={themeMode}><div className="h-10 w-10 animate-spin rounded-full border-[3px] border-brand border-t-transparent" /></main>;
  }

  return (
    <main className="trade-theme min-h-screen overflow-x-hidden bg-[#0b0f16] text-white min-[600px]:flex min-[600px]:h-screen min-[600px]:flex-col min-[600px]:overflow-hidden" data-theme={themeMode}>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0f16]/95 backdrop-blur min-[600px]:shrink-0">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-2 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Logo size="sm" />
            <span aria-label={status} title={status} className={`h-2.5 w-2.5 shrink-0 rounded-full ${status === "connected" ? "bg-emerald-400" : "bg-amber-300"}`} />
          </div>
          <div className="flex min-w-0 items-center justify-end gap-1.5 overflow-x-auto pb-1 min-[600px]:overflow-hidden sm:pb-0">
            <div className="flex shrink-0 rounded-lg bg-white/5 p-1">
              <button onClick={() => switchAccount(true)} className={`rounded-md px-3 py-1.5 text-xs font-bold ${user.is_demo ? "bg-brand" : "text-gray-300 hover:bg-white/5"}`}>Demo</button>
              <button onClick={() => switchAccount(false)} className={`rounded-md px-3 py-1.5 text-xs font-bold ${!user.is_demo ? "bg-brand" : "text-gray-300 hover:bg-white/5"}`}>Real</button>
            </div>
            <button onClick={() => setAiOpen(true)} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-brand/25 bg-brand/10 px-3 text-xs font-black text-brand hover:bg-brand/15"><Bot size={15} /><span>AI</span></button>
            <button onClick={() => selectWorkspace("P2P")} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-white/5 px-3 text-xs font-bold text-gray-200 hover:bg-white/10"><ArrowLeftRight size={15} /><span>P2P</span></button>
            <button
              onClick={() => selectWorkspace(marketToggleTarget)}
              className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold ${isForexMode ? "bg-brand text-ink" : "bg-white/5 text-gray-200 hover:bg-white/10"}`}
            >
              {isForexMode ? <Grid3X3 size={15} /> : <TrendingUp size={15} />}
              <span>{marketToggleLabel}</span>
            </button>
            <button aria-label="Open wallet" onClick={() => { setWalletSection("deposit"); setWalletOpen(true); }} className="inline-flex h-10 min-w-[112px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white/5 px-3 text-xs font-bold hover:bg-white/10"><Wallet size={15} /><span>${Number(user.active_balance).toFixed(2)}</span></button>
            <button
              aria-label={`Switch to ${themeMode === "light" ? "dark" : "light"} theme`}
              title={`Switch to ${themeMode === "light" ? "dark" : "light"} theme`}
              onClick={() => setThemeMode((current) => {
                const nextTheme = current === "light" ? "dark" : "light";
                window.dispatchEvent(new CustomEvent<ThemeMode>("trade-theme-change", { detail: nextTheme }));
                return nextTheme;
              })}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-gray-300 hover:bg-white/10"
            >
              {themeMode === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button
              aria-label={audioEnabled ? "Turn trade audio off" : "Turn trade audio on"}
              title={audioEnabled ? "Trade audio on" : "Trade audio off"}
              onClick={toggleTradeAudio}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 ${audioEnabled ? "text-brand" : "text-gray-400"}`}
            >
              {audioEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
            <button aria-label="Log out" onClick={() => { localStorage.removeItem("token"); location.href = "/login"; }} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-white/5"><LogOut size={17} /></button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-3 p-2 sm:p-3 min-[600px]:min-h-0 min-[600px]:flex-1 min-[600px]:grid-cols-[128px_minmax(0,1fr)_300px] min-[600px]:items-stretch min-[600px]:gap-1 min-[600px]:overflow-hidden min-[900px]:grid-cols-[220px_minmax(0,1fr)_360px] min-[900px]:p-2 xl:grid-cols-[260px_minmax(0,1fr)_420px] xl:items-stretch 2xl:grid-cols-[300px_minmax(0,1fr)_440px]">
        <section className="order-1 min-w-0 space-y-3 min-[600px]:order-2 min-[600px]:flex min-[600px]:h-full min-[600px]:flex-col min-[600px]:gap-2 min-[600px]:space-y-0 min-[600px]:overflow-hidden xl:col-start-2 xl:row-start-1">
          <div className="overflow-hidden rounded-lg border border-white/10 bg-[#0f141d] min-[600px]:flex min-[600px]:min-h-0 min-[600px]:flex-1 min-[600px]:flex-col">
            <div className="border-b border-white/10 p-3 min-[600px]:p-2 sm:p-4">
              <div className="grid gap-3 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(190px,240px)] min-[900px]:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="min-w-0 text-xl font-black sm:text-2xl">{assetLabel(asset)}</h1>
                    <span className="rounded-md bg-brand/15 px-2 py-1 text-xs font-bold text-brand">{isForexMode ? "Forex" : mode === "auto" ? "Bot" : "Spot"}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-400">
                    <span>Price <span className="font-black text-white">{formatActivePrice(tick?.price)}</span></span>
                    {!isForexMode && <span>Digit <span className="font-black text-brand">{tick?.lastDigit ?? "-"}</span></span>}
                    <span className={movement >= 0 ? "text-emerald-400" : "text-rose-400"}>{movement >= 0 ? "+" : ""}{movement.toFixed(2)}</span>
                    <span className={chartChange >= 0 ? "text-emerald-400" : "text-rose-400"}>{chartChange >= 0 ? "+" : ""}{chartChange.toFixed(2)}%</span>
                  </div>
                </div>
                <label className="relative block min-w-0">
                  <span className="pointer-events-none absolute left-3 top-1.5 z-[1] text-[9px] font-black uppercase tracking-wide text-gray-500">{isForexMode ? "Currency" : "Volatility"}</span>
                  <select value={asset} onChange={(event) => switchAsset(event.target.value)} className="field h-12 min-w-0 pb-1.5 pt-5 text-sm font-black">
                    {selectableAssets.map((item) => <option key={item} value={item}>{assetLabel(item)}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-3 flex max-w-full gap-1 overflow-x-auto rounded-lg bg-white/5 p-1 min-[600px]:overflow-hidden">
                  {chartTimeframes.map((timeframe) => (
                    <button
                      key={timeframe}
                      aria-pressed={activeTimeframe === timeframe}
                      onClick={() => selectTimeframe(timeframe)}
                      className={`rounded-md px-3 py-1.5 text-xs font-bold min-[600px]:flex-1 min-[600px]:px-1.5 min-[600px]:text-[11px] ${activeTimeframe === timeframe ? "bg-brand !text-ink" : "text-gray-300 hover:bg-white/5"}`}
                    >
                      {timeframe}
                    </button>
                  ))}
              </div>
            </div>

            <div className="relative min-h-[300px] bg-[#0a0e14] min-[600px]:min-h-0 min-[600px]:flex-1 sm:min-h-[430px] lg:min-h-[470px]">
              <svg viewBox="0 0 640 300" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                <defs>
                  <linearGradient id="trade-chart" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#FACC15" stopOpacity=".26" /><stop offset="1" stopColor="#FACC15" stopOpacity="0" /></linearGradient>
                </defs>
                {Array.from({ length: 5 }).map((_, index) => <line key={`h-${index}`} x1="0" x2="640" y1={40 + index * 50} y2={40 + index * 50} stroke="rgba(255,255,255,.045)" />)}
                {Array.from({ length: 6 }).map((_, index) => <line key={`v-${index}`} y1="0" y2="300" x1={96 + index * 96} x2={96 + index * 96} stroke="rgba(255,255,255,.026)" />)}
                {chartAxisLabels.indexLabels.length > 0 && <text x="624" y="28" textAnchor="end" fill="rgba(255,255,255,.42)" fontSize="10" fontWeight="700">Index</text>}
                {chartAxisLabels.indexLabels.map((label) => (
                  <text key={`index-${label.y}`} x="624" y={label.y + 3} textAnchor="end" fill="rgba(255,255,255,.5)" fontSize="10">{formatActivePrice(label.value)}</text>
                ))}
                {chartAxisLabels.timeLabels.length > 0 && <text x="18" y="286" fill="rgba(255,255,255,.42)" fontSize="10" fontWeight="700">Time</text>}
                {chartAxisLabels.timeLabels.map((label) => (
                  <text key={`time-${label.label}`} x={label.x} y="286" textAnchor="middle" fill="rgba(255,255,255,.5)" fontSize="10">{label.label}</text>
                ))}
                {chartAreaPath && <path d={chartAreaPath} fill="url(#trade-chart)" />}
                {chartPath && <path d={chartPath} fill="none" stroke="rgba(250,204,21,.28)" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />}
                {chartPath && <path d={chartPath} fill="none" stroke="#FACC15" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />}
                {selectedIndexMarkers.map((point, index) => (
                  <circle key={`selected-index-${index}-${point.x}`} cx={point.x} cy={point.y} r="4" fill="#0a0e14" stroke="#FACC15" strokeWidth="2" />
                ))}
                {chartPath && <line x1="0" x2="640" y1={lastChartPoint.y} y2={lastChartPoint.y} stroke="rgba(96,165,250,.24)" strokeDasharray="5 8" />}
                {chartPath && <circle cx={lastChartPoint.x} cy={lastChartPoint.y} r="4" fill="#FACC15" stroke="#0a0e14" strokeWidth="2" />}
                {!chartPath && <text x="320" y="150" textAnchor="middle" fill="rgba(255,255,255,.45)" fontSize="15">Waiting for market data</text>}
              </svg>
              <div className="absolute left-3 top-3 rounded-lg border border-white/10 bg-black/30 p-2.5 text-sm backdrop-blur sm:p-3">
                <div className="max-w-48 truncate text-xs text-gray-400">{assetLabel(asset)} · {activeTimeframe} · {durationTicks}s</div>
                <div className="mt-1 text-xl font-black sm:text-2xl">{formatActivePrice(tick?.price)}</div>
              </div>
              {!isForexMode && (
                <div className="absolute bottom-3 right-3 rounded-full border border-brand/30 bg-black/35 px-3 py-1.5 text-xs font-black text-brand backdrop-blur">
                  Index D{selectedDigit}
                </div>
              )}
            </div>
          </div>
          {!isForexMode && (
            <div className="rounded-lg border border-white/10 bg-[#0f141d] p-3 min-[600px]:shrink-0 min-[600px]:p-2 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3 min-[600px]:mb-2">
                <h2 className="font-black">Digits</h2>
                <span className="text-xs font-semibold text-gray-500">D{selectedDigit}</span>
              </div>
              <div className="mb-3 grid grid-cols-3 gap-1.5 text-center text-[10px] min-[600px]:mb-2 min-[600px]:grid-cols-6">
                {[
                  ["Now", tick?.lastDigit !== undefined ? `D${tick.lastDigit}` : "-"],
                  ["Hot", `D${digitMeasures.hot.digit} ${digitMeasures.hot.percentage.toFixed(0)}%`],
                  ["Cold", `D${digitMeasures.cold.digit} ${digitMeasures.cold.percentage.toFixed(0)}%`],
                  ["Even", `${digitMeasures.evenShare.toFixed(0)}%`],
                  ["Odd", `${digitMeasures.oddShare.toFixed(0)}%`],
                  [`>${selectedDigit}`, `${digitMeasures.aboveShare.toFixed(0)}%`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-full border border-white/10 bg-white/5 px-2 py-1.5">
                    <div className="truncate font-black text-gray-500">{label}</div>
                    <div className="truncate text-xs font-black text-white">{value}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2 min-[600px]:grid-cols-10 min-[600px]:gap-1">
                {digitStats.map(({ digit, count, percentage }) => {
                  const isCurrentDigit = tick?.lastDigit === digit;
                  const isHotDigit = digitMeasures.hot.digit === digit && digitMeasures.total > 0;
                  const isColdDigit = digitMeasures.cold.digit === digit && digitMeasures.total > 0;
                  return (
                    <div
                      key={digit}
                      aria-label={`Digit ${digit}: ${percentage.toFixed(1)} percent, ${count} samples`}
                      className={`relative grid aspect-square min-h-14 place-items-center overflow-hidden rounded-full border p-1 text-center min-[600px]:min-h-11 ${isCurrentDigit ? "border-brand bg-brand/20 ring-2 ring-brand" : isHotDigit ? "border-emerald-400/50 bg-emerald-400/10" : isColdDigit ? "border-rose-400/50 bg-rose-400/10" : "border-white/10 bg-white/5"}`}
                    >
                      <span className="relative z-[1] block leading-none">
                        <span className="block text-lg font-black min-[600px]:text-base">{digit}</span>
                        <span className="mt-0.5 block text-[10px] font-bold text-gray-400">{count ? `${percentage.toFixed(0)}%` : "-"}</span>
                        <span className="block text-[9px] font-bold text-gray-500">{count}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-gray-500">
                <span>n {digitMeasures.total}</span>
                <span>&lt;{selectedDigit}: {digitMeasures.belowShare.toFixed(0)}%</span>
                <span>D{selectedDigit}</span>
              </div>
            </div>
          )}
        </section>

        <aside className="order-2 min-w-0 space-y-3 min-[600px]:order-1 min-[600px]:flex min-[600px]:h-full min-[600px]:flex-col min-[600px]:space-y-2 min-[600px]:self-stretch min-[600px]:overflow-hidden xl:col-start-1 xl:row-start-1">
          <div className="hidden min-h-0 min-[600px]:block min-[600px]:flex-1 xl:block">
            <ActivityPanel
              activeTab={activityTab}
              completedPositions={completedPositions}
              openPositions={openPositions}
              transactions={transactions}
              setActiveTab={setActivityTab}
            />
          </div>
          {lastTradeOutcome && <TradeOutcomeCard key={lastTradeOutcome.id} outcome={lastTradeOutcome} />}
          <div className="hidden shrink-0 rounded-lg border border-white/10 bg-[#0f141d] p-3 min-[600px]:grid min-[600px]:gap-2">
            <div className="text-xs font-black uppercase tracking-wide text-gray-500">Session</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0 rounded-lg bg-white/5 p-2">
                <div className="truncate text-[10px] font-black uppercase tracking-wide text-gray-500">P/L</div>
                <div className={`mt-1 truncate text-sm font-black ${sessionProfitLoss >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{moneyLabel(sessionProfitLoss, true)}</div>
              </div>
              <div className="min-w-0 rounded-lg bg-white/5 p-2">
                <div className="truncate text-[10px] font-black uppercase tracking-wide text-gray-500">Open</div>
                <div className="mt-1 truncate text-sm font-black text-white">{openPositions.length}</div>
              </div>
            </div>
          </div>
        </aside>

        <aside className="order-3 min-w-0 min-[600px]:flex min-[600px]:h-full min-[600px]:self-stretch min-[600px]:overflow-hidden xl:col-start-3 xl:row-start-1">
          <div className="flex min-h-0 w-full flex-col rounded-lg border border-white/10 bg-[#0f141d] text-white shadow-xl shadow-black/20 min-[600px]:h-full">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-1.5 border-b border-white/10 p-1.5 min-[900px]:p-2">
              <button onClick={() => switchAccount(false)} className="flex min-w-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-1 text-left shadow-sm">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand text-sm font-black text-ink">{user.is_demo ? "D" : "R"}</span>
                <span className="min-w-0">
                  <span className="block truncate text-base font-black text-brand">${Number(user.active_balance).toFixed(2)}</span>
                </span>
                <ChevronDown size={15} className="shrink-0 text-gray-400" />
              </button>
              <button onClick={() => { setWalletSection("deposit"); setWalletOpen(true); }} className="h-9 rounded-xl bg-brand px-3 text-sm font-black text-ink shadow-lg shadow-brand/20">Deposit</button>
              <button aria-label="Open notifications" onClick={() => setChatOpen(true)} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"><Bell size={18} /></button>
              <button aria-label="Open profile" onClick={() => { location.href = "/settings"; }} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"><CircleUserRound size={19} /></button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden p-1.5 min-[900px]:p-2">
              <div>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <h2 className="text-xs font-black uppercase tracking-wide text-gray-400">Mode</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-gray-500">
                      {isForexMode
                        ? mode === "auto" ? isAutoRunning ? "Running" : "Ready" : "Manual"
                        : mode === "auto" ? isAutoRunning ? "Running" : "Ready" : "Manual"}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-0.5">
                  <button onClick={() => selectTradeMode("auto")} className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide ${mode === "auto" ? "bg-brand text-ink shadow-sm" : "text-gray-300 hover:bg-white/5"}`}>Auto</button>
                  <button onClick={() => selectTradeMode("manual")} className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide ${mode === "manual" ? "bg-brand text-ink shadow-sm" : "text-gray-300 hover:bg-white/5"}`}>Manual</button>
                </div>
                {aiAppliedConfig && !isForexAsset(aiAppliedConfig.asset) && (
                  <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl border border-brand/20 bg-brand/10 px-2 py-1 text-[11px]">
                    <span className="truncate font-black text-brand">AI {directionLabel(aiAppliedConfig.direction, aiAppliedConfig.asset)}</span>
                    <span className="truncate font-semibold text-gray-400">{assetLabel(aiAppliedConfig.asset)} · {Math.round(aiAppliedConfig.confidence * 100)}%</span>
                  </div>
                )}
              </div>

              {!isForexMode && (
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    ["evenOdd", "Even / Odd"],
                    ["matchDiffer", "Match / Differ"],
                    ["overUnder", "Over / Under"],
                  ] as const).map(([id, label]) => (
                    <button key={id} onClick={() => selectContractGroup(id)} className={`min-h-9 rounded-xl border px-1.5 text-[11px] font-black ${contractGroup === id ? "border-brand bg-brand text-ink shadow-sm" : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"}`}>{label}</button>
                  ))}
                </div>
              )}

              <div>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-black uppercase tracking-wide text-gray-400">{isForexMode ? "Margin" : "Stake"}</h3>
                  {!isForexMode && (
                    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-white/10 bg-white/5 text-xs font-black">
                      <button onClick={() => setAmountMode("stake")} className={`px-2.5 py-1 ${amountMode === "stake" ? "bg-brand text-ink" : "text-gray-400"}`}>Stake</button>
                      <button onClick={() => setAmountMode("payout")} className={`px-2.5 py-1 ${amountMode === "payout" ? "bg-brand text-ink" : "text-gray-400"}`}>Payout</button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-[34px_1fr_34px] items-center rounded-2xl border border-white/10 bg-[#0b0f16] p-1 min-[900px]:grid-cols-[36px_1fr_36px]">
                  <button aria-label="Decrease amount" onClick={() => adjustTicketAmount(-1)} className="grid h-8 place-items-center rounded-xl text-brand"><Minus size={21} /></button>
                  <label className="flex items-center justify-center gap-2 text-center">
                    <span className="text-lg font-black text-brand">$</span>
                    <input
                      className="w-20 bg-transparent text-center text-xl font-black leading-none text-white outline-none min-[900px]:w-24"
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={Number(displayedTicketAmount.toFixed(2))}
                      onChange={(event) => setTicketAmount(Number(event.target.value))}
                      aria-label={isForexMode ? "Margin amount" : amountMode === "stake" ? "Stake amount" : "Payout amount"}
                    />
                  </label>
                  <button aria-label="Increase amount" onClick={() => adjustTicketAmount(1)} className="grid h-8 place-items-center rounded-xl text-brand"><Plus size={21} /></button>
                </div>

                {mode === "manual" && (
                  <>
                    <div className="mt-1.5 grid grid-cols-6 gap-1">
                      {quickStakeAmounts.map((amount) => (
                        <button key={amount} type="button" onClick={() => { setAmountMode("stake"); setStake(amount); }} className={`min-h-7 rounded-lg border text-[11px] font-black ${stake === amount ? "border-brand bg-brand/15 text-brand" : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"}`}>${amount}</button>
                      ))}
                    </div>

                    <div className="mt-1.5 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
                      <span className="text-xs font-black text-gray-400">{isForexMode ? "Return" : "Payout"}</span>
                      <span className="text-lg font-black text-white">${primaryPayout.toFixed(2)} <span className="text-[10px] font-black text-gray-500">USD</span></span>
                    </div>
                  </>
                )}
                {showDigitSelector ? (
                  <div className="mt-1.5 rounded-xl border border-white/10 bg-white/5 p-1.5">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wide text-gray-500">Digit</span>
                      <span className="text-[11px] font-black text-brand">D{selectedDigit}</span>
                    </div>
                    <div className="grid grid-cols-10 gap-1">
                      {digitOptions.map((digit) => (
                        <button
                          key={digit}
                          type="button"
                          aria-pressed={selectedDigit === digit}
                          onClick={() => setSelectedDigit(digit)}
                          className={`grid aspect-square min-h-6 place-items-center rounded-full border text-[10px] font-black ${selectedDigit === digit ? "border-brand bg-brand text-ink shadow-sm" : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"}`}
                        >
                          {digit}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {mode === "auto" && (
                <div className="grid grid-cols-3 gap-1.5">
                  <label className="rounded-xl border border-white/10 bg-white/5 p-1.5">
                    <span className="mb-0.5 flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-emerald-500"><Target size={12} /> Profit</span>
                    <span className="flex items-center gap-1.5 rounded-lg bg-black/20 px-2 py-1">
                      <span className="text-gray-500">$</span>
                      <input className="w-full bg-transparent text-center text-base font-black text-white outline-none" type="number" value={targetProfit} onChange={(e) => setTargetProfit(Number(e.target.value))} />
                    </span>
                  </label>
                  <label className="rounded-xl border border-white/10 bg-white/5 p-1.5">
                    <span className="mb-0.5 flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-rose-500"><AlertTriangle size={12} /> Loss</span>
                    <span className="flex items-center gap-1.5 rounded-lg bg-black/20 px-2 py-1">
                      <span className="text-gray-500">$</span>
                      <input className="w-full bg-transparent text-center text-base font-black text-white outline-none" type="number" value={targetLoss} onChange={(e) => setTargetLoss(Number(e.target.value))} />
                    </span>
                  </label>
                  <label className="rounded-xl border border-white/10 bg-white/5 p-1.5">
                    <span className="mb-0.5 flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-amber-500"><TrendingUp size={12} /> Trades</span>
                    <span className="flex items-center gap-1.5 rounded-lg bg-black/20 px-2 py-1">
                      <span className="text-gray-500">#</span>
                      <input className="w-full bg-transparent text-center text-base font-black text-white outline-none" type="number" value={maxTrades} onChange={(e) => setMaxTrades(Number(e.target.value))} />
                    </span>
                  </label>
                </div>
              )}

              {isForexMode ? (
                <div className="mt-auto grid gap-1.5 border-t border-white/10 pt-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      { direction: "over" as Direction, label: "Buy", icon: ArrowUp, tone: "emerald" as const },
                      { direction: "under" as Direction, label: "Sell", icon: ArrowDown, tone: "rose" as const },
                    ]).map((action) => {
                      const Icon = action.icon;
                      const isBuy = action.tone === "emerald";
                      const label = tradeButtonLabel(action.label, action.direction);
                      return (
                        <button
                          key={action.direction}
                          disabled={isTradeButtonDisabled(action.direction)}
                          onClick={() => place(action.direction)}
                          className={`min-h-12 rounded-2xl border p-2 text-left font-black text-white disabled:cursor-not-allowed disabled:opacity-50 ${isBuy ? "border-emerald-400/35 bg-emerald-400/10" : "border-rose-400/35 bg-rose-400/10"}`}
                        >
                          <span className="mb-1 flex items-center gap-2 text-sm">
                            <Icon className={isBuy ? "text-emerald-400" : "text-rose-400"} size={18} />
                            <span>{label}</span>
                          </span>
                          <span className="block text-right text-[11px] text-gray-400">${forexQuote.notional.toFixed(2)}</span>
                          <span className="block text-right text-[11px] text-gray-400">+${forexProfit.toFixed(2)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mt-auto grid gap-1.5 border-t border-white/10 pt-1.5">
                  {contractActions.map((action) => {
                    const Icon = action.icon;
                    const profitPercent = stake > 0 ? ((action.payout / stake - 1) * 100).toFixed(2) : "0.00";
                    const isGreen = action.tone === "green";
                    const actionLabel = tradeButtonLabel(action.label, action.direction);
                    return (
                      <button
                        key={action.direction}
                        disabled={isTradeButtonDisabled(action.direction, action.disabled)}
                        onClick={() => place(action.direction)}
                        className={`grid min-h-11 grid-cols-[34px_1fr_auto] items-center gap-2 rounded-xl border p-1.5 text-left disabled:cursor-not-allowed disabled:opacity-50 ${isGreen ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-400" : "border-rose-400/35 bg-rose-400/10 text-rose-400"}`}
                      >
                        <span className={`grid h-8 w-8 place-items-center rounded-lg ${isGreen ? "bg-emerald-400/15" : "bg-rose-400/15"}`}><Icon size={19} /></span>
                        <span className="text-sm font-black text-white">{actionLabel}</span>
                        <span className="text-right">
                          <span className="block text-[11px] font-black text-gray-300">${action.payout.toFixed(2)} USD</span>
                          <span className={`block text-xs font-black ${isGreen ? "text-emerald-500" : "text-rose-500"}`}>{profitPercent}%</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {message && <div className="max-h-10 overflow-hidden rounded-xl border border-brand/20 bg-brand/10 p-2 text-xs font-semibold leading-tight text-gray-200">{message}</div>}
            </div>
          </div>
        </aside>

        <section className="order-4 min-w-0 min-[600px]:hidden">
          <ActivityPanel
            activeTab={activityTab}
            completedPositions={completedPositions}
            openPositions={openPositions}
            transactions={transactions}
            setActiveTab={setActivityTab}
          />
        </section>
      </div>

      {walletOpen && <WalletDrawer initialSection={walletSection} token={token} user={user} transactions={transactions} referral={referral} onRefresh={() => token ? load(token, user.is_demo) : Promise.resolve()} onClose={() => { setWalletOpen(false); token && load(token, user.is_demo); }} />}
      {aiOpen && (
        <AiTradeScanner
          activeAsset={asset}
          balance={Number(user.active_balance) || 0}
          currentTick={tick}
          selectedDigit={selectedDigit}
          onApply={applyAiConfig}
          onClose={() => setAiOpen(false)}
        />
      )}
      {chatOpen && <ChatDrawer token={token} asset={assetLabel(asset)} tick={tick} onClose={() => setChatOpen(false)} />}
    </main>
  );
}

function AiTradeScanner({ activeAsset, balance, currentTick, selectedDigit, onApply, onClose }: { activeAsset: string; balance: number; currentTick: Tick | null; selectedDigit: number; onApply: (config: AiRecommendation) => void; onClose: () => void }) {
  const [scope, setScope] = useState<AiScanScope>(isForexAsset(activeAsset) ? "forex" : "volatility");
  const [risk, setRisk] = useState<AiRisk>("balanced");
  const [recommendation, setRecommendation] = useState<AiRecommendation | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  async function loadTick(candidateAsset: string) {
    if (candidateAsset === activeAsset && currentTick?.asset === candidateAsset) return currentTick;
    const data = await fetchJson<{ tick?: Tick }>(`/api/market/tick?asset=${encodeURIComponent(candidateAsset)}`, undefined, {});
    return data.tick ?? null;
  }

  async function scan() {
    setScanning(true);
    setError("");
    try {
      const candidates = scope === "forex" ? forexAssets : assets.filter((item) => !isForexAsset(item));
      const ticks = (await Promise.all(candidates.map(loadTick))).filter((item): item is Tick => Boolean(item));
      const ranked = ticks.map((item) => {
        const forex = isForexAsset(item.asset);
        const preset = riskPreset(risk, balance, forex);
        const decision = forex ? scoreForexTick(item) : scoreDigitTick(item, selectedDigit);
        return {
          scope,
          risk,
          mode: "auto",
          asset: item.asset,
          direction: decision.direction,
          selectedDigit: forex || !("selectedDigit" in decision) ? selectedDigit : decision.selectedDigit,
          contractGroup: contractGroupForDirection(decision.direction),
          timeframe: preset.timeframe,
          durationTicks: preset.durationTicks,
          stake: preset.stake,
          targetProfit: preset.targetProfit,
          targetLoss: preset.targetLoss,
          maxTrades: preset.maxTrades,
          leverage: forex ? preset.leverage : 1,
          confidence: decision.confidence,
          edge: decision.edge,
          score: decision.score,
          probability: decision.probability,
          reason: decision.reason,
          scannedCount: ticks.length,
          scannedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        } satisfies AiRecommendation;
      }).sort((left, right) => right.score - left.score);

      const best = ranked[0] ?? null;
      if (!best) {
        setError("No market data.");
        setRecommendation(null);
        return;
      }
      setRecommendation(best);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Scan failed.");
      setRecommendation(null);
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-auto rounded-2xl border border-white/10 bg-panel p-4 shadow-xl shadow-black/20 sm:p-5" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-black">AI Auto Setup</h2>
            <div className="mt-1 truncate text-xs text-gray-500">{recommendation ? `${recommendation.scannedCount} markets · ${recommendation.scannedAt}` : "Choose a market and scan"}</div>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-bold text-gray-400 hover:bg-white/5 hover:text-white">Close</button>
        </div>

        <div className="grid gap-3">
          <SegmentedControl
            label="Market"
            value={scope}
            options={[
              ["volatility", "Volatility"],
              ["forex", "Forex"],
            ]}
            onChange={(value) => setScope(value as AiScanScope)}
          />
          <SegmentedControl
            label="Risk"
            value={risk}
            options={[
              ["low", "Low"],
              ["balanced", "Balanced"],
              ["aggressive", "Aggressive"],
            ]}
            onChange={(value) => setRisk(value as AiRisk)}
          />
        </div>

        <button onClick={scan} disabled={scanning} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 font-black disabled:cursor-wait disabled:opacity-70">
          <Bot size={17} /> {scanning ? "Scanning..." : `Scan ${scope === "forex" ? "Forex" : "Volatility"}`}
        </button>

        {error && <div className="mt-3 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm font-semibold text-rose-300">{error}</div>}

        {recommendation && (
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-brand/25 bg-brand/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-wide text-gray-500">Best Setup</div>
                  <div className="mt-1 truncate text-2xl font-black">{assetLabel(recommendation.asset)}</div>
                  <div className="mt-1 text-sm font-bold text-brand">{directionLabel(recommendation.direction, recommendation.asset)} · AUTO</div>
                </div>
                <div className="rounded-full bg-black/20 px-3 py-2 text-sm font-black text-brand">{Math.round(recommendation.confidence * 100)}%</div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <AiMetric label="Stake" value={`$${recommendation.stake.toFixed(2)}`} />
                <AiMetric label="Time" value={recommendation.timeframe} />
                <AiMetric label={isForexAsset(recommendation.asset) ? "Lev" : "Edge"} value={isForexAsset(recommendation.asset) ? `${recommendation.leverage}x` : `${(recommendation.edge * 100).toFixed(1)}%`} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <AiMetric label="Profit" value={`$${recommendation.targetProfit.toFixed(2)}`} />
              <AiMetric label="Loss" value={`$${recommendation.targetLoss.toFixed(2)}`} />
              <AiMetric label="Trades" value={recommendation.maxTrades} />
              <AiMetric label="Signal" value={recommendation.reason} />
            </div>

            <button onClick={() => onApply(recommendation)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 font-black text-brand hover:bg-brand/15">
              Load to Auto Trade
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SegmentedControl({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <div>
      <div className="mb-1 text-xs font-black uppercase tracking-wide text-gray-500">{label}</div>
      <div className="grid gap-1 rounded-xl bg-white/5 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map(([id, optionLabel]) => (
          <button key={id} onClick={() => onChange(id)} className={`rounded-lg px-2 py-2 text-xs font-black ${value === id ? "bg-brand text-ink" : "text-gray-300 hover:bg-white/5"}`}>{optionLabel}</button>
        ))}
      </div>
    </div>
  );
}

function AiMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/5 p-2">
      <div className="truncate text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 truncate font-black text-white">{value}</div>
    </div>
  );
}

function TradeOutcomeCard({ outcome }: { outcome: TradeOutcome }) {
  const isProfit = outcome.profitLoss >= 0;
  return (
    <div className={`trade-outcome-slide-card hidden shrink-0 rounded-lg border p-3 shadow-lg shadow-black/20 min-[600px]:block ${isProfit ? "border-emerald-400/35 bg-emerald-400/10" : "border-rose-400/35 bg-rose-400/10"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-wide text-gray-500">Last trade</div>
          <div className="mt-1 truncate text-sm font-black text-white">{assetLabel(outcome.asset)}</div>
          <div className="mt-0.5 truncate text-[11px] font-semibold text-gray-400">{outcome.detail}</div>
        </div>
        <div className={`shrink-0 text-right text-lg font-black ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
          {moneyLabel(outcome.profitLoss, true)}
          <div className="text-[10px] font-black uppercase tracking-wide text-gray-500">{isProfit ? "Profit" : "Loss"}</div>
        </div>
      </div>
    </div>
  );
}

function ActivityPanel({ activeTab, completedPositions, openPositions, transactions, setActiveTab }: { activeTab: ActivityTab; completedPositions: any[]; openPositions: any[]; transactions: any[]; setActiveTab: (tab: ActivityTab) => void }) {
  const tabs = [
    ["open", `Open (${openPositions.length})`],
    ["closed", `Closed (${completedPositions.length})`],
    ["transactions", `Transactions (${transactions.length})`],
  ] as const;

  return (
    <div className="rounded-lg border border-white/10 bg-[#0f141d] p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-black">Positions</h2>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-white/5 p-1 text-[10px] font-bold min-[900px]:text-[11px]">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} className={`rounded-md px-2 py-2 ${activeTab === id ? "bg-brand !text-ink" : "text-gray-300 hover:bg-white/5"}`}>{label}</button>
        ))}
      </div>
      <div className="max-h-72 space-y-2 overflow-auto pr-1">
        {activeTab === "open" && (
          <>
            {openPositions.length === 0 && <EmptyActivity label="No open." />}
            {openPositions.slice(0, 12).map((position) => <PositionRow key={position.id} position={position} />)}
          </>
        )}
        {activeTab === "closed" && (
          <>
            {completedPositions.length === 0 && <EmptyActivity label="No closed." />}
            {completedPositions.slice(0, 12).map((position) => <PositionRow key={position.id} position={position} />)}
          </>
        )}
        {activeTab === "transactions" && (
          <>
            {transactions.length === 0 && <EmptyActivity label="No transactions." />}
            {transactions.slice(0, 14).map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}
          </>
        )}
      </div>
    </div>
  );
}

function moneyLabel(value: unknown, signed = false) {
  const amount = Number(value ?? 0);
  const sign = signed && amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

function contractValue(stake: number, profitLoss: number, isOpen: boolean) {
  return isOpen ? stake : Math.max(0, stake + profitLoss);
}

function ActivityMetric({ label, compactLabel, value, tone = "text-gray-100" }: { label: string; compactLabel?: string; value: string; tone?: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-black/15 px-2 py-1.5 min-[900px]:block">
      <div className="truncate text-[9px] font-black uppercase leading-none text-gray-500">
        <span className="min-[900px]:hidden">{compactLabel ?? label}</span>
        <span className="hidden min-[900px]:inline">{label}</span>
      </div>
      <div className={`shrink-0 truncate text-[11px] font-black leading-tight min-[900px]:mt-1 ${tone}`}>{value}</div>
    </div>
  );
}

function PositionRow({ position }: { position: any }) {
  const isOpen = position.status === "open";
  const isForex = position.trade_type === "forex" || position.trade_type === "futures";
  const isEvenOdd = position.trade_type === "even_odd";
  const side = isForex ? (position.direction === "over" ? "BUY" : "SELL") : position.direction?.toUpperCase();
  const stake = Number(position.stake ?? 0);
  const profitLoss = Number(position.profit_loss ?? 0);
  const payout = Number(position.potential_payout ?? 0);
  const isWinningResult = !isOpen && (position.status === "won" || profitLoss > 0);
  const rowTone = isOpen
    ? "border-amber-300/40 bg-amber-300/10 ring-1 ring-inset ring-amber-300/25"
    : isWinningResult
      ? "border-emerald-400/40 bg-emerald-400/10 ring-1 ring-inset ring-emerald-400/25"
      : "border-rose-400/40 bg-rose-400/10 ring-1 ring-inset ring-rose-400/25";
  const plTone = isOpen ? "text-amber-300" : isWinningResult ? "text-emerald-400" : "text-rose-400";
  const value = contractValue(stake, profitLoss, isOpen);
  const detail = isForex
    ? `${side} forex - ${position.current_tick}/${position.ticks}s`
    : isEvenOdd
      ? `${side} - ${position.current_tick}/${position.ticks}s`
      : `${side} - digit ${position.selected_digit} - ${position.current_tick}/${position.ticks}s`;
  return (
    <div className={`rounded-xl border p-3 text-xs ${rowTone}`}>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="min-w-0">
          <div className="truncate font-bold">{assetLabel(position.asset)}</div>
          <div className="mt-1 truncate text-gray-500">{detail}</div>
        </div>
        <div className={`text-right font-black ${plTone}`}>
          {isOpen ? "OPEN" : moneyLabel(profitLoss, true)}
          {!isOpen && <div className="text-[10px] text-white/50">{isForex ? `closed - exit ${Number(position.exit_price ?? 0).toFixed(5)}` : `closed - exit ${position.exit_digit}`}</div>}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-1.5 min-[900px]:grid-cols-2">
        <ActivityMetric label="Stake" value={moneyLabel(stake)} />
        <ActivityMetric label="Total P/L" compactLabel="P/L" value={moneyLabel(profitLoss, true)} tone={plTone} />
        <ActivityMetric label="Contract Value" compactLabel="Contract" value={moneyLabel(value)} />
        <ActivityMetric label="Potential Payout" compactLabel="Payout" value={moneyLabel(payout)} />
      </div>
    </div>
  );
}

function EmptyActivity({ label }: { label: string }) {
  return <div className="rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-gray-400">{label}</div>;
}

function TransactionRow({ transaction }: { transaction: any }) {
  const amount = Number(transaction.amount ?? 0);
  const isCredit = amount >= 0;
  const stake = Number(transaction.linked_stake ?? transaction.position_stake ?? 0);
  const hasTradePosition = Boolean(transaction.position_id || transaction.asset || transaction.position_stake || transaction.linked_stake);
  const profitLoss = hasTradePosition ? Number(transaction.linked_profit_loss ?? transaction.profit_loss ?? 0) : 0;
  const isOpen = transaction.linked_position_status === "open";
  const value = hasTradePosition ? contractValue(stake, profitLoss, isOpen) : Math.abs(amount);
  const payout = hasTradePosition ? Number(transaction.linked_potential_payout ?? 0) : 0;
  return (
    <div className="rounded-xl bg-white/5 p-3 text-xs">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="min-w-0">
          <div className="truncate font-bold">{transaction.description ?? transaction.type ?? "Transaction"}</div>
          <div className="mt-1 truncate text-gray-500">{transaction.created_at ?? transaction.createdAt ?? ""}</div>
        </div>
        <div className={`text-right font-black ${isCredit ? "text-emerald-400" : "text-rose-400"}`}>
          {moneyLabel(amount, true)}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-1.5 min-[900px]:grid-cols-2">
        <ActivityMetric label="Stake" value={moneyLabel(stake)} />
        <ActivityMetric label="Total P/L" compactLabel="P/L" value={moneyLabel(profitLoss, true)} tone={profitLoss >= 0 ? "text-emerald-400" : "text-rose-400"} />
        <ActivityMetric label="Contract Value" compactLabel="Contract" value={moneyLabel(value)} />
        <ActivityMetric label="Potential Payout" compactLabel="Payout" value={moneyLabel(payout)} />
      </div>
    </div>
  );
}

function WalletDrawer({ initialSection, token, user, transactions, referral, onRefresh, onClose }: { initialSection: "history" | "deposit" | "withdraw" | "referrals"; token: string | null; user: User; transactions: any[]; referral: any; onRefresh: () => Promise<void>; onClose: () => void }) {
  const [section, setSection] = useState(initialSection);
  const [amount, setAmount] = useState(25);
  const [phone, setPhone] = useState(user.mpesa_phone ?? "");
  const [wallet, setWallet] = useState("");
  const [notice, setNotice] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [depositMethod, setDepositMethod] = useState<"mpesa" | "paystack" | "card" | "trc20">("mpesa");
  const [withdrawMethod, setWithdrawMethod] = useState<"mpesa" | "trc20">("mpesa");
  const [deposits, setDeposits] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [trc20Address, setTrc20Address] = useState("");
  const [exchangeRate, setExchangeRate] = useState(129.09);

  async function loadPayments() {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const [depositData, withdrawalData, addressData, rateData] = await Promise.all([
      fetchJson<{ deposits: any[] }>("/api/auth/deposits", { headers }, { deposits: [] }).catch(() => ({ deposits: [] })),
      fetchJson<{ withdrawals: any[] }>("/api/withdrawals/history", { headers }, { withdrawals: [] }).catch(() => ({ withdrawals: [] })),
      fetchJson<{ address: string }>("/api/auth/trc20/my-address", { headers }, { address: "" }).catch(() => ({ address: "" })),
      fetchJson<{ rate: number }>("/api/auth/exchange-rate", { headers }, { rate: 129.09 }).catch(() => ({ rate: 129.09 })),
    ]);
    setDeposits(depositData.deposits ?? []);
    setWithdrawals(withdrawalData.withdrawals ?? []);
    setTrc20Address(addressData.address ?? "");
    setExchangeRate(Number(rateData.rate ?? 129.09));
  }

  useEffect(() => {
    loadPayments().catch(() => undefined);
  }, [token]);

  async function post(url: string, body: Record<string, unknown>) {
    if (!token) return;
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const data = await readJson<any>(response, {});
    setNotice(data.message ?? data.error ?? (data.success ? "Request submitted" : "Updated"));
    setCheckoutUrl(data.checkoutUrl ?? "");
    if (response.ok) {
      await onRefresh();
      await loadPayments();
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="ml-auto h-full w-full max-w-md overflow-auto bg-panel p-4 sm:p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">Trader's Hub</h2><button onClick={onClose}>Close</button></div>
        <div className="mb-5 grid grid-cols-2 gap-2 text-xs font-bold sm:grid-cols-4">
          {(["deposit", "withdraw", "history", "referrals"] as const).map((item) => (
            <button key={item} onClick={() => setSection(item)} className={`rounded-lg px-2 py-2 capitalize ${section === item ? "bg-brand" : "bg-white/5"}`}>{item}</button>
          ))}
        </div>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="glass rounded-2xl p-4"><div className="text-xs text-gray-500">Real Account</div><div className="text-xl font-black sm:text-2xl">${user.real_balance.toFixed(2)}</div></div>
          <div className="glass rounded-2xl p-4"><div className="text-xs text-gray-500">Demo Account</div><div className="text-xl font-black sm:text-2xl">${user.demo_balance.toFixed(2)}</div></div>
        </div>
        {(section === "deposit" || section === "withdraw") && (
          <div className="mb-4 grid gap-3">
            <label className="block text-sm font-medium">Amount (USD)<input className="field mt-2" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></label>
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-xl bg-white/5 p-3"><div className="text-gray-500">KES estimate</div><div className="font-black">KES {(amount * exchangeRate).toFixed(0)}</div></div>
              <div className="rounded-xl bg-white/5 p-3"><div className="text-gray-500">Rate</div><div className="font-black">{exchangeRate.toFixed(2)}</div></div>
              <div className="rounded-xl bg-white/5 p-3"><div className="text-gray-500">Mode</div><div className="font-black">Sandbox/live ready</div></div>
            </div>
          </div>
        )}
        {section === "deposit" && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2 text-xs font-bold sm:grid-cols-4">
              {(["mpesa", "paystack", "card", "trc20"] as const).map((item) => (
                <button key={item} onClick={() => setDepositMethod(item)} className={`rounded-lg px-2 py-2 uppercase ${depositMethod === item ? "bg-brand" : "bg-white/5"}`}>{item}</button>
              ))}
            </div>
            {depositMethod === "mpesa" && <label className="mb-4 block text-sm font-medium">M-Pesa phone<input className="field mt-2" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712345678 or 254712345678" /></label>}
            {depositMethod === "trc20" && (
              <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500">TRC20 deposit address</div>
                <div className="mt-2 break-all font-mono text-sm text-brand">{trc20Address || "Loading address..."}</div>
                <button onClick={() => trc20Address && navigator.clipboard?.writeText(trc20Address).then(() => setNotice("TRC20 address copied"))} className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold">Copy address</button>
              </div>
            )}
            <div className="mb-5 grid gap-3">
              {depositMethod === "mpesa" && <button onClick={() => post("/api/auth/mpesa/stk-push", { amount, phone })} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 font-bold"><Smartphone size={16} /> Send M-Pesa STK Push</button>}
              {depositMethod === "paystack" && <button onClick={() => post("/api/auth/paystack/initialize", { amount })} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 font-bold"><CreditCard size={16} /> Pay with Paystack</button>}
              {depositMethod === "card" && <button onClick={() => post("/api/auth/card/deposit", { amount })} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 font-bold"><CreditCard size={16} /> Sandbox Card Credit</button>}
              {depositMethod === "trc20" && <div className="rounded-xl bg-white/5 p-3 text-sm text-gray-300">Crypto deposits are reviewed before crediting. Send testnet funds only, then contact support with the transaction reference.</div>}
            </div>
          </>
        )}
        {section === "withdraw" && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2 text-xs font-bold">
              {(["mpesa", "trc20"] as const).map((item) => (
                <button key={item} onClick={() => setWithdrawMethod(item)} className={`rounded-lg px-2 py-2 uppercase ${withdrawMethod === item ? "bg-brand" : "bg-white/5"}`}>{item}</button>
              ))}
            </div>
            {withdrawMethod === "mpesa" && <label className="mb-4 block text-sm font-medium">M-Pesa phone<input className="field mt-2" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712345678 or 254712345678" /></label>}
            {withdrawMethod === "trc20" && <label className="mb-4 block text-sm font-medium">TRC20 wallet for withdrawal<input className="field mt-2" value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="T..." /></label>}
            <button onClick={() => post("/api/withdrawals/submit", { amount, method: withdrawMethod, walletAddress: withdrawMethod === "trc20" ? wallet : phone })} className="mb-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 font-bold"><Banknote size={16} /> Submit Withdrawal</button>
          </>
        )}
        {notice && <div className="mb-5 rounded-xl bg-white/5 p-3 text-sm text-gray-300">{notice}{checkoutUrl && <a className="mt-2 block font-bold text-brand" href={checkoutUrl} target="_blank">Open checkout</a>}</div>}
        {section === "referrals" && (
          <div className="mb-5 glass rounded-2xl p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-bold">Referrals</h3>
              <button aria-label="Copy referral link" onClick={() => referral?.referralLink && navigator.clipboard?.writeText(referral.referralLink).then(() => setNotice("Referral link copied"))}><Copy size={16} /></button>
            </div>
            <div className="break-all text-sm text-gray-300">{referral?.referralLink ?? "Loading referral link..."}</div>
            <div className="mt-3 text-sm text-gray-400">Total referrals: {referral?.totalReferrals ?? 0} - Earned: ${Number(referral?.totalEarned ?? 0).toFixed(2)}</div>
          </div>
        )}
        {section === "history" && (
          <>
            <h3 className="mb-3 font-bold">Transaction History</h3>
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <PaymentMiniList title="Deposits" rows={deposits} />
              <PaymentMiniList title="Withdrawals" rows={withdrawals} />
            </div>
            <div className="space-y-2">
              {transactions.length === 0 && <div className="rounded-xl bg-white/5 p-3 text-sm text-gray-400">No transactions yet.</div>}
              {transactions.slice(0, 14).map((item) => (
                <div key={item.id} className="rounded-xl bg-white/5 p-3 text-sm"><div className="font-semibold">{item.description}</div><div className="text-xs text-gray-500">${Number(item.amount).toFixed(2)} - {item.created_at}</div></div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PaymentMiniList({ title, rows }: { title: string; rows: any[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-bold">{title}</h4>
        <span className="text-xs text-gray-500">{rows.length}</span>
      </div>
      <div className="max-h-44 space-y-2 overflow-auto">
        {rows.length === 0 && <div className="text-xs text-gray-500">No records yet.</div>}
        {rows.slice(0, 8).map((item) => (
          <div key={item.id} className="rounded-xl bg-black/20 p-2 text-xs">
            <div className="flex justify-between gap-2"><span className="font-bold">{String(item.method).toUpperCase()} ${Number(item.amount).toFixed(2)}</span><span className={item.status === "completed" ? "text-emerald-300" : item.status === "rejected" ? "text-rose-300" : "text-amber-300"}>{item.status}</span></div>
            <div className="mt-1 truncate text-gray-500">{item.reference ?? item.provider_reference ?? item.wallet_address ?? item.created_at}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatDrawer({ token, asset, tick, onClose }: { token: string | null; asset: string; tick: Tick | null; onClose: () => void }) {
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [priority, setPriority] = useState("Trading");
  const miniChartPoints = useMemo(() => {
    const history = (tick?.history ?? []).slice(-32);
    if (!history.length) return "";
    const prices = history.map((item) => item.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return history.map((item, index) => {
      const x = (index / Math.max(history.length - 1, 1)) * 220;
      const y = 70 - ((item.price - min) / Math.max(max - min, 1)) * 52;
      return `${x},${y}`;
    }).join(" ");
  }, [tick]);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    let activeConversationId = "";
    let cancelled = false;

    function loadMessages(id: string) {
      return fetchJson<{ messages: any[] }>(`/api/chat/messages/${id}`, { headers }, { messages: [] }).then((data) => {
        if (!cancelled) setMessages(data?.messages ?? []);
      }).catch(() => undefined);
    }

    fetchJson<{ conversation?: { id: string } }>("/api/chat/conversation", { headers }, {}).then((data) => {
      if (cancelled) return null;
      if (!data.conversation?.id) return null;
      activeConversationId = data.conversation.id;
      setConversationId(data.conversation.id);
      return loadMessages(data.conversation.id);
    }).catch(() => setMessages([]));

    const interval = setInterval(() => {
      if (activeConversationId) loadMessages(activeConversationId);
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  async function send(messageText = text) {
    if (!token || !conversationId || !messageText.trim()) return;
    const marketContext = `\n\nMarket: ${asset} | Mark: ${tick?.price?.toFixed(2) ?? "-"} | Last digit: ${tick?.lastDigit ?? "-"} | Category: ${priority}`;
    const response = await fetch("/api/chat/messages", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ conversationId, message: `${messageText}${marketContext}` }) });
    const data = await readJson<{ message?: any } | null>(response, null).catch(() => null);
    if (!data?.message) return;
    setMessages((items) => [...items, data.message]);
    setText("");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="ml-auto flex h-full w-full max-w-lg flex-col bg-panel p-4 sm:p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-black">Live Support Desk</h2>
            <p className="text-xs text-gray-500">Support replies sync automatically.</p>
          </div>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="mb-4 grid gap-3 rounded-2xl border border-white/10 bg-[#0b0f16] p-3 sm:p-4 md:grid-cols-[1fr_220px]">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Current chart</div>
            <div className="mt-1 text-xl font-black">{asset}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl bg-white/5 p-2"><div className="text-gray-500">Mark</div><div className="font-black">{tick?.price?.toFixed(2) ?? "-"}</div></div>
              <div className="rounded-xl bg-white/5 p-2"><div className="text-gray-500">Digit</div><div className="font-black text-brand">{tick?.lastDigit ?? "-"}</div></div>
              <div className="rounded-xl bg-white/5 p-2"><div className="text-gray-500">Move</div><div className={`font-black ${Number(tick?.movement ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{Number(tick?.movement ?? 0).toFixed(2)}</div></div>
            </div>
          </div>
          <svg viewBox="0 0 220 82" className="h-24 w-full rounded-xl bg-white/5">
            {Array.from({ length: 4 }).map((_, index) => <line key={index} x1="0" x2="220" y1={16 + index * 16} y2={16 + index * 16} stroke="rgba(255,255,255,.07)" />)}
            {miniChartPoints && <polyline points={miniChartPoints} fill="none" stroke="#FACC15" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {["Trading", "Deposit", "Withdrawal", "P2P", "Bot"].map((item) => (
            <button key={item} onClick={() => setPriority(item)} className={`rounded-lg px-3 py-2 text-xs font-bold ${priority === item ? "bg-brand !text-ink" : "bg-white/5 text-gray-300"}`}>{item}</button>
          ))}
        </div>
        <div className="mb-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          {["I need help with this live chart", "My trade result looks wrong", "Check my deposit status", "I need a payment review"].map((item) => (
            <button key={item} onClick={() => send(item)} className="rounded-xl bg-white/5 p-3 text-left font-bold text-gray-300 hover:bg-white/10">{item}</button>
          ))}
        </div>
        <div className="flex-1 space-y-3 overflow-auto rounded-2xl bg-[#0b0f16] p-4">
          {messages.map((item) => <div key={item.id} className={`rounded-2xl p-3 text-sm ${item.sender_type === "user" ? "ml-8 bg-brand !text-ink" : "mr-8 bg-white/10"}`}><div className="whitespace-pre-wrap">{item.message}</div><div className="mt-1 text-[10px] opacity-60">{item.sender_type}</div></div>)}
        </div>
        <div className="mt-4 grid gap-2 sm:flex">
          <input className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message support" />
          <button onClick={() => send()} className="rounded-xl bg-brand px-4 font-bold">Send</button>
        </div>
      </div>
    </div>
  );
}
