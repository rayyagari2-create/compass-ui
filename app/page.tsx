"use client";

import React, { useMemo, useState } from "react";
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
} from "recharts";

type Role = "user" | "assistant";

/** Chat items can be normal text bubbles OR an inline card */
type ChatItem =
  | { kind: "msg"; role: Role; content: string }
  | { kind: "card"; card: Card; charts?: ChartsPayload | null };

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
  messages?: { role: Role; content: string }[];
  card?: Card | null;
  debug?: any;
};

type ActionResponse = {
  ok?: boolean;
  messages?: { role: Role; content: string }[];
  card?: Card | null;
  debug?: any;
};

// ✅ Use env var in prod, fallback to local for dev
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.trim() || "http://127.0.0.1:8000";

function bubbleClass(role: Role) {
  if (role === "user") {
    return "ml-auto bg-blue-700/70 border border-blue-400/20 text-white";
  }
  return "mr-auto bg-zinc-900/70 border border-white/10 text-zinc-50";
}

export default function Home() {
  const [sessionId] = useState("demo-session");
  const [userId] = useState("ramesh");

  const [items, setItems] = useState<ChatItem[]>([
    { kind: "msg", role: "assistant", content: "Hi Ramesh — how can I help today?" },
  ]);

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
      setItems((it) => [
        ...it,
        {
          kind: "msg",
          role: "assistant",
          content: `Error calling API (${res.status}).\n${errText}`,
        },
      ]);
      return null;
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
      setItems((it) => [
        ...it,
        {
          kind: "msg",
          role: "assistant",
          content: `Error calling /action (${res.status}).\n${errText}`,
        },
      ]);
      return null;
    }

    return (await res.json()) as ActionResponse;
  }

  /** Append assistant messages + inline card (right after those messages) */
  function applyApiResponse(data: OrchestrateResponse | ActionResponse | null) {
    if (!data) return;

    const assistantMsgs =
      Array.isArray(data.messages) && data.messages.length > 0
        ? data.messages
            .filter((m) => m && m.role === "assistant" && (m.content ?? "").trim().length > 0)
            .map((m) => ({ kind: "msg" as const, role: "assistant" as const, content: m.content }))
        : [{ kind: "msg" as const, role: "assistant" as const, content: "No response (demo)." }];

    // Charts only come from /orchestrate debug
    const chartsFromDebug = (data as any)?.debug?.charts as ChartsPayload | undefined;

    setItems((it) => {
      const next: ChatItem[] = [...it, ...assistantMsgs];

      // ✅ Inline card appears immediately after the assistant message
      if (data.card) {
        next.push({
          kind: "card",
          card: data.card,
          charts: chartsFromDebug ?? null,
        });
      }

      return next;
    });
  }

  async function send(text?: string) {
    const t = (text ?? input).trim();
    if (!t || loading) return;

    setLoading(true);
    setInput("");

    // show user message immediately
    setItems((it) => [...it, { kind: "msg", role: "user", content: t }]);

    try {
      const data = await callOrchestrate(t);
      applyApiResponse(data);
    } catch (e: any) {
      setItems((it) => [
        ...it,
        { kind: "msg", role: "assistant", content: `UI error: ${String(e?.message ?? e)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function onActionClick(a: CardAction) {
    const actionName = a.action_name;
    if (!actionName) return;

    setLoading(true);
    try {
      const data = await callAction(actionName, a.params);
      applyApiResponse(data);
    } catch (e: any) {
      setItems((it) => [
        ...it,
        { kind: "msg", role: "assistant", content: `Action UI error: ${String(e?.message ?? e)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  /** Inline Card renderer (same look as you had, but inside the chat flow) */
  function InlineCard({ card, charts }: { card: Card; charts?: ChartsPayload | null }) {
    return (
      <div className="mr-auto w-full max-w-[92%] rounded-2xl border border-white/10 bg-black/40 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">{card.title}</div>
            {card.subtitle ? (
              <div className="mt-1 text-sm text-zinc-300">{card.subtitle}</div>
            ) : null}
          </div>
        </div>

        {card.body ? (
          <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-white/5 p-4 text-sm text-zinc-100">
            {card.body}
          </pre>
        ) : null}

        {/* Spend charts */}
        {card.title === "Spend Analysis" && charts && (
          <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Pie */}
            <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
              <div className="mb-2 text-sm text-zinc-200">Top categories</div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={charts.pie ?? []}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={80}
                      label
                      fill="#60a5fa"
                      stroke="#0b1220"
                      strokeWidth={2}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0b1220",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "#fff",
                      }}
                      labelStyle={{ color: "#fff" }}
                      itemStyle={{ color: "#fff" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Trend */}
            <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
              <div className="mb-2 text-sm text-zinc-200">Spend trend</div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={charts.trend ?? []}>
                    <CartesianGrid stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="day"
                      stroke="rgba(255,255,255,0.65)"
                      tick={{ fill: "rgba(255,255,255,0.75)" }}
                    />
                    <YAxis
                      stroke="rgba(255,255,255,0.65)"
                      tick={{ fill: "rgba(255,255,255,0.75)" }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0b1220",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "#fff",
                      }}
                      labelStyle={{ color: "#fff" }}
                      itemStyle={{ color: "#fff" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#60a5fa"
                      strokeWidth={3}
                      dot={{ r: 3, stroke: "#60a5fa" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        {card.actions && card.actions.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {card.actions.map((a, i) => (
              <button
                key={i}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
                onClick={() => onActionClick(a)}
                disabled={loading}
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-black to-black text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-5xl font-semibold tracking-tight">Compass</h1>
          <p className="mt-2 text-zinc-300">Your digital banking assistant (demo)</p>
        </header>

        {/* Mobile-ish frame */}
        <div className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_80px_rgba(0,0,0,0.65)] backdrop-blur-md">
          <div className="p-6">
            {/* Top bar */}
            <div className="mb-6 flex items-center justify-between">
              <div className="text-sm text-zinc-300">Compass</div>
              <button
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
                onClick={() => send("insights")}
                disabled={loading}
              >
                Insights
              </button>
            </div>

            {/* Chat (messages + inline cards in correct order) */}
            <div className="space-y-3">
              {items.map((it, idx) => {
                if (it.kind === "msg") {
                  return (
                    <div
                      key={idx}
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-snug ${bubbleClass(
                        it.role
                      )}`}
                    >
                      {it.content}
                    </div>
                  );
                }

                return <InlineCard key={idx} card={it.card} charts={it.charts ?? null} />;
              })}
            </div>

            {/* Quick chips ALWAYS below chat */}
            <div className="mt-6 flex flex-wrap gap-2">
              {quickChips.map((c) => (
                <button
                  key={c}
                  onClick={() => send(c)}
                  disabled={loading}
                  className="rounded-full bg-blue-700/40 px-4 py-2 text-sm text-white hover:bg-blue-700/55 disabled:opacity-50"
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
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-white outline-none placeholder:text-zinc-400 focus:border-blue-500/60"
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-2xl bg-blue-700 px-6 py-4 font-medium hover:bg-blue-600 disabled:opacity-50"
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
