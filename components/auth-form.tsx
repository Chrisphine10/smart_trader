"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";

type Mode = "login" | "register" | "forgot" | "admin";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const authQuery = params.toString();
  const loginHref = authQuery ? `/login?${authQuery}` : "/login";
  const registerHref = authQuery ? `/register?${authQuery}` : "/register";
  const showDevAdminSeed = mode === "admin" && process.env.NODE_ENV !== "production";
  const showExampleLogins = mode === "login" && process.env.NODE_ENV !== "production";
  const [email, setEmail] = useState(showDevAdminSeed ? "admin@tagoption.local" : "");
  const [password, setPassword] = useState(showDevAdminSeed ? "admin12345" : "");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      if (mode === "forgot") {
        setMessage("Sandbox reset link generated. Use your seeded account or register again.");
        return;
      }
      const endpoint = mode === "admin" ? "/api/admin/login" : mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, username, referralCode: params.get("ref") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Request failed");
      localStorage.setItem(mode === "admin" ? "adminToken" : "token", data.token);
      if (mode !== "admin") {
        const switchResponse = await fetch("/api/auth/switch-account", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.token}` },
          body: JSON.stringify({ mode: "real" }),
        });
        const switchData = await switchResponse.json().catch(() => ({}));
        if (!switchResponse.ok) throw new Error(switchData.error ?? "Unable to open real account mode");
        if (switchData.token) localStorage.setItem("token", switchData.token);
      }
      const redirect = params.get("redirect");
      const safeRedirect = redirect?.startsWith("/") && !redirect.startsWith("//") ? redirect : "/trade";
      router.push(mode === "admin" ? "/admin" : safeRedirect);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function demo() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/demo", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.token) throw new Error(data.error ?? "Unable to start demo account");
      localStorage.setItem("token", data.token);
      router.push("/trade?account=demo");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start demo account");
    } finally {
      setLoading(false);
    }
  }

  async function adminExample() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@tagoption.local", password: "admin12345" }),
      });
      const data = await response.json();
      if (!response.ok || !data.token) throw new Error(data.error ?? "Unable to open admin account");
      localStorage.setItem("adminToken", data.token);
      router.push("/admin");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to open admin account");
    } finally {
      setLoading(false);
    }
  }

  const title = mode === "register" ? "Create account" : mode === "forgot" ? "Forgot Password?" : mode === "admin" ? "Admin Panel" : "Welcome back";
  const subtitle = mode === "admin" ? "Sign in to manage users, trades, and sandbox funds" : mode === "register" ? "Start trading in the sandbox in seconds" : mode === "forgot" ? "Enter your email to receive a verification code" : "Sign in to your account to continue";

  return (
    <form onSubmit={submit} className="glass w-full max-w-md rounded-2xl p-6 shadow-glow">
      <h1 className="mb-2 text-3xl font-bold">{title}</h1>
      <p className="mb-6 text-sm text-gray-400">{subtitle}</p>
      {mode === "register" && (
        <label className="mb-4 block text-sm font-medium">
          Username
          <input className="field mt-2" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Fred Otieno" />
        </label>
      )}
      <label className="mb-4 block text-sm font-medium">
        Email Address
        <input className="field mt-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
      </label>
      {mode !== "forgot" && (
        <label className="mb-4 block text-sm font-medium">
          Password
          <input className="field mt-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required />
        </label>
      )}
      {message && <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-gray-300">{message}</div>}
      <button disabled={loading} className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 font-semibold shadow-glow disabled:opacity-60">
        {loading ? <Loader2 size={16} className="animate-spin" /> : null}
        {mode === "forgot" ? "Send Verification Code" : mode === "register" ? "Create Account" : "Sign In"}
        {!loading && <ArrowRight size={16} />}
      </button>
      {showExampleLogins && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="mb-2 text-xs font-bold uppercase text-gray-500">Example logins</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" disabled={loading} onClick={demo} className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/5 disabled:opacity-60">User account</button>
            <button type="button" disabled={loading} onClick={adminExample} className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/5 disabled:opacity-60">Admin account</button>
          </div>
        </div>
      )}
      {mode === "login" && !showExampleLogins && (
        <button type="button" onClick={demo} className="mb-4 w-full rounded-xl border border-white/10 px-5 py-3 font-semibold hover:bg-white/5">Try Demo</button>
      )}
      <div className="text-center text-sm text-gray-400">
        {mode === "login" && <>Don't have an account? <Link className="text-brand" href={registerHref}>Create account</Link></>}
        {mode === "register" && <>Already have an account? <Link className="text-brand" href={loginHref}>Log in</Link></>}
        {mode === "forgot" && <Link className="text-brand" href={loginHref}>Back to Login</Link>}
      </div>
      {mode === "login" && <div className="mt-3 text-center text-xs"><Link className="text-gray-500 hover:text-white" href="/forgot-password">Forgot password?</Link></div>}
    </form>
  );
}
