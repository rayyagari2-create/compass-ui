"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Tooltip,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

type Role = "user" | "assistant";

type ChatMessage = {
  role: Role;
  content: string;
};

type CardAction = {
  id?: string;
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

type OrchestrateResponse = {
  session_id?: string;
  messages?: ChatMessage[];
  card?: Card | null;
  debug?: any;
};

type ActionResponse = {
  ok?: boolean;
  messages?: ChatMessage[];
  card?: Card | null;
  debug?: any;
};

type Turn = {
  id: string;
  userText: string;
  assistantText?: string; // primary assistant reply for this turn
  card?: Card | null;
  charts?: ChartsPayload | null; // only for spend analysis turn
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.trim() || "http://127.0.0.1:8000";

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function bubbleClass(role: Role) {
  if (role === "user") {
    // richer “app” bubble
    return "ml-auto bg-blue-600/90 border border-blue-300/15 text-white shadow-[0_8px_24px_rgba(37,99,235,0.25)]";
  }
  return "mr-auto bg-white/8 border border-white/10 text-white/90 shadow-[0_10px_30px_rgba(0,0,0,0.35)]";
}

const PIE_COLORS = [
  "#60a5fa", // blue
  "#34d399", // green
  "#fbbf24", // amber
  "#f472b6", // pink
  "#a78bfa", // violet
  "#fb7185", // rose
];

function DarkTooltip({ active, payload, label }: any) {
  if (!active) return null;
  return (
    <div
      style={{
        background: "rgba(10, 12, 18, 0.92)",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 12,
        padding: "10px 12px",
        color: "white",
        boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
        fontSize: 12,
        maxWidth: 240,
      }}
    >
      {label ? (
        <div style={{ opacity: 0.85, marginBottom: 6 }}>{label}</div>
      ) : null}
      {Array.isArray(payload) &&
        payload.map((p: any, i: number) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: p?.color || "white",
                display: "inline-block",
              }}
            />
            <span style={{ opacity: 0.9 }}>
              {p?.name ?? p?.dataKey}:{" "}
              <b style={{ color: "white" }}>
                {typeof p?.value === "number" ? `$${p.value}` : String(p?.value)}
              </b>
            </span>
          </div>
        ))}
    </div>
  );
}

export default function Home() {
  const [sessionId] = useState("demo-session");
  const [userId] = useState("ramesh");

  // “turns” keeps ordering correct: each user message owns its assistant + card + charts
  const [turns, setTurns] = useState<Turn[]>([
    {
      id: "t0",
      userText: "",
      assistantText: "Hi Ramesh — how can I help today?",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    // keep chat pinned to bottom (mobile-friendly)
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, loading]);

  async function callOrchestrate(text: string) {
    const payload = {
      session_id: sessionId,
      user_id: userId,
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
      throw new Error(`API (${res.status}): ${errText}`);
    }
    return (await res.json()) as OrchestrateResponse;
  }

  async function callAction(action_name: string, params: any) {
    const payload = {
      session_id: sessionId,
      user_id: userId,
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
      throw new Error(`/action (${res.status}): ${errText}`);
    }
    return (await res.json()) as ActionResponse;
  }

  function extractAssistantText(data: OrchestrateResponse | ActionResponse) {
    const msgs = Array.isArray(data.messages) ? data.messages : [];
    // prefer the first assistant message
    const first = msgs.find((m) => m?.role === "assistant" && (m.content ?? "").trim());
    if (first) return first.content.trim();
    return "No response (demo).";
  }

  function extractChartsIfAny(data: OrchestrateResponse | ActionResponse, card?: Card | null) {
    const charts = (data as any)?.debug?.charts as ChartsPayload | undefined;
    // only attach charts to spend analysis cards
    if (card?.title === "Spend Analysis" && charts) return charts;
    return null;
  }

  async function send(text?: string) {
    const t = (text ?? input).trim();
    if (!t || loading) return;

    setLoading(true);
    setInput("");

    const turnId = `t-${Date.now()}`;

    // Add a new turn immediately (user bubble + placeholder assistant)
    setTurns((prev) => [
      ...prev,
      { id: turnId, userText: t, assistantText: "…" },
    ]);

    try {
      const data = await callOrchestrate(t);
      const assistantText = extractAssistantText(data);
      const card = data.card ?? null;
      const charts = extractChartsIfAny(data, card);

      setTurns((prev) =>
        prev.map((x) =>
          x.id === turnId
            ? { ...x, assistantText, card, charts }
            : x
        )
      );
    } catch (e: any) {
      setTurns((prev) =>
        prev.map((x) =>
          x.id === turnId
            ? { ...x, assistantText: `UI error: ${String(e?.message ?? e)}`, card: null, charts: null }
            : x
        )
      );
    } finally {
      setLoading(false);
    }
  }

  async function onActionClick(turnId: string, a: CardAction) {
    const actionName = a.action_name;
    if (!actionName || loading) return;

    setLoading(true);
    try {
      const data = await callAction(actionName, a.params);
      const assistantText = extractAssistantText(data);
      const card = data.card ?? null;
      const charts = extractChartsIfAny(data, card);

      // Update the SAME turn the action belongs to (keeps ordering perfect)
      setTurns((prev) =>
        prev.map((x) =>
          x.id === turnId
            ? {
                ...x,
                assistantText: assistantText, // latest assistant line for that turn
                card,
                charts,
              }
            : x
        )
      );
    } catch (e: any) {
      setTurns((prev) =>
        prev.map((x) =>
          x.id === turnId
            ? { ...x, assistantText: `Action error: ${String(e?.message ?? e)}` }
            : x
        )
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen text-white">
      {/* Background */}
      <div className="fixed inset-0 -z-10 bg-[#060a14]" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_20%_0%,rgba(59,130,246,0.35),transparent_60%),radial-gradient(800px_500px_at_90%_20%,rgba(99,102,241,0.25),transparent_60%),radial-gradient(1000px_700px_at_50%_100%,rgba(16,185,129,0.18),transparent_55%)]" />
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black/0 via-black/10 to-black/40" />

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-6xl font-semibold tracking-tight">
              <span className="drop-shadow-[0_16px_60px_rgba(0,0,0,0.6)]">Compass</span>
            </h1>
            <p className="mt-2 text-white/70">
              Your digital banking assistant <span className="text-white/40">(demo)</span>
            </p>
          </div>

          <button
            className="rounded-full border border-white/12 bg-white/5 px-5 py-2 text-sm text-white/85 shadow-[0_20px_80px_rgba(0,0,0,0.35)] hover:bg-white/10"
            onClick={() => {
              // simple "logout" for demo: reset chat
              setTurns([{ id: "t0", userText: "", assistantText: "Hi Ramesh — how can I help today?" }]);
            }}
          >
            Logout
          </button>
        </header>

        {/* “Phone” frame */}
        <div className="mx-auto w-full max-w-4xl">
          <div className="relative rounded-[36px] border border-white/10 bg-white/5 shadow-[0_30px_140px_rgba(0,0,0,0.65)] backdrop-blur-xl">
            {/* notch */}
            <div className="absolute left-1/2 top-4 h-1.5 w-20 -translate-x-1/2 rounded-full bg-white/15" />

            <div className="p-6 md:p-8">
              {/* top bar */}
              <div className="mb-6 flex items-center justify-between">
                <div className="text-sm text-white/70">Compass</div>
                <button
                  className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm text-white/85 hover:bg-white/10 disabled:opacity-50"
                  onClick={() => send("insights")}
                  disabled={loading}
                >
                  Insights
                </button>
              </div>

              {/* Chat area */}
              <div className="space-y-4">
                {turns.map((t) => {
                  const showUser = t.userText.trim().length > 0;
                  return (
                    <div key={t.id} className="space-y-3">
                      {/* user bubble */}
                      {showUser && (
                        <div className={clsx("max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-snug", bubbleClass("user"))}>
                          {t.userText}
                        </div>
                      )}

                      {/* assistant bubble */}
                      {t.assistantText ? (
                        <div className={clsx("max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-snug", bubbleClass("assistant"))}>
                          {t.assistantText}
                        </div>
                      ) : null}

                      {/* inline card (owned by this turn) */}
                      {t.card ? (
                        <div className="mt-2 rounded-2xl border border-white/10 bg-black/35 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-lg font-semibold text-white/95">{t.card.title}</div>
                              {t.card.subtitle ? (
                                <div className="mt-1 text-sm text-white/65">{t.card.subtitle}</div>
                              ) : null}
                            </div>
                          </div>

                          {t.card.body ? (
                            <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-white/6 p-4 text-sm text-white/85">
                              {t.card.body}
                            </pre>
                          ) : null}

                          {/* spend charts */}
                          {t.card.title === "Spend Analysis" && t.charts ? (
                            <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
                              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                                <div className="mb-2 text-sm text-white/80">Top categories</div>
                                <div className="h-56 w-full">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie
                                        data={t.charts.pie ?? []}
                                        dataKey="value"
                                        nameKey="name"
                                        outerRadius={85}
                                        innerRadius={40}
                                        paddingAngle={2}
                                        stroke="rgba(255,255,255,0.10)"
                                        strokeWidth={1}
                                      >
                                        {(t.charts.pie ?? []).map((_, i) => (
                                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                        ))}
                                      </Pie>
                                      <Tooltip content={<DarkTooltip />} />
                                    </PieChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                                <div className="mb-2 text-sm text-white/80">Spend trend</div>
                                <div className="h-56 w-full">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={t.charts.trend ?? []}>
                                      <CartesianGrid stroke="rgba(255,255,255,0.10)" strokeDasharray="3 3" />
                                      <XAxis
                                        dataKey="day"
                                        stroke="rgba(255,255,255,0.45)"
                                        tick={{ fill: "rgba(255,255,255,0.70)" }}
                                      />
                                      <YAxis
                                        stroke="rgba(255,255,255,0.45)"
                                        tick={{ fill: "rgba(255,255,255,0.70)" }}
                                      />
                                      <Tooltip content={<DarkTooltip />} />
                                      <Line
                                        type="monotone"
                                        dataKey="value"
                                        stroke="#60a5fa"
                                        strokeWidth={3}
                                        dot={{ r: 3, stroke: "#60a5fa", fill: "#0b1220" }}
                                        activeDot={{ r: 5 }}
                                      />
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {/* actions */}
                          {t.card.actions && t.card.actions.length > 0 ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {t.card.actions.map((a, i) => (
                                <button
                                  key={i}
                                  className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white/90 hover:bg-white/15 disabled:opacity-50"
                                  onClick={() => onActionClick(t.id, a)}
                                  disabled={loading}
                                >
                                  {a.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                <div ref={bottomRef} />
              </div>

              {/* Quick chips (kept BELOW conversation so it doesn’t visually split turns) */}
              <div className="mt-6 flex flex-wrap gap-2">
                {quickChips.map((c) => (
                  <button
                    key={c}
                    onClick={() => send(c)}
                    disabled={loading}
                    className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50"
                  >
                    {c}
                  </button>
                ))}
              </div>

              {/* Input */}
              <form
                className="mt-6 flex items-center gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type or ask me something"
                  className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-4 text-white outline-none placeholder:text-white/40 focus:border-blue-500/50"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-2xl bg-blue-600 px-6 py-4 font-medium text-white shadow-[0_14px_50px_rgba(37,99,235,0.25)] hover:bg-blue-500 disabled:opacity-50"
                >
                  {loading ? "…" : "Send"}
                </button>
              </form>

              <div className="mt-2 text-xs text-white/45">Tip: Press Enter to send.</div>
            </div>
          </div>

          <div className="mt-6 text-xs text-white/35">
            Demo-safe: no real banking actions occur.
          </div>
        </div>
      </div>
    </div>
  );
}
