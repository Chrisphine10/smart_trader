import { Logo } from "./logo";
import { PublicThemeShell } from "./public-theme-shell";
import { PublicThemeToggle } from "./public-theme-toggle";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <PublicThemeShell>
      <div className="grid min-h-screen bg-ink text-white lg:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden flex-col justify-between bg-panel p-10 lg:flex">
          <div className="flex items-center justify-between gap-3">
            <Logo />
            <PublicThemeToggle />
          </div>
          <div>
            <h2 className="mb-4 max-w-md text-4xl font-black leading-tight">Trade smarter with real-time markets</h2>
            <p className="max-w-md text-gray-400">Access synthetic assets, fast execution, wallet flows, and a focused trading dashboard.</p>
          </div>
          <div className="max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f16] shadow-glow">
            <img
              src="/auth/trading-graph.svg"
              alt="Trading graph dashboard preview"
              className="block aspect-[16/10] w-full object-cover"
            />
          </div>
          <div className="grid max-w-md grid-cols-3 gap-3">
            {["1M+ Traders", "100+ Assets", "95% Payout"].map((item) => (
              <div key={item} className="glass rounded-xl p-4 text-center text-sm font-bold">{item}</div>
            ))}
          </div>
        </section>
        <section className="relative flex min-h-screen items-center justify-center px-5 py-10">
          <div className="absolute right-5 top-5 lg:hidden">
            <PublicThemeToggle />
          </div>
          {children}
        </section>
      </div>
    </PublicThemeShell>
  );
}
