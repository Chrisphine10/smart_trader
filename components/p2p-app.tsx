"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Ban, CheckCircle2, Filter, MessageCircle, Plus, RefreshCw, Send, ShieldCheck, Wallet } from "lucide-react";
import { defaultP2PWeb3PaymentMethods, p2pAssets, p2pWeb3PaymentMethods } from "../lib/p2p-methods";
import { Logo } from "./logo";
import { PublicThemeShell } from "./public-theme-shell";
import { PublicThemeToggle } from "./public-theme-toggle";

type P2PAd = {
  id: string;
  username: string;
  side: string;
  asset_symbol: string;
  fiat_currency: string;
  price: number;
  available_amount: number;
  min_limit: number;
  max_limit: number;
  paymentMethods?: string[];
  completionRate?: number;
  completedOrders?: number;
  disputeCount?: number;
  avgReleaseMinutes?: number;
  terms?: string;
};

type P2PMessage = {
  id: string;
  user_id: string;
  username: string;
  message: string;
  created_at: string;
};

const closedStatuses = new Set(["released", "cancelled", "expired", "refunded", "resolved_no_action"]);

export function P2PApp() {
  const [token, setToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [ads, setAds] = useState<P2PAd[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [asset, setAsset] = useState("USDT");
  const [fiat, setFiat] = useState("KES");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [sort, setSort] = useState("newest");
  const [minFiat, setMinFiat] = useState("");
  const [maxFiat, setMaxFiat] = useState("");
  const [notice, setNotice] = useState("");
  const [amount, setAmount] = useState(25);
  const [selectedAd, setSelectedAd] = useState<P2PAd | null>(null);
  const [selectedPayment, setSelectedPayment] = useState(defaultP2PWeb3PaymentMethods[0]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [messages, setMessages] = useState<P2PMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [form, setForm] = useState({ side: "sell", price: 1, availableAmount: 100, minLimit: 5, maxLimit: 50000, paymentMethods: defaultP2PWeb3PaymentMethods.join(","), terms: "Web3 settlement only. Share a tx hash or wallet reference before release." });

  const load = useCallback(async (currentToken: string, overrides: Partial<{ side: "buy" | "sell"; asset: string }> = {}) => {
    const nextSide = overrides.side ?? side;
    const nextAsset = overrides.asset ?? asset;
    const headers = { Authorization: `Bearer ${currentToken}` };
    const params = new URLSearchParams({
      side: nextSide === "buy" ? "sell" : "buy",
      asset: nextAsset,
      fiat,
      paymentMethod,
      minFiat,
      maxFiat,
      sort,
    });
    const [adData, orderData] = await Promise.all([
      fetch(`/api/p2p/ads?${params.toString()}`, { headers }).then((r) => r.json()).catch(() => ({ ads: [] })),
      fetch("/api/p2p/orders", { headers }).then((r) => r.json()).catch(() => ({ orders: [] })),
    ]);
    setAds(adData.ads ?? []);
    setOrders(orderData.orders ?? []);
  }, [asset, fiat, maxFiat, minFiat, paymentMethod, side, sort]);

  const loadMe = useCallback(async (currentToken: string) => {
    const data = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${currentToken}` } }).then((r) => r.json()).catch(() => ({}));
    setCurrentUserId(data.user?.id ?? "");
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("token");
    if (saved) {
      setToken(saved);
      loadMe(saved).catch(() => undefined);
      load(saved).catch(() => undefined);
      return;
    }
    location.href = "/login";
  }, [load, loadMe]);

  const fiatTotal = useMemo(() => selectedAd ? Number(amount || 0) * Number(selectedAd.price || 0) : 0, [amount, selectedAd]);
  const ticketError = selectedAd
    ? selectedAd.id.startsWith("preview-") ? "Preview only."
      : fiatTotal < Number(selectedAd.min_limit) ? "Below minimum."
      : fiatTotal > Number(selectedAd.max_limit) ? "Above maximum."
      : amount > Number(selectedAd.available_amount) ? "Exceeds available."
      : ""
    : "";

  async function createAd() {
    if (!token) return;
    const response = await fetch("/api/p2p/ads", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...form, assetSymbol: asset, fiatCurrency: fiat }),
    });
    const data = await response.json();
    setNotice(data.ad ? "Ad created." : data.error ?? "Unable to create ad");
    await load(token);
  }

  async function openOrder() {
    if (!token || !selectedAd || ticketError) return;
    const response = await fetch("/api/p2p/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ adId: selectedAd.id, assetAmount: amount, paymentMethod: selectedPayment }),
    });
    const data = await response.json();
    setNotice(data.order ? "Order opened." : data.error ?? "Unable to open order");
    if (data.order) setSelectedOrder(data.order);
    await load(token);
  }

  async function action(orderId: string, type: "pay" | "release" | "dispute" | "cancel") {
    if (!token) return;
    const body = type === "pay"
      ? { reference: paymentReference || `PAY-${Date.now()}`, proofNote: proofNote || "Proof sent." }
      : type === "dispute" ? { reason: disputeReason || "Payment issue" } : {};
    const response = await fetch(`/api/p2p/orders/${orderId}/${type}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    setNotice(data.order ? `${type} done.` : data.error ?? "Order action failed");
    if (data.order) setSelectedOrder(data.order);
    await load(token);
  }

  async function loadMessages(orderId: string) {
    if (!token) return;
    const data = await fetch(`/api/p2p/orders/${orderId}/messages`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => ({ messages: [] }));
    setMessages(data.messages ?? []);
  }

  async function sendMessage() {
    if (!token || !selectedOrder?.id || !chatText.trim()) return;
    const data = await fetch(`/api/p2p/orders/${selectedOrder.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: chatText }),
    }).then((r) => r.json()).catch(() => null);
    if (data?.message) {
      setMessages((items) => [...items, data.message]);
      setChatText("");
    } else if (data?.error) {
      setNotice(data.error);
    }
  }

  function chooseAd(ad: P2PAd) {
    setSelectedAd(ad);
    setSelectedPayment(ad.paymentMethods?.[0] ?? defaultP2PWeb3PaymentMethods[0]);
  }

  function toggleFormPaymentMethod(method: string) {
    setForm((value) => {
      const current = value.paymentMethods.split(",").map((item) => item.trim()).filter(Boolean);
      const next = current.includes(method)
        ? current.filter((item) => item !== method)
        : [...current, method];
      return { ...value, paymentMethods: next.join(",") };
    });
  }

  function chooseOrder(order: any) {
    setSelectedOrder(order);
    loadMessages(order.id).catch(() => undefined);
  }

  return (
    <PublicThemeShell>
    <div className="min-h-screen bg-[#0b0f16] text-white">
      <header className="border-b border-white/10 bg-[#0f141d]">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Logo href="/trade" label="Hydra Trade P2P" size="sm" />
          <div className="flex items-center gap-2 text-sm">
            <PublicThemeToggle />
            <Link href="/trade" className="rounded-xl bg-white/5 px-3 py-2">Trade</Link>
            <button className="rounded-xl bg-brand px-3 py-2 font-bold">Ledger escrow</button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#0f141d] p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-3xl font-black">P2P</h1>
              </div>
              <div className="flex gap-2 rounded-xl bg-white/5 p-1">
                {(["buy", "sell"] as const).map((item) => <button key={item} onClick={() => { setSide(item); token && load(token, { side: item }); }} className={`rounded-lg px-4 py-2 text-sm font-bold capitalize ${side === item ? "bg-brand" : "text-gray-300"}`}>{item}</button>)}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
              <select className="field" value={asset} onChange={(event) => { setAsset(event.target.value); token && load(token, { asset: event.target.value }); }}>
                {p2pAssets.map((item) => <option key={item}>{item}</option>)}
              </select>
              <select className="field" value={fiat} onChange={(event) => setFiat(event.target.value)}><option>KES</option><option>USD</option></select>
              <select className="field" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                <option value="">Any Web3</option>
                {p2pWeb3PaymentMethods.map((method) => <option key={method}>{method}</option>)}
              </select>
              <input className="field" value={minFiat} onChange={(event) => setMinFiat(event.target.value)} placeholder="Min quote" />
              <input className="field" value={maxFiat} onChange={(event) => setMaxFiat(event.target.value)} placeholder="Max quote" />
              <select className="field" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest</option><option value="price_asc">Best buy price</option><option value="price_desc">Best sell price</option></select>
              <button onClick={() => token && load(token)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 font-bold"><Filter size={16} /> Apply</button>
            </div>
          </div>

          <div className="grid gap-3">
            {ads.map((ad) => (
              <article key={ad.id} className={`rounded-2xl border p-4 transition ${selectedAd?.id === ad.id ? "border-brand bg-brand/5" : "border-white/10 bg-[#0f141d]"}`}>
                <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-black">{ad.username}</h2>
                      <span className="rounded-lg bg-emerald-500/15 px-2 py-1 text-xs font-bold text-emerald-300">{Number(ad.completionRate ?? 100).toFixed(1)}% completion</span>
                      <span className="rounded-lg bg-white/5 px-2 py-1 text-xs text-gray-300"><ShieldCheck size={13} className="inline" /> escrow</span>
                      {ad.id.startsWith("preview-") && <span className="rounded-lg bg-amber-500/15 px-2 py-1 text-xs text-amber-300">preview</span>}
                    </div>
                    <div className="mt-3 grid gap-3 text-sm md:grid-cols-5">
                      <div><div className="text-gray-500">Price</div><div className="text-2xl font-black">{ad.fiat_currency} {Number(ad.price).toFixed(2)}</div></div>
                      <div><div className="text-gray-500">Avail.</div><div className="font-bold">{Number(ad.available_amount).toFixed(2)} {ad.asset_symbol}</div></div>
                      <div><div className="text-gray-500">Limits</div><div className="font-bold">{ad.fiat_currency} {Number(ad.min_limit).toFixed(0)} - {Number(ad.max_limit).toFixed(0)}</div></div>
                      <div><div className="text-gray-500">Web3</div><div className="font-bold">{(ad.paymentMethods ?? []).join(", ")}</div></div>
                      <div><div className="text-gray-500">Stats</div><div className="font-bold">{ad.completedOrders ?? 0} / {ad.disputeCount ?? 0}</div></div>
                    </div>
                  </div>
                  <button onClick={() => chooseAd(ad)} className={`rounded-xl px-5 py-3 font-black ${side === "buy" ? "bg-emerald-500 text-ink" : "bg-rose-500 text-white"}`}>{side === "buy" ? "Buy" : "Sell"} {ad.asset_symbol}</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-[#0f141d] p-4">
            <div className="mb-3 flex items-center gap-2"><ArrowLeftRight className="text-brand" /><h2 className="font-black">Ticket</h2></div>
            {!selectedAd ? <div className="rounded-xl bg-white/5 p-3 text-sm text-gray-400">Select offer.</div> : (
              <div className="grid gap-3">
                <div className="rounded-xl bg-white/5 p-3 text-sm">
                  <div className="font-black">{selectedAd.username}</div>
                  <div className="text-gray-400">{selectedAd.fiat_currency} {Number(selectedAd.price).toFixed(2)} per {selectedAd.asset_symbol}</div>
                </div>
                <input className="field" type="number" value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
                <select className="field" value={selectedPayment} onChange={(event) => setSelectedPayment(event.target.value)}>
                  {(selectedAd.paymentMethods ?? defaultP2PWeb3PaymentMethods).map((method) => <option key={method}>{method}</option>)}
                </select>
                <div className="rounded-xl bg-white/5 p-3 text-sm">
                  <div className="text-gray-500">Total</div>
                  <div className="text-2xl font-black">{selectedAd.fiat_currency} {fiatTotal.toFixed(2)}</div>
                </div>
                {ticketError && <div className="rounded-xl bg-rose-500/15 p-3 text-sm text-rose-300">{ticketError}</div>}
                <button disabled={Boolean(ticketError)} onClick={openOrder} className="rounded-xl bg-brand px-4 py-3 font-black disabled:cursor-not-allowed disabled:opacity-50">Open</button>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0f141d] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Plus className="text-brand" /><h2 className="font-black">Create Ad</h2></div>
              <button onClick={() => token && load(token)} className="rounded-lg p-2 hover:bg-white/5"><RefreshCw size={16} /></button>
            </div>
            <div className="grid gap-3">
              <select className="field" value={form.side} onChange={(event) => setForm((value) => ({ ...value, side: event.target.value }))}><option value="sell">Sell</option><option value="buy">Buy</option></select>
              <input className="field" type="number" value={form.price} onChange={(event) => setForm((value) => ({ ...value, price: Number(event.target.value) }))} placeholder="Price" />
              <input className="field" type="number" value={form.availableAmount} onChange={(event) => setForm((value) => ({ ...value, availableAmount: Number(event.target.value) }))} placeholder="Available" />
              <div className="grid grid-cols-2 gap-2">
                <input className="field" type="number" value={form.minLimit} onChange={(event) => setForm((value) => ({ ...value, minLimit: Number(event.target.value) }))} placeholder="Min quote" />
                <input className="field" type="number" value={form.maxLimit} onChange={(event) => setForm((value) => ({ ...value, maxLimit: Number(event.target.value) }))} placeholder="Max quote" />
              </div>
              <div className="rounded-xl border border-white/10 bg-black/15 p-2">
                <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-gray-500">Web3 settlement</div>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                  {p2pWeb3PaymentMethods.map((method) => {
                    const selected = form.paymentMethods.split(",").map((item) => item.trim()).includes(method);
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => toggleFormPaymentMethod(method)}
                        className={`min-h-9 rounded-lg border px-2 text-xs font-black ${selected ? "border-brand bg-brand text-ink" : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"}`}
                      >
                        {method}
                      </button>
                    );
                  })}
                </div>
              </div>
              <textarea className="field min-h-16" value={form.terms} onChange={(event) => setForm((value) => ({ ...value, terms: event.target.value }))} placeholder="Terms" />
              <button onClick={createAd} className="rounded-xl bg-brand px-4 py-3 font-black">Publish</button>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0f141d] p-4">
            <div className="mb-3 flex items-center gap-2"><Wallet className="text-brand" /><h2 className="font-black">My Orders</h2></div>
            <div className="max-h-[480px] space-y-2 overflow-auto">
              {orders.length === 0 && <div className="rounded-xl bg-white/5 p-3 text-sm text-gray-400">No orders.</div>}
              {orders.map((order) => (
                <button key={order.id} onClick={() => chooseOrder(order)} className={`w-full rounded-xl p-3 text-left text-sm ${selectedOrder?.id === order.id ? "bg-brand text-ink" : "bg-white/5 hover:bg-white/10"}`}>
                  <div className="flex justify-between gap-3"><span className="font-bold">{order.asset_amount} {order.asset_symbol}</span><span>{order.status}</span></div>
                  <div className="text-xs opacity-70">{order.fiat_currency} {Number(order.fiat_amount).toFixed(2)} via {order.payment_method}</div>
                  <div className="mt-1 text-xs opacity-70">{currentUserId === order.buyer_id ? `Seller: ${order.seller_username}` : `Buyer: ${order.buyer_username}`}</div>
                </button>
              ))}
            </div>
          </section>

          {selectedOrder && (
            <section className="rounded-2xl border border-white/10 bg-[#0f141d] p-4">
              <div className="mb-3 flex items-center gap-2"><MessageCircle className="text-brand" /><h2 className="font-black">Room</h2></div>
              <div className="mb-3 rounded-xl bg-white/5 p-3 text-sm">
                <div className="flex justify-between gap-3"><span className="font-bold">{selectedOrder.asset_amount} {selectedOrder.asset_symbol}</span><span className="text-brand">{selectedOrder.status}</span></div>
                <div className="text-xs text-gray-400">{selectedOrder.fiat_currency} {Number(selectedOrder.fiat_amount).toFixed(2)} - exp {selectedOrder.expires_at ?? "n/a"}</div>
              </div>
              <div className="grid gap-2">
                {currentUserId === selectedOrder.buyer_id && selectedOrder.status === "escrow_locked" && (
                  <>
                    <input className="field" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Tx hash or wallet reference" />
                    <input className="field" value={proofNote} onChange={(event) => setProofNote(event.target.value)} placeholder="Network or proof note" />
                    <button onClick={() => action(selectedOrder.id, "pay")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 font-bold text-ink"><CheckCircle2 size={16} /> Sent</button>
                  </>
                )}
                {currentUserId === selectedOrder.seller_id && selectedOrder.status === "payment_sent" && <button onClick={() => action(selectedOrder.id, "release")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500/20 px-3 py-2 font-bold text-emerald-300"><CheckCircle2 size={16} /> Release</button>}
                {selectedOrder.status === "escrow_locked" && <button onClick={() => action(selectedOrder.id, "cancel")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 font-bold"><Ban size={16} /> Cancel</button>}
                {!closedStatuses.has(String(selectedOrder.status)) && (
                  <>
                    <input className="field" value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} placeholder="Reason" />
                    <button onClick={() => action(selectedOrder.id, "dispute")} className="rounded-xl bg-rose-500/20 px-3 py-2 font-bold text-rose-300">Dispute</button>
                  </>
                )}
              </div>
              <div className="mt-4 max-h-52 space-y-2 overflow-auto rounded-xl bg-[#0b0f16] p-3">
                {messages.length === 0 && <div className="text-sm text-gray-500">No messages.</div>}
                {messages.map((message) => <div key={message.id} className={`rounded-xl p-2 text-sm ${message.user_id === currentUserId ? "ml-8 bg-brand text-ink" : "mr-8 bg-white/10"}`}><div>{message.message}</div><div className="mt-1 text-[10px] opacity-60">{message.username} - {message.created_at}</div></div>)}
              </div>
              {!closedStatuses.has(String(selectedOrder.status)) && <div className="mt-3 grid grid-cols-[1fr_auto] gap-2"><input className="field" value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Message" /><button onClick={sendMessage} className="rounded-xl bg-brand px-3"><Send size={16} /></button></div>}
            </section>
          )}

          {notice && <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300"><MessageCircle className="mb-2 text-brand" />{notice}</div>}
          <Link href="/trade" className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 font-bold"><Wallet size={17} /> Trade</Link>
        </aside>
      </div>
    </div>
    </PublicThemeShell>
  );
}
