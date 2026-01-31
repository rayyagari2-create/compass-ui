"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const AUTH_KEY = "compass_demo_auth";
const DEMO_PASSWORD = "demo123";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Already logged in → redirect home
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (raw && JSON.parse(raw)?.loggedIn) {
        router.replace("/");
      }
    } catch {}
  }, [router]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError("Username is required.");
      return;
    }

    if (password !== DEMO_PASSWORD) {
      setError("Invalid password (hint: demo123).");
      return;
    }

    localStorage.setItem(
      AUTH_KEY,
      JSON.stringify({
        loggedIn: true,
        username: username.trim(),
        ts: Date.now(),
      })
    );

    router.replace("/");
  }

  return (
    <div className="min-h-screen bg-[#050712] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_100px_rgba(0,0,0,0.75)] backdrop-blur-md">
        <h1 className="text-3xl font-semibold tracking-tight">Compass</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Secure demo login
        </p>

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-blue-500/60"
              placeholder="ramesh"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-blue-500/60"
              placeholder="demo123"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="mt-2 w-full rounded-xl bg-blue-600 py-3 font-medium hover:bg-blue-500"
          >
            Sign in
          </button>
        </form>

        <p className="mt-4 text-xs text-zinc-500">
          Demo password: <span className="text-zinc-300">demo123</span>
        </p>
      </div>
    </div>
  );
}
