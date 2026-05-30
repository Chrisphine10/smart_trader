"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, BarChart3, Banknote, Bot, CreditCard, LogOut, MessageCircle, Save, Send, Shield, Smartphone, Users, Wallet } from "lucide-react";
import { Logo } from "./logo";

export function AdminApp() {
  const [stats, setStats] = useState<any>(null);
  const [admin, setAdmin] = useState<any>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [riskSettings, setRiskSettings] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"overview" | "support" | "payments" | "kyc" | "risk" | "p2p">("overview");
  const [token, setToken] = useState("");
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversation, setActiveConversation] = useState<any>(null);
  const [supportMessages, setSupportMessages] = useState<any[]>([]);
  const [reply, setReply] = useState("");
  const [paymentOps, setPaymentOps] = useState<{ deposits: any[]; withdrawals: any[] }>({ deposits: [], withdrawals: [] });
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [kycSubmissions, setKycSubmissions] = useState<any[]>([]);
  const [kycNotes, setKycNotes] = useState("");
  const [p2pDisputes, setP2pDisputes] = useState<any[]>([]);
  const [p2pNotes, setP2pNotes] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("adminToken");
    if (!saved) {
      location.href = "/admin/login";
      return;
    }
    setToken(saved);
    const headers = { Authorization: `Bearer ${saved}` };
    Promise.all([
      fetch("/api/admin/me", { headers }).then((r) => r.json()),
      fetch("/api/admin/stats", { headers }).then((r) => r.json()),
      fetch("/api/admin/payment-settings", { headers }).then((r) => r.json()),
      fetch("/api/admin/payments", { headers }).then((r) => r.json()),
      fetch("/api/admin/risk-settings", { headers }).then((r) => r.json()),
      fetch("/api/admin/kyc", { headers }).then((r) => r.json()),
      fetch("/api/admin/p2p/disputes", { headers }).then((r) => r.json()),
    ]).then(([me, stat, pay, payments, risk, kyc, p2p]) => {
      if (!me.admin) location.href = "/admin/login";
      setAdmin(me.admin);
      setStats(stat.stats);
      setSettings(pay.settings ?? {});
      setPaymentOps(payments.payments ?? { deposits: [], withdrawals: [] });
      setRiskSettings(risk.settings ?? {});
      setKycSubmissions(kyc.submissions ?? []);
      setP2pDisputes(p2p.disputes ?? []);
      loadSupport(saved).catch(() => undefined);
    });
  }, []);

  async function loadSupport(currentToken = token, conversationId = activeConversation?.id) {
    if (!currentToken) return;
    const headers = { Authorization: `Bearer ${currentToken}` };
    const data = await fetch("/api/admin/chat/conversations", { headers }).then((r) => r.json()).catch(() => ({ conversations: [] }));
    const items = data.conversations ?? [];
    setConversations(items);
    const selected = items.find((item: any) => item.id === conversationId) ?? items[0] ?? null;
    setActiveConversation(selected);
    if (selected?.id) {
      const messages = await fetch(`/api/admin/chat/messages/${selected.id}`, { headers }).then((r) => r.json()).catch(() => ({ messages: [] }));
      setSupportMessages(messages.messages ?? []);
    } else {
      setSupportMessages([]);
    }
  }

  async function selectConversation(conversation: any) {
    setActiveConversation(conversation);
    const messages = await fetch(`/api/admin/chat/messages/${conversation.id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => ({ messages: [] }));
    setSupportMessages(messages.messages ?? []);
  }

  async function sendReply() {
    if (!token || !activeConversation?.id || !reply.trim()) return;
    const response = await fetch(`/api/admin/chat/messages/${activeConversation.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: reply }),
    });
    const data = await response.json().catch(() => null);
    if (data?.message) {
      setSupportMessages((items) => [...items, data.message]);
      setReply("");
      loadSupport(token, activeConversation.id).catch(() => undefined);
    }
  }

  async function saveSettings() {
    const response = await fetch("/api/admin/payment-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(settings),
    });
    const data = await response.json();
    setNotice(data.success ? "Payment settings saved" : data.error ?? "Unable to save settings");
    if (data.settings) setSettings(data.settings);
  }

  async function loadPayments(currentToken = token) {
    if (!currentToken) return;
    const data = await fetch("/api/admin/payments", { headers: { Authorization: `Bearer ${currentToken}` } }).then((r) => r.json()).catch(() => ({ payments: { deposits: [], withdrawals: [] } }));
    setPaymentOps(data.payments ?? { deposits: [], withdrawals: [] });
  }

  async function loadKyc(currentToken = token) {
    if (!currentToken) return;
    const data = await fetch("/api/admin/kyc", { headers: { Authorization: `Bearer ${currentToken}` } }).then((r) => r.json()).catch(() => ({ submissions: [] }));
    setKycSubmissions(data.submissions ?? []);
  }

  async function loadP2pDisputes(currentToken = token) {
    if (!currentToken) return;
    const data = await fetch("/api/admin/p2p/disputes", { headers: { Authorization: `Bearer ${currentToken}` } }).then((r) => r.json()).catch(() => ({ disputes: [] }));
    setP2pDisputes(data.disputes ?? []);
  }

  async function reviewPayment(kind: "deposits" | "withdrawals", id: string, action: "approve" | "reject") {
    const response = await fetch(`/api/admin/payments/${kind}/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, notes: paymentNotes, reference: paymentReference }),
    });
    const data = await response.json().catch(() => null);
    setNotice(data?.payment ? `${kind === "deposits" ? "Deposit" : "Withdrawal"} ${action}d` : data?.error ?? "Review failed");
    await loadPayments();
    setPaymentNotes("");
    setPaymentReference("");
  }

  function update(key: string, value: string) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function updateRisk(key: string, value: string) {
    setRiskSettings((current) => ({ ...current, [key]: value }));
  }

  async function saveRiskSettings() {
    const response = await fetch("/api/admin/risk-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(riskSettings),
    });
    const data = await response.json();
    setNotice(data.success ? "Risk settings saved" : data.error ?? "Unable to save risk settings");
    if (data.settings) setRiskSettings(data.settings);
  }

  async function reviewKyc(id: string, status: "approved" | "rejected" | "restricted") {
    const response = await fetch("/api/admin/kyc", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, status, notes: kycNotes }),
    });
    const data = await response.json().catch(() => null);
    setNotice(data?.submission ? `KYC ${status}` : data?.error ?? "KYC review failed");
    setKycNotes("");
    await loadKyc();
  }

  async function resolveP2p(id: string, resolution: "release_buyer" | "refund_seller" | "no_action") {
    const response = await fetch(`/api/admin/p2p/disputes/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ resolution, notes: p2pNotes }),
    });
    const data = await response.json().catch(() => null);
    setNotice(data?.order ? "P2P dispute resolved" : data?.error ?? "P2P resolution failed");
    setP2pNotes("");
    await loadP2pDisputes();
  }

  if (!stats) return <main className="flex min-h-screen items-center justify-center bg-ink text-white"><div className="h-10 w-10 animate-spin rounded-full border-[3px] border-brand border-t-transparent" /></main>;

  return (
    <main className="min-h-screen bg-ink text-white">
      <header className="border-b border-white/10 bg-panel">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo label="Hydra Trade Admin" size="sm" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">{admin?.name}</span>
            <button onClick={() => { localStorage.removeItem("adminToken"); location.href = "/admin/login"; }} className="rounded-lg p-2 hover:bg-white/5"><LogOut size={18} /></button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8">
        <div className="mb-8">
          <p className="text-sm font-semibold text-brand">Operations</p>
          <h1 className="text-4xl font-black">Dashboard</h1>
          <div className="mt-3 inline-flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-gray-300">
            <span className="font-bold text-brand">Production security:</span>
            <span>Use env-provided admin credentials and rotate defaults before live deployment.</span>
          </div>
        </div>
        <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/5 p-1">
          {(["overview", "support", "payments", "p2p", "kyc", "risk"] as const).map((item) => (
            <button key={item} onClick={() => setTab(item)} className={`rounded-xl px-4 py-2 text-sm font-bold capitalize ${tab === item ? "bg-brand" : "hover:bg-white/5"}`}>{item}</button>
          ))}
        </div>
        <div className="mb-8 grid gap-4 md:grid-cols-4">
          <Metric icon={<Users />} label="Users" value={stats.users} />
          <Metric icon={<Wallet />} label="Deposit Volume" value={`$${Number(stats.depositVolume).toFixed(2)}`} />
          <Metric icon={<Banknote />} label="Pending Withdrawals" value={stats.pendingWithdrawals} />
          <Metric icon={<BarChart3 />} label="Escrow Split" value={`$${Number(stats.escrowFees ?? 0).toFixed(2)}`} />
        </div>
        {tab === "overview" && <Overview />}
        {tab === "support" && <SupportDesk conversations={conversations} activeConversation={activeConversation} messages={supportMessages} reply={reply} setReply={setReply} onRefresh={() => loadSupport()} onSelect={selectConversation} onSend={sendReply} />}
        {tab === "payments" && (
          <section className="grid gap-4">
            <PaymentOperations payments={paymentOps} notes={paymentNotes} reference={paymentReference} setNotes={setPaymentNotes} setReference={setPaymentReference} onRefresh={() => loadPayments()} onReview={reviewPayment} />
            <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="glass rounded-2xl p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-brand">Payment Mode</p>
                  <h2 className="text-2xl font-black">Provider Setup</h2>
                </div>
                <CreditCard className="text-brand" />
              </div>
              <label className="mb-4 block text-sm font-medium">Mode
                <select className="field mt-2" value={settings["payments.mode"] ?? "sandbox"} onChange={(e) => update("payments.mode", e.target.value)}>
                  <option value="sandbox">Sandbox credit instantly</option>
                  <option value="live">Live provider requests</option>
                </select>
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Wallet currency" value={settings["payments.currency"]} onChange={(value) => update("payments.currency", value)} />
                <Field label="USD to KES rate" value={settings["payments.usdKesRate"]} onChange={(value) => update("payments.usdKesRate", value)} />
                <Field label="Minimum deposit USD" value={settings["payments.minDeposit"]} onChange={(value) => update("payments.minDeposit", value)} />
                <Field label="Minimum withdrawal USD" value={settings["payments.minWithdrawal"]} onChange={(value) => update("payments.minWithdrawal", value)} />
                <Field label="Withdrawal review required" value={settings["payments.withdrawalReview"]} onChange={(value) => update("payments.withdrawalReview", value)} />
              </div>
              <div className="mt-4 rounded-xl bg-white/5 p-4 text-sm text-gray-300">
                Sandbox mode lets users fund their real wallet instantly for local testing. Live mode creates Daraja STK pushes or Paystack checkout sessions and keeps deposits pending until callbacks or verification are added.
              </div>
            </div>

            <div className="grid gap-4">
              <ProviderPanel icon={<Smartphone />} title="M-Pesa Daraja">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Enabled" value={settings["mpesa.enabled"]} onChange={(value) => update("mpesa.enabled", value)} />
                  <Field label="Environment" value={settings["mpesa.environment"]} onChange={(value) => update("mpesa.environment", value)} />
                  <Field label="Short code" value={settings["mpesa.shortCode"]} onChange={(value) => update("mpesa.shortCode", value)} />
                  <Field label="Transaction type" value={settings["mpesa.transactionType"]} onChange={(value) => update("mpesa.transactionType", value)} />
                  <Field label="Account reference" value={settings["mpesa.accountReference"]} onChange={(value) => update("mpesa.accountReference", value)} />
                  <Field label="Callback URL" value={settings["mpesa.callbackUrl"]} onChange={(value) => update("mpesa.callbackUrl", value)} />
                  <Field label="Consumer key" value={settings["mpesa.consumerKey"]} onChange={(value) => update("mpesa.consumerKey", value)} />
                  <Field label="Consumer secret" value={settings["mpesa.consumerSecret"]} onChange={(value) => update("mpesa.consumerSecret", value)} password />
                  <Field label="Passkey" value={settings["mpesa.passkey"]} onChange={(value) => update("mpesa.passkey", value)} password />
                </div>
              </ProviderPanel>

              <ProviderPanel icon={<CreditCard />} title="Paystack">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Enabled" value={settings["paystack.enabled"]} onChange={(value) => update("paystack.enabled", value)} />
                  <Field label="Currency" value={settings["paystack.currency"]} onChange={(value) => update("paystack.currency", value)} />
                  <Field label="Public key" value={settings["paystack.publicKey"]} onChange={(value) => update("paystack.publicKey", value)} />
                  <Field label="Secret key" value={settings["paystack.secretKey"]} onChange={(value) => update("paystack.secretKey", value)} password />
                  <Field label="Callback URL" value={settings["paystack.callbackUrl"]} onChange={(value) => update("paystack.callbackUrl", value)} />
                </div>
              </ProviderPanel>
            </div>
            <div className="lg:col-span-2">
              <button onClick={saveSettings} className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-bold"><Save size={17} /> Save Payment Setup</button>
              {notice && <span className="ml-4 text-sm text-gray-300">{notice}</span>}
            </div>
            </div>
          </section>
        )}
        {tab === "p2p" && <P2POperations disputes={p2pDisputes} notes={p2pNotes} setNotes={setP2pNotes} onRefresh={() => loadP2pDisputes()} onResolve={resolveP2p} />}
        {tab === "kyc" && <KycPanel submissions={kycSubmissions} notes={kycNotes} setNotes={setKycNotes} onRefresh={() => loadKyc()} onReview={reviewKyc} />}
        {tab === "risk" && <RiskPanel settings={riskSettings} onChange={updateRisk} onSave={saveRiskSettings} notice={notice} />}
      </div>
    </main>
  );
}

function SupportDesk({ conversations, activeConversation, messages, reply, setReply, onRefresh, onSelect, onSend }: { conversations: any[]; activeConversation: any; messages: any[]; reply: string; setReply: (value: string) => void; onRefresh: () => void; onSelect: (conversation: any) => void; onSend: () => void }) {
  return (
    <section className="grid min-h-[620px] gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="glass rounded-2xl p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-brand">Live Support</p>
            <h2 className="text-2xl font-black">User Inbox</h2>
          </div>
          <button onClick={onRefresh} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold">Refresh</button>
        </div>
        <div className="space-y-2">
          {conversations.length === 0 && <div className="rounded-xl bg-white/5 p-4 text-sm text-gray-400">No support conversations yet.</div>}
          {conversations.map((conversation) => (
            <button key={conversation.id} onClick={() => onSelect(conversation)} className={`w-full rounded-xl p-3 text-left transition ${activeConversation?.id === conversation.id ? "bg-brand text-ink" : "bg-white/5 hover:bg-white/10"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-black">{conversation.username}</span>
                <span className="text-[10px] opacity-70">{conversation.user_messages} msg</span>
              </div>
              <div className="mt-1 truncate text-xs opacity-80">{conversation.email}</div>
              <div className="mt-2 line-clamp-2 text-xs opacity-75">{conversation.last_message ?? "New conversation"}</div>
            </button>
          ))}
        </div>
      </aside>

      <div className="glass flex rounded-2xl p-4">
        {!activeConversation ? (
          <div className="grid flex-1 place-items-center text-gray-400">Select a conversation to reply.</div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h2 className="text-2xl font-black">{activeConversation.username}</h2>
                <p className="text-sm text-gray-400">{activeConversation.email}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-white/5 p-3"><div className="text-gray-500">Real</div><div className="font-black">${Number(activeConversation.real_balance).toFixed(2)}</div></div>
                <div className="rounded-xl bg-white/5 p-3"><div className="text-gray-500">Demo</div><div className="font-black">${Number(activeConversation.demo_balance).toFixed(2)}</div></div>
                <div className="rounded-xl bg-white/5 p-3"><div className="text-gray-500">Mode</div><div className="font-black">{activeConversation.is_demo ? "Demo" : "Real"}</div></div>
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-auto rounded-2xl bg-[#0b0f16] p-4">
              {messages.map((message) => (
                <div key={message.id} className={`max-w-[78%] rounded-2xl p-3 text-sm ${message.sender_type === "admin" ? "ml-auto bg-brand text-ink" : "bg-white/10 text-white"}`}>
                  <div>{message.message}</div>
                  <div className="mt-1 text-[10px] opacity-60">{message.sender_type} - {message.created_at}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <input className="field" value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSend(); }} placeholder="Reply to user" />
              <button onClick={onSend} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 font-black text-ink"><Send size={16} /> Send</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PaymentOperations({ payments, notes, reference, setNotes, setReference, onRefresh, onReview }: { payments: { deposits: any[]; withdrawals: any[] }; notes: string; reference: string; setNotes: (value: string) => void; setReference: (value: string) => void; onRefresh: () => void; onReview: (kind: "deposits" | "withdrawals", id: string, action: "approve" | "reject") => void }) {
  const pendingDeposits = payments.deposits.filter((item) => item.status === "pending").length;
  const pendingWithdrawals = payments.withdrawals.filter((item) => item.status === "pending").length;

  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-brand">Payment Operations</p>
          <h2 className="text-2xl font-black">Deposit & Withdrawal Queue</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-xl bg-emerald-500/15 px-3 py-2 font-bold text-emerald-300">{pendingDeposits} pending deposits</span>
          <span className="rounded-xl bg-amber-500/15 px-3 py-2 font-bold text-amber-300">{pendingWithdrawals} pending withdrawals</span>
          <button onClick={onRefresh} className="rounded-xl bg-white/10 px-3 py-2 font-bold">Refresh</button>
        </div>
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <Field label="Admin notes for next action" value={notes} onChange={setNotes} />
        <Field label="Provider payout/reference" value={reference} onChange={setReference} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <PaymentTable title="Deposits" kind="deposits" rows={payments.deposits} onReview={onReview} />
        <PaymentTable title="Withdrawals" kind="withdrawals" rows={payments.withdrawals} onReview={onReview} />
      </div>
    </section>
  );
}

function PaymentTable({ title, kind, rows, onReview }: { title: string; kind: "deposits" | "withdrawals"; rows: any[]; onReview: (kind: "deposits" | "withdrawals", id: string, action: "approve" | "reject") => void }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b0f16] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-black">{title}</h3>
        <span className="text-xs text-gray-500">{rows.length} records</span>
      </div>
      <div className="max-h-[430px] space-y-2 overflow-auto">
        {rows.length === 0 && <div className="rounded-xl bg-white/5 p-4 text-sm text-gray-400">No payment records yet.</div>}
        {rows.map((item) => (
          <div key={item.id} className="rounded-xl bg-white/5 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-black">{item.username} <span className="font-normal text-gray-500">{item.email}</span></div>
                <div className="mt-1 text-xs text-gray-400">{String(item.method).toUpperCase()} - ${Number(item.amount).toFixed(2)} - {item.created_at}</div>
                <div className="mt-1 break-all text-xs text-gray-500">Ref: {item.reference ?? item.provider_reference ?? item.wallet_address ?? "none"}</div>
              </div>
              <span className={`rounded-lg px-2 py-1 text-xs font-bold ${item.status === "completed" ? "bg-emerald-500/15 text-emerald-300" : item.status === "rejected" ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300"}`}>{item.status}</span>
            </div>
            {item.admin_notes && <div className="mt-2 rounded-lg bg-black/20 p-2 text-xs text-gray-400">{item.admin_notes}</div>}
            {item.status === "pending" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => onReview(kind, item.id, "approve")} className="rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-300">{kind === "deposits" ? "Approve & Credit" : "Mark Paid"}</button>
                <button onClick={() => onReview(kind, item.id, "reject")} className="rounded-lg bg-rose-500/20 px-3 py-2 text-xs font-bold text-rose-300">{kind === "deposits" ? "Reject" : "Reject & Refund"}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function P2POperations({ disputes, notes, setNotes, onRefresh, onResolve }: { disputes: any[]; notes: string; setNotes: (value: string) => void; onRefresh: () => void; onResolve: (id: string, resolution: "release_buyer" | "refund_seller" | "no_action") => void }) {
  const aged = disputes.filter((item) => item.status !== "disputed").length;
  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-brand">P2P Operations</p>
          <h2 className="text-2xl font-black">Disputes & Aged Escrow</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-xl bg-rose-500/15 px-3 py-2 font-bold text-rose-300">{disputes.length - aged} open disputes</span>
          <span className="rounded-xl bg-amber-500/15 px-3 py-2 font-bold text-amber-300">{aged} aged orders</span>
          <button onClick={onRefresh} className="rounded-xl bg-white/10 px-3 py-2 font-bold">Refresh</button>
        </div>
      </div>
      <Field label="Admin notes for next P2P action" value={notes} onChange={setNotes} />
      <div className="mt-4 grid gap-3">
        {disputes.length === 0 && <div className="rounded-xl bg-white/5 p-4 text-sm text-gray-400">No P2P disputes or aged orders.</div>}
        {disputes.map((item) => (
          <article key={item.id} className="rounded-2xl border border-white/10 bg-[#0b0f16] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <ArrowLeftRight className="text-brand" size={18} />
                  <h3 className="font-black">{item.asset_amount} {item.asset_symbol} - {item.fiat_currency} {Number(item.fiat_amount).toFixed(2)}</h3>
                </div>
                <p className="text-xs text-gray-400">Buyer: {item.buyer_username} ({item.buyer_email})</p>
                <p className="text-xs text-gray-400">Seller: {item.seller_username} ({item.seller_email})</p>
                <p className="mt-2 text-sm text-gray-300">Reason: {item.dispute_reason ?? "Aged escrow requires review"}</p>
                <p className="mt-1 text-xs text-gray-500">Payment ref: {item.payment_reference ?? "none"} - created {item.created_at}</p>
              </div>
              <span className={`rounded-lg px-2 py-1 text-xs font-bold ${item.status === "disputed" ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300"}`}>{item.status}</span>
            </div>
            {item.status === "disputed" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => onResolve(item.id, "release_buyer")} className="rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-300">Release to Buyer</button>
                <button onClick={() => onResolve(item.id, "refund_seller")} className="rounded-lg bg-amber-500/20 px-3 py-2 text-xs font-bold text-amber-300">Refund Seller</button>
                <button onClick={() => onResolve(item.id, "no_action")} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold">No Action</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function Overview() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {["Users & Balances", "Deposits & Withdrawals", "Trades & Risk", "Chat Conversations", "Referral Commissions", "System Settings"].map((title) => (
        <section key={title} className="glass rounded-2xl p-5">
          <Shield className="mb-4 text-brand" />
          <h2 className="mb-2 font-bold">{title}</h2>
          <p className="text-sm leading-relaxed text-gray-400">Operational surface is wired to local SQLite data and ready for expanded moderation actions.</p>
        </section>
      ))}
    </div>
  );
}

function KycPanel({ submissions, notes, setNotes, onRefresh, onReview }: { submissions: any[]; notes: string; setNotes: (value: string) => void; onRefresh: () => void; onReview: (id: string, status: "approved" | "rejected" | "restricted") => void }) {
  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-brand">KYC Queue</p>
          <h2 className="text-2xl font-black">Identity Review</h2>
        </div>
        <button onClick={onRefresh} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold">Refresh</button>
      </div>
      <Field label="Admin notes for next KYC action" value={notes} onChange={setNotes} />
      <div className="mt-4 grid gap-3">
        {submissions.length === 0 && <div className="rounded-xl bg-white/5 p-4 text-sm text-gray-400">No KYC submissions yet.</div>}
        {submissions.map((item) => (
          <article key={item.id} className="rounded-2xl border border-white/10 bg-[#0b0f16] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-black">{item.full_name} <span className="font-normal text-gray-500">{item.email}</span></h3>
                <p className="mt-1 text-xs text-gray-400">{item.document_type}: {item.document_number} - {item.country}</p>
                {item.notes && <p className="mt-2 text-sm text-gray-400">{item.notes}</p>}
                {item.admin_notes && <p className="mt-2 rounded-lg bg-white/5 p-2 text-xs text-gray-400">{item.admin_notes}</p>}
              </div>
              <span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-bold text-brand">{item.status}</span>
            </div>
            {item.status === "submitted" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => onReview(item.id, "approved")} className="rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-300">Approve</button>
                <button onClick={() => onReview(item.id, "rejected")} className="rounded-lg bg-rose-500/20 px-3 py-2 text-xs font-bold text-rose-300">Reject</button>
                <button onClick={() => onReview(item.id, "restricted")} className="rounded-lg bg-amber-500/20 px-3 py-2 text-xs font-bold text-amber-300">Restrict</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function RiskPanel({ settings, onChange, onSave, notice }: { settings: Record<string, string>; onChange: (key: string, value: string) => void; onSave: () => void; notice: string }) {
  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-5 flex items-center gap-3">
        <Bot className="text-brand" />
        <div>
          <p className="text-sm font-bold text-brand">Risk Controls</p>
          <h2 className="text-2xl font-black">Real Account Limits</h2>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Maximum real stake USD" value={settings["risk.maxStake"]} onChange={(value) => onChange("risk.maxStake", value)} />
        <Field label="Maximum open real positions" value={settings["risk.maxOpenPositions"]} onChange={(value) => onChange("risk.maxOpenPositions", value)} />
        <Field label="Maximum real bot sessions" value={settings["risk.maxBotSessions"]} onChange={(value) => onChange("risk.maxBotSessions", value)} />
        <Field label="Daily withdrawal limit USD" value={settings["risk.dailyWithdrawalLimit"]} onChange={(value) => onChange("risk.dailyWithdrawalLimit", value)} />
        <Field label="Maximum withdrawal USD" value={settings["risk.maxWithdrawal"]} onChange={(value) => onChange("risk.maxWithdrawal", value)} />
        <Field label="System escrow BTC address" value={settings["escrow.bitcoinAddress"]} onChange={(value) => onChange("escrow.bitcoinAddress", value)} />
        <Field label="Winning payout escrow split %" value={settings["escrow.winPayoutPercent"]} onChange={(value) => onChange("escrow.winPayoutPercent", value)} />
      </div>
      <button onClick={onSave} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-bold"><Save size={17} /> Save Risk Limits</button>
      {notice && <span className="ml-4 text-sm text-gray-300">{notice}</span>}
    </section>
  );
}

function ProviderPanel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-5 flex items-center gap-3">
        <div className="text-brand">{icon}</div>
        <h2 className="text-xl font-black">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, password }: { label: string; value?: string; onChange: (value: string) => void; password?: boolean }) {
  return (
    <label className="block text-sm font-medium">{label}
      <input className="field mt-2" type={password ? "password" : "text"} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-4 text-brand">{icon}</div>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-3xl font-black">{value}</div>
    </div>
  );
}
