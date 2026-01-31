"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from "recharts";

/* -------------------- Types -------------------- */

type Role = "user" | "assistant";

type ChatMessage = {
  role: Role;
  content: string;
};

type CardAction = {
  label: string;
  action_name?: string;
  params?: any;
};

type Card = {
  title: string;
  subtitle?: string;
  body?: string;
  actions?: CardAction[];
};

type ChartsPayload = {
  pie?: { name: string; value: number }[];
  trend?: { day: string; value: number }[];
};

type ApiResponse = {
  session_id?: string;
  messages?: ChatMessage[];
  card?: Card | null;
  debug?: any;
  ok?: boolean;
};

/* -------------------- Constants -------------------- */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";
const AUTH_KEY = "compass_demo_auth";

// Multi-color palette for pie slices
const PIE_COLORS = ["#60a5fa", "#34d399", "#fbbf24", "#a78bfa", "#fb7185", "#22d3ee"];

/* -------------------- Helpers -------------------- */

function bubbleClass(role: Role) {
  if (role === "user") {
    return "ml-auto bg-blue-600/70 border border-blue-200/10 text-white shadow-[0_12px_30px_rgba(37,99,235,0.18)]";
  }
  return "mr-auto bg-white/5 border border-white/10 text-zinc-50 shadow-[0_12px_30px_rgba(0,0,0,0.25)]";
}

/* -------------------- Page -------------------- */

export default function Home() {
  const router = useRouter();

  /* ---------- Auth guard ---------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      const auth = raw ? JSON.parse(raw) : null;
      if (!auth?.loggedIn) router.replace("/login");
    } catch {
      router.replace("/login");
    }
  }, [router]);

  /* ---------- State ---------- */

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi Ramesh — how can I help today?" },
  ]);

  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [charts, setCharts] = useState<ChartsPayload | null>(null);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const quickChips = useMemo(
    () => [
      "insights",
      "spend analysis",
      "recurring charges",
      "account summary",
      "transfer $25 from savings to checking",
      "upcoming travel",
      "cd maturity alert",
      "talk to an agent",
    ],
    []
  );

  /* ---------- API Calls ---------- */

  async function callOrchestrate(text: string) {
    const payload = {
      session_id: "demo-session",
      user_id: "ramesh",
      channel: "web",
      text,
    };

    const res = await fetch(`${API_BASE}/orchestrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Error calling API (${res.status}).\n${errText}` },
      ]);
      return null;
    }

    return (await res.json()) as ApiResponse;
  }

  async function callAction(action_name: string, params: any) {
    const payload = {
      session_id: "demo-session",
      user_id: "ramesh",
      action_name,
      params: params ?? {},
    };

    const res = await fetch(`${API_BASE}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Error calling /action (${res.status}).\n${errText}` },
      ]);
      return null;
    }

    return (await res.json()) as ApiResponse;
  }

  /* ---------- Response Handling ---------- */

  function applyApiResponse(data: ApiResponse | null) {
    if (!data) return;

    // 1) Append assistant messages (avoid duplicates + keep UX clean)
    if (Array.isArray(data.messages) && data.messages.length > 0) {
      setMessages((m) => {
        const assistantsOnly = data.messages!
          .filter((x) => x && x.role === "assistant")
          .map((x) => ({ role: "assistant" as const, content: x.content ?? "" }))
          .filter((x) => x.content.trim().length > 0);
        return [...m, ...assistantsOnly];
      });
    } else {
      setMessages((m) => [...m, { role: "assistant", content: "No response (demo)." }]);
    }

    // 2) Card
    if (data.card) setActiveCard(data.card);

    // 3) Charts (from debug.charts in /orchestrate)
    const nextCharts = data.debug?.charts;
    if (nextCharts) setCharts(nextCharts);
    else if (data.card?.title !== "Spend Analysis") setCharts(null);
  }

  /* ---------- Actions ---------- */

  async function send(text?: string) {
    const t = (text ?? input).trim();
    if (!t || loading) return;

    setLoading(true);
    setInput("");

    // show user message immediately
    setMessages((m) => [...m, { role: "user", content: t }]);

    try {
      const data = await callOrchestrate(t);
      applyApiResponse(data);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `UI error: ${String(e?.message ?? e)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function onActionClick(a: CardAction) {
    if (!a.action_name) return;

    setLoading(true);
    try {
      const data = await callAction(a.action_name, a.params);
      applyApiResponse(data);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Action UI error: ${String(e?.message ?? e)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const isSpendCard = activeCard?.title === "Spend Analysis";

  return (
    <div className="min-h-screen bg-[#050712] text-white">
      {/* Premium background glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_0%,rgba(37,99,235,0.28)_0%,rgba(5,7,18,0)_62%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_85%,rgba(0,0,0,0.55)_0%,rgba(0,0,0,0)_60%)]" />

      <div className="relative mx-auto max-w-4xl px-6 py-10">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-5xl font-semibold tracking-tight font-serif">Compass</h1>
            <p className="mt-2 text-zinc-300">
              Your digital banking assistant <span className="opacity-70">(demo)</span>
            </p>
          </div>

          <button
            onClick={() => {
              localStorage.removeItem(AUTH_KEY);
              window.location.href = "/login";
            }}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10"
          >
            Logout
          </button>
        </header>

        {/* Device frame */}
        <div className="mx-auto w-full max-w-3xl rounded-[34px] border border-white/10 bg-white/[0.06] shadow-[0_30px_120px_rgba(0,0,0,0.75)] backdrop-blur-xl">
          <div className="p-6 sm:p-7">
            {/* Device notch */}
            <div className="mb-5 flex items-center justify-center">
              <div className="h-1.5 w-16 rounded-full bg-white/15" />
            </div>

            {/* Top bar */}
            <div className="mb-5 flex items-center justify-between">
              <div className="text-xs tracking-wide text-zinc-300">Compass</div>
              <button
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                onClick={() => send("insights")}
                disabled={loading}
              >
                Insights
              </button>
            </div>

            {/* Chat */}
            <div className="space-y-3">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-snug ${bubbleClass(
                    m.role
                  )}`}
                >
                  {m.content}
                </div>
              ))}
            </div>

            {/* Chips */}
            <div className="mt-5 flex flex-wrap gap-2">
              {quickChips.map((c) => (
                <button
                  key={c}
                  onClick={() => send(c)}
                  disabled={loading}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-100 hover:bg-white/10 disabled:opacity-50"
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Card */}
            {activeCard && (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-zinc-50">{activeCard.title}</div>
                    {activeCard.subtitle ? (
                      <div className="mt-1 text-sm text-zinc-300">{activeCard.subtitle}</div>
                    ) : null}
                  </div>
                </div>

                {activeCard.body ? (
                  <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-100">
                    {activeCard.body}
                  </pre>
                ) : null}

                {/* Spend charts */}
                {isSpendCard && charts && (
                  <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {/* Pie */}
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="mb-2 text-sm text-zinc-200">Top categories</div>
                      <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={charts.pie ?? []}
                              dataKey="value"
                              nameKey="name"
                              outerRadius={82}
                              innerRadius={42}
                              paddingAngle={2}
                              stroke="#0b1220"
                              strokeWidth={2}
                            >
                              {(charts.pie ?? []).map((_, i) => (
                                <Cell key={`cell-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                           <Tooltip
  contentStyle={{
    background: "#0b1220",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "12px",
  }}
  labelStyle={{ color: "#ffffff", fontWeight: 600 }}
  itemStyle={{ color: "rgba(255,255,255,0.9)" }}
    cursor={{ fill: "rgba(255,255,255,0.04)" }}
/>

                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Trend */}
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="mb-2 text-sm text-zinc-200">Spend trend</div>
                      <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={charts.trend ?? []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid stroke="rgba(255,255,255,0.10)" strokeDasharray="3 3" />
                            <XAxis
                              dataKey="day"
                              stroke="rgba(255,255,255,0.60)"
                              tick={{ fill: "rgba(255,255,255,0.70)" }}
                            />
                            <YAxis
                              stroke="rgba(255,255,255,0.60)"
                              tick={{ fill: "rgba(255,255,255,0.70)" }}
                            />
                            <Tooltip
                              contentStyle={{
                                background: "#0b1220",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                borderRadius: "12px",
                              }}
                              labelStyle={{ color: "#fff" }}
                            />
                            <Line
                              type="monotone"
                              dataKey="value"
                              stroke="#60a5fa"
                              strokeWidth={3}
                              dot={{ r: 3, stroke: "#60a5fa", strokeWidth: 2, fill: "#0b1220" }}
                              activeDot={{ r: 5 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                {activeCard.actions && activeCard.actions.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {activeCard.actions.map((a, i) => (
                      <button
                        key={i}
                        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-100 hover:bg-white/10 disabled:opacity-50"
                        onClick={() => onActionClick(a)}
                        disabled={loading}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {/* Input */}
            <form
              className="mt-5 flex items-center gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type or ask me something"
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-white outline-none placeholder:text-zinc-400 focus:border-blue-500/60"
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-2xl bg-blue-600 px-6 py-4 font-medium hover:bg-blue-500 disabled:opacity-50 shadow-[0_12px_30px_rgba(37,99,235,0.25)]"
              >
                {loading ? "..." : "Send"}
              </button>
            </form>

            <div className="mt-2 text-xs text-zinc-400">Tip: Press Enter to send.</div>
          </div>
        </div>

        <div className="mt-8 text-xs text-zinc-500">Demo-safe: no real banking actions occur.</div>
      </div>
    </div>
  );
}
