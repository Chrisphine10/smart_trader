import { Logo } from "./logo";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen bg-ink text-white lg:grid-cols-[0.9fr_1.1fr]">
      <section className="hidden flex-col justify-between bg-panel p-10 lg:flex">
        <Logo />
        <div>
          <h2 className="mb-4 max-w-md text-4xl font-black leading-tight">Trade smarter with real-time markets</h2>
          <p className="max-w-md text-gray-400">Access synthetic assets, lightning execution, sandbox wallet flows, and a powerful trading dashboard.</p>
        </div>
        <div className="grid max-w-md grid-cols-3 gap-3">
          {["1M+ Traders", "100+ Assets", "95% Payout"].map((item) => (
            <div key={item} className="glass rounded-xl p-4 text-center text-sm font-bold">{item}</div>
          ))}
        </div>
      </section>
      <section className="flex min-h-screen items-center justify-center px-5 py-10">
        {children}
      </section>
    </main>
  );
}
