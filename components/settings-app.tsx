"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Copy, CreditCard, KeyRound, Monitor, Save, Shield, Smartphone, User, Wallet } from "lucide-react";
import { Logo } from "./logo";

type SettingsTab = "profile" | "security" | "payments" | "preferences";

export function SettingsApp() {
  const [user, setUser] = useState<any>(null);
  const [tab, setTab] = useState<SettingsTab>("profile");
  const [notice, setNotice] = useState("");
  const [trc20Address, setTrc20Address] = useState("");
  const [exchangeRate, setExchangeRate] = useState(129.09);
  const [kycForm, setKycForm] = useState({ fullName: "", documentType: "national_id", documentNumber: "", country: "KE", notes: "" });
  const [preferences, setPreferences] = useState({ theme: "Dark", sound: "Enabled", chartDensity: "Professional", notifications: "Trade + wallet" });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      location.href = "/login";
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    fetch("/api/auth/me", { headers }).then((response) => response.json()).then((data) => setUser(data.user));
    fetch("/api/auth/trc20/my-address", { headers }).then((response) => response.json()).then((data) => setTrc20Address(data.address ?? "")).catch(() => undefined);
    fetch("/api/auth/exchange-rate", { headers }).then((response) => response.json()).then((data) => setExchangeRate(Number(data.rate ?? 129.09))).catch(() => undefined);
    const saved = localStorage.getItem("hydratrade.preferences");
    if (saved) setPreferences((current) => ({ ...current, ...JSON.parse(saved) }));
  }, []);

  const profileRows = useMemo(() => [
    ["Username", user?.username ?? "Loading..."],
    ["Email", user?.email ?? "Loading..."],
    ["Account mode", user?.is_demo ? "Demo account" : "Real account"],
    ["KYC status", user?.kyc_status ?? "unverified"],
    ["Joined", user?.created_at ?? "Loading..."],
  ], [user]);

  function savePreferences() {
    localStorage.setItem("hydratrade.preferences", JSON.stringify(preferences));
    setNotice("Preferences saved on this device");
  }

  async function submitKyc() {
    const token = localStorage.getItem("token");
    if (!token) return;
    const response = await fetch("/api/kyc/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(kycForm),
    });
    const data = await response.json().catch(() => null);
    setNotice(data?.submission ? "KYC submitted for review" : data?.error ?? "Unable to submit KYC");
    if (data?.submission) {
      const me = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => null);
      if (me?.user) setUser(me.user);
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0f16] text-white">
      <header className="border-b border-white/10 bg-[#0f141d]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <Logo href="/trade" label="Settings Center" size="sm" />
          <Link href="/trade" className="rounded-xl bg-white/5 px-4 py-2 text-sm font-bold">Back to Trade</Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <section className="rounded-2xl border border-white/10 bg-[#0f141d] p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand/15 text-brand"><User /></div>
              <div className="min-w-0">
                <div className="truncate font-black">{user?.username ?? "Trader"}</div>
                <div className="truncate text-xs text-gray-500">{user?.email ?? "Loading..."}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Metric label="Real" value={`$${Number(user?.real_balance ?? 0).toFixed(2)}`} />
              <Metric label="Demo" value={`$${Number(user?.demo_balance ?? 0).toFixed(2)}`} />
            </div>
          </section>

          <nav className="rounded-2xl border border-white/10 bg-[#0f141d] p-2">
            {[
              ["profile", User, "Profile"],
              ["security", KeyRound, "Security"],
              ["payments", Wallet, "Payments"],
              ["preferences", Monitor, "Preferences"],
            ].map(([id, Icon, label]) => {
              const CurrentIcon = Icon as typeof User;
              return (
                <button key={String(id)} onClick={() => setTab(id as SettingsTab)} className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-bold ${tab === id ? "bg-brand text-ink" : "text-gray-300 hover:bg-white/5"}`}>
                  <CurrentIcon size={16} /> {String(label)}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="space-y-5">
          {tab === "profile" && (
            <Panel icon={<User />} eyebrow="Identity" title="Profile Overview">
              <div className="grid gap-3 md:grid-cols-2">
                {profileRows.map(([label, value]) => <Row key={label} label={label} value={value} />)}
              </div>
              <div className="mt-4 rounded-2xl bg-white/5 p-4 text-sm text-gray-300">Profile edits are staged for the account API. Current values are read from the authenticated session so support views stay consistent.</div>
            </Panel>
          )}

          {tab === "security" && (
            <Panel icon={<Shield />} eyebrow="Protection" title="Security & Access">
              <div className="grid gap-4 md:grid-cols-3">
                <SecurityCard title="Password" copy="Use a strong password for live funds." action="Change password" />
                <SecurityCard title="Two-factor auth" copy="Authenticator app integration ready." action="Configure 2FA" />
                <SecurityCard title="KYC verification" copy={`Current status: ${user?.kyc_status ?? "unverified"}`} action="Submit KYC" />
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="mb-3 font-black">Submit KYC For Review</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <input className="field" value={kycForm.fullName} onChange={(event) => setKycForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Full legal name" />
                  <select className="field" value={kycForm.documentType} onChange={(event) => setKycForm((current) => ({ ...current, documentType: event.target.value }))}>
                    <option value="national_id">National ID</option>
                    <option value="passport">Passport</option>
                    <option value="drivers_license">Driver's license</option>
                  </select>
                  <input className="field" value={kycForm.documentNumber} onChange={(event) => setKycForm((current) => ({ ...current, documentNumber: event.target.value }))} placeholder="Document number" />
                  <input className="field" value={kycForm.country} onChange={(event) => setKycForm((current) => ({ ...current, country: event.target.value }))} placeholder="Country code" />
                  <textarea className="field min-h-20 md:col-span-2" value={kycForm.notes} onChange={(event) => setKycForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional notes" />
                </div>
                <button onClick={submitKyc} className="mt-3 rounded-xl bg-brand px-4 py-3 text-sm font-black text-ink">Submit KYC</button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Row label="Session status" value="Active" />
                <Row label="Withdrawal review" value="Security review required" />
              </div>
            </Panel>
          )}

          {tab === "payments" && (
            <Panel icon={<CreditCard />} eyebrow="Wallet" title="Payment Settings">
              <div className="grid gap-3 md:grid-cols-3">
                <Metric label="USD/KES rate" value={exchangeRate.toFixed(2)} />
                <Metric label="M-Pesa" value={user?.mpesa_phone ?? "Not set"} />
                <Metric label="TRC20" value={trc20Address ? "Ready" : "Loading"} />
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">TRC20 deposit address</div>
                <div className="break-all font-mono text-sm text-brand">{trc20Address || "Loading address..."}</div>
                <button onClick={() => trc20Address && navigator.clipboard?.writeText(trc20Address).then(() => setNotice("TRC20 address copied"))} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold"><Copy size={14} /> Copy address</button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Row label="Deposit methods" value="M-Pesa, Paystack, card, TRC20" />
                <Row label="Withdrawal methods" value="M-Pesa, TRC20" />
              </div>
            </Panel>
          )}

          {tab === "preferences" && (
            <Panel icon={<Bell />} eyebrow="Experience" title="Trading Preferences">
              <div className="grid gap-4 md:grid-cols-2">
                <Choice label="Theme" value={preferences.theme} options={["Dark", "High contrast"]} onChange={(value) => setPreferences((current) => ({ ...current, theme: value }))} />
                <Choice label="Sound" value={preferences.sound} options={["Enabled", "Muted"]} onChange={(value) => setPreferences((current) => ({ ...current, sound: value }))} />
                <Choice label="Chart density" value={preferences.chartDensity} options={["Professional", "Compact", "Expanded"]} onChange={(value) => setPreferences((current) => ({ ...current, chartDensity: value }))} />
                <Choice label="Notifications" value={preferences.notifications} options={["Trade + wallet", "Wallet only", "Critical only"]} onChange={(value) => setPreferences((current) => ({ ...current, notifications: value }))} />
              </div>
              <button onClick={savePreferences} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-black text-ink"><Save size={16} /> Save Preferences</button>
            </Panel>
          )}

          {notice && <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300">{notice}</div>}
        </section>
      </div>
    </main>
  );
}

function Panel({ icon, eyebrow, title, children }: { icon: React.ReactNode; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0f141d] p-5">
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand/15 text-brand">{icon}</div>
        <div>
          <p className="text-sm font-bold text-brand">{eyebrow}</p>
          <h1 className="text-2xl font-black">{title}</h1>
        </div>
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-4 rounded-xl bg-white/5 p-3 text-sm"><span className="text-gray-500">{label}</span><span className="text-right font-bold">{value}</span></div>;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl bg-white/5 p-3"><div className="text-xs text-gray-500">{label}</div><div className="mt-1 font-black">{value}</div></div>;
}

function SecurityCard({ title, copy, action }: { title: string; copy: string; action: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <Smartphone className="mb-3 text-brand" size={18} />
      <h2 className="font-black">{title}</h2>
      <p className="mt-2 min-h-10 text-sm text-gray-400">{copy}</p>
      <button className="mt-3 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-gray-300">{action}</button>
    </div>
  );
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-medium">{label}
      <select className="field mt-2" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}
