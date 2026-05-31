"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Share2, Users } from "lucide-react";
import { PublicThemeShell } from "./public-theme-shell";
import { PublicThemeToggle } from "./public-theme-toggle";

export function ReferralsApp() {
  const [data, setData] = useState<any>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    fetch("/api/referrals/my-referral", { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.json())
      .then(setData)
      .catch(() => setNotice("Could not load referral data."));
  }, []);

  async function copy() {
    if (!data?.referralLink) return;
    await navigator.clipboard?.writeText(data.referralLink);
    setNotice("Referral link copied");
  }

  return (
    <PublicThemeShell>
    <div className="min-h-screen bg-ink p-5 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <Link href="/trade" className="text-sm text-gray-400 hover:text-white">Back to trade</Link>
          <PublicThemeToggle />
        </div>
        <h1 className="mb-6 mt-6 text-4xl font-black">Referrals</h1>
        {notice && <div className="mb-4 rounded-xl bg-white/5 p-3 text-sm text-gray-300">{notice}</div>}
        <section className="glass mb-4 rounded-2xl p-5">
          <Share2 className="mb-4 text-brand" />
          <h2 className="mb-2 font-bold">Your Referral Link</h2>
          <div className="mb-4 break-all rounded-xl bg-white/5 p-3 text-sm text-gray-300">{data?.referralLink ?? "Loading..."}</div>
          <button onClick={copy} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-3 font-bold"><Copy size={16} /> Copy Link</button>
        </section>
        <section className="grid gap-4 md:grid-cols-3">
          <Metric label="Total Referrals" value={data?.totalReferrals ?? 0} />
          <Metric label="Total Earned" value={`$${Number(data?.totalEarned ?? 0).toFixed(2)}`} />
          <Metric label="Pending Today" value={`$${Number(data?.pendingCommission ?? 0).toFixed(2)}`} />
        </section>
        <section className="glass mt-4 rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2 font-bold"><Users size={18} /> Recent Referrals</div>
          {(data?.recentReferrals ?? []).length === 0 && <div className="rounded-xl bg-white/5 p-4 text-sm text-gray-400">No referred users yet.</div>}
          {(data?.recentReferrals ?? []).map((user: any) => (
            <div key={user.id} className="mb-2 rounded-xl bg-white/5 p-3 text-sm">
              <div className="font-bold">{user.username}</div>
              <div className="text-xs text-gray-500">{user.email}</div>
            </div>
          ))}
        </section>
      </div>
    </div>
    </PublicThemeShell>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="glass rounded-2xl p-5"><div className="text-sm text-gray-500">{label}</div><div className="text-3xl font-black">{value}</div></div>;
}
