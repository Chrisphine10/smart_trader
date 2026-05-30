import Link from "next/link";
import { ArrowRight, Banknote, Bot, CandlestickChart, CreditCard, Database, Landmark, LockKeyhole, Radio, ShieldCheck, Wallet } from "lucide-react";
import { PublicNav } from "../components/public-nav";
import { PublicThemeShell } from "../components/public-theme-shell";

const markets = [
  ["BTC/USDT", "$67,428.20", "+2.34%", "$1.28B"],
  ["ETH/USDT", "$3,284.14", "+1.87%", "$842M"],
  ["SOL/USDT", "$172.42", "+5.67%", "$319M"],
  ["BNB/USDT", "$593.31", "-0.45%", "$210M"],
  ["XRP/USDT", "$0.6221", "+0.92%", "$176M"],
  ["DOGE/USDT", "$0.1488", "-1.08%", "$164M"],
  ["TRX/USDT", "$0.1224", "+0.41%", "$98M"],
  ["MATIC/USDT", "$0.7420", "+3.16%", "$74M"],
];

const productCards = [
  {
    title: "AI Market Workspace",
    body: "Monitor live crypto markets with AI-assisted signals, structured order flows, local matching, fees, fills, and balance updates.",
    icon: CandlestickChart,
  },
  {
    title: "AI Strategy Engine",
    body: "Run supervised grid, DCA, rebalancing, and forex risk strategies with budgets, guardrails, stop loss, and take profit controls.",
    icon: Radio,
  },
  {
    title: "P2P Escrow",
    body: "Create buy and sell ads, lock seller crypto, track payment proof, message counterparties, and resolve disputes with operational oversight.",
    icon: Landmark,
  },
  {
    title: "Ledger Wallets",
    body: "Manage spot, funding, and margin balances with deposits, withdrawals, transfers, audit trails, and testnet-first wallet addresses.",
    icon: Wallet,
  },
  {
    title: "Automation Controls",
    body: "Deploy AI-guided automation with human-reviewable limits, session tracking, account mode controls, and risk-aware execution.",
    icon: Bot,
  },
  {
    title: "Payment Operations",
    body: "Use sandbox M-Pesa Daraja, Paystack, card, TRC20, and manual review queues for controlled funding and payout workflows.",
    icon: CreditCard,
  },
];

const systemDetails = [
  ["AI decision support", "Market context, automation settings, and risk controls are presented for faster analysis and disciplined execution."],
  ["Live market adapter", "Binance-style ticker, kline, depth, and trade channels power real-time dashboards with fallback market data support."],
  ["Operations console", "Review KYC, payments, balances, P2P disputes, support chats, risk settings, assets, networks, and audit events."],
  ["Transparent ledger", "Balances, locks, transfers, deposits, withdrawals, escrow actions, and audit entries settle in a local source of truth."],
];

export default function HomePage() {
  return (
    <PublicThemeShell>
      <PublicNav />

      <section className="relative">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-[-220px] h-[680px] w-[680px] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
          <div className="absolute right-[-80px] top-[160px] h-[360px] w-[360px] rounded-full bg-mint/10 blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-6xl gap-8 px-5 pb-14 pt-14 md:grid-cols-[1fr_0.82fr] md:items-center md:pb-20 md:pt-24">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3.5 py-1.5 text-xs font-semibold text-brand">
              <ShieldCheck size={14} /> AI powered crypto trading, automation, P2P escrow, and operations
            </div>
            <h1 className="mb-6 max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-normal sm:text-5xl md:text-6xl">
              Hydra Trade AI powered platform for <span className="bg-gradient-to-br from-brand to-mint bg-clip-text text-transparent">crypto trading and automation</span>
            </h1>
            <p className="mb-8 max-w-2xl text-[15px] leading-relaxed text-gray-400 md:text-lg">
              An AI powered trading platform for live crypto markets, assisted strategy execution, simulated perpetuals, escrow-based peer exchange, sandbox payment rails, risk controls, and transparent ledger operations.
            </p>
            <div className="mb-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-7 py-3.5 text-[15px] font-semibold shadow-glow">
                Create Account <ArrowRight size={16} />
              </Link>
              <Link href="/trade" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-7 py-3.5 text-[15px] font-semibold hover:bg-white/5">
                Open AI Workspace <CandlestickChart size={16} />
              </Link>
            </div>
            <div className="grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["AI", "Signal support"],
                ["24/7", "Market access"],
                ["P2P", "Escrow flow"],
                ["Risk", "Guardrails"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="text-xl font-black text-brand">{value}</div>
                  <div className="text-xs text-gray-500">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <div className="font-bold">BTC/USDT Perpetual</div>
                <div className="text-xs text-gray-500">AI-assisted view, local settlement</div>
              </div>
              <div className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400">MARK PRICE</div>
            </div>
            <div className="relative h-72 p-4">
              <svg viewBox="0 0 640 260" className="h-full w-full">
                <defs>
                  <linearGradient id="heroChart" x1="0" x2="0" y1="0" y2="1">
                    <stop stopColor="#FACC15" stopOpacity=".5" />
                    <stop offset="1" stopColor="#FACC15" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0 196 C46 176 75 112 122 124 S210 174 266 118 352 44 424 76 492 154 552 96 615 62 640 74 L640 260 L0 260 Z" fill="url(#heroChart)" />
                <path d="M0 196 C46 176 75 112 122 124 S210 174 266 118 352 44 424 76 492 154 552 96 615 62 640 74" fill="none" stroke="#FACC15" strokeWidth="4" />
                {[80, 180, 300, 420, 540].map((x, index) => (
                  <g key={x}>
                    <line x1={x} x2={x} y1={80 + index * 8} y2={160 + index * 5} stroke={index % 2 ? "#fb7185" : "#22c55e"} strokeWidth="8" />
                    <line x1={x} x2={x} y1={62 + index * 7} y2={178 + index * 5} stroke={index % 2 ? "#fb7185" : "#22c55e"} strokeWidth="2" />
                  </g>
                ))}
              </svg>
              <div className="absolute right-6 top-6 text-right">
                <div className="text-3xl font-black">$67,428.20</div>
                <div className="text-sm font-bold text-emerald-400">+2.34% 24h</div>
              </div>
              <div className="absolute bottom-5 left-5 right-5 grid grid-cols-3 gap-2 text-xs">
                {["AI signals", "Forex risk", "P2P escrow"].map((label) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-ink/80 px-3 py-2 text-gray-300">{label}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="markets" className="border-y border-white/10 bg-panel/60">
        <div className="mx-auto max-w-6xl px-5 py-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-brand">Markets</p>
              <h2 className="text-2xl font-bold">AI-ready crypto market coverage</h2>
            </div>
            <Link href="/trade" className="hidden rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-white/5 sm:inline-flex">View exchange</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {markets.map(([symbol, price, change, volume]) => (
              <article key={symbol} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-bold">{symbol}</span>
                  <span className={`text-xs font-bold ${change.startsWith("-") ? "text-rose-400" : "text-emerald-400"}`}>{change}</span>
                </div>
                <div className="text-xl font-black">{price}</div>
                <div className="text-xs text-gray-500">24h volume {volume}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-5 py-16 md:py-20">
        <p className="mb-2 text-sm font-semibold text-brand">AI trading modules</p>
        <h2 className="mb-8 max-w-3xl text-3xl font-bold md:text-5xl">Professional tools for assisted trading, automation, and escrow operations</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {productCards.map(({ title, body, icon: Icon }) => (
            <article key={title} className="glass rounded-2xl p-5">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-brand/15 text-brand">
                <Icon size={21} />
              </div>
              <h3 className="mb-2 font-bold">{title}</h3>
              <p className="text-sm leading-relaxed text-gray-400">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="system" className="mx-auto grid max-w-6xl gap-5 px-5 pb-16 md:grid-cols-[0.85fr_1.15fr]">
        <div className="glass rounded-2xl p-5">
          <p className="mb-2 text-sm font-semibold text-brand">Platform architecture</p>
          <h2 className="mb-4 text-3xl font-bold">AI-assisted workflows backed by ledger safety</h2>
          <p className="mb-5 text-sm leading-6 text-gray-400">
            Hydra Trade combines AI-assisted trading workflows with configurable provider adapters, sandbox-first payment rails, testnet-first wallets, and review controls before production money movement.
          </p>
          <div className="grid gap-3">
            {[
              [Database, "Transparent local ledger"],
              [LockKeyhole, "KYC and withdrawal controls"],
              [Banknote, "M-Pesa, Paystack, card, TRC20"],
            ].map(([Icon, label]) => (
              <div key={String(label)} className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-3 text-sm text-gray-300">
                <Icon className="text-brand" size={18} /> {String(label)}
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {systemDetails.map(([title, body]) => (
            <article key={title} className="glass rounded-2xl p-5">
              <h3 className="mb-2 font-bold">{title}</h3>
              <p className="text-sm leading-6 text-gray-400">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16 md:pb-24">
        <div className="rounded-3xl bg-gradient-to-br from-brand to-amber-700 px-6 py-14 text-center text-ink md:py-20">
          <h2 className="mb-4 text-3xl font-bold md:text-5xl">Launch the AI trading workspace</h2>
          <p className="mx-auto mb-8 max-w-md text-black/60">Create an account, open the AI-assisted dashboard, test wallet flows, configure automation, and explore P2P escrow in a controlled sandbox.</p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-3.5 text-[15px] font-semibold text-brand">
              Create Account <ArrowRight size={16} />
            </Link>
            <Link href="/trade" className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-black/10 px-8 py-3.5 text-[15px] font-semibold text-ink">
              Open AI Workspace
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-panel/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-gray-400 md:flex-row md:items-center md:justify-between">
          <p>(c) 2026 Hydra Trade. AI powered crypto trading platform with sandbox settlement.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/privacy-policy" className="hover:text-brand">Privacy Policy</Link>
            <Link href="/cookies-policy" className="hover:text-brand">Cookies Policy</Link>
            <Link href="/terms-and-conditions" className="hover:text-brand">Terms and Conditions</Link>
          </div>
        </div>
      </footer>
    </PublicThemeShell>
  );
}
