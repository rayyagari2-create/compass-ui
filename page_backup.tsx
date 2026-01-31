"use client";

import React, { useMemo, useState } from "react";

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

type ApiResponse = {
  session_id?: string;
  ok?: boolean;
  messages?: ChatMessage[];
  card?: Card | null;
  balances?: { checking: number; savings: number }; // ✅ IMPORTANT (from /action)
  debug?: any;
};

const API_BASE = "http://127.0.0.1:8000";

function bubbleClass(role: Role) {
  if (role === "user") {
    return "ml-auto bg-blue-700/70 border border-blue-400/20 text-white";
  }
  return "mr-auto bg-zinc-900/70 border border-white/10 text-zinc-50";
}

export default function Home() {
  const [sessionId] = useState("demo-session");
  const [userId] = useState("ramesh");

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi Ramesh — how can I help today?" },
  ]);

  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [balances, setBalances] = useState<{ checking: number; savings: number } | null>(null);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const quickChips = useMemo(
    () => ["recurring charges", "account summary", "transfer $25"],
    []
  );

  function appendAssistantMessages(apiMessages?: ChatMessage[]) {
    if (!Array.isArray(apiMessages) || apiMessages.length === 0) return;
    const assistantsOnly = apiMessages
      .filter((m) => m?.role === "assistant" && (m.content ?? "").trim().length > 0)
      .map((m) => ({ role: "assistant" as const, content: m.content }));
    if (assistantsOnly.length) setMessages((prev) => [...prev, ...assistantsOnly]);
  }

  function applyApi(data: ApiResponse | null) {
    if (!data) return;

    // ✅ update balances if returned (your /action returns this)
    if (data.balances) setBalances(data.balances);

    // messages + card
    appendAssistantMessages(data.messages);
    if (data.card) setActiveCard(data.card);
  }

  async function callOrchestrate(text: string) {
    const payload = {
      session_id: sessionId,
      user_id: userId,
      channel: "web",
      text,
      context: {},
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
        { role: "assistant", content: `Error calling /orchestrate (${res.status}).\n${errText}` },
      ]);
      return null;
    }

    const data = (await res.json()) as ApiResponse;
    console.log("API /orchestrate:", data);
    return data;
  }

  async function callAction(action: CardAction) {
    const payload = {
      session_id: sessionId,
      user_id: userId,
      action_name: action.action_name || "", // your API expects action_name
      params: action.params ?? {},
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

    const data = (await res.json()) as ApiResponse;
    console.log("API /action:", data);
    return data;
  }

  async function send(text?: string) {
    const t = (text ?? input).trim();
    if (!t || loading) return;

    setLoading(true);
    setInput("");

    // show user message immediately
    setMessages((m) => [...m, { role: "user", content: t }]);

    try {
      const data = await callOrchestrate(t);
      applyApi(data);
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
    if (loading) return;
    if (!a.action_name) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `This action is missing action_name: ${a.label}` },
      ]);
      return;
    }

    setLoading(true);
    try {
      const data = await callAction(a);
      applyApi(data);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `UI error: ${String(e?.message ?? e)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-black to-black text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="mb-6">
          <h1 className="text-5xl font-semibold tracking-tight">Compass</h1>
          <p className="mt-2 text-zinc-300">Your digital banking assistant (demo)</p>

          {/* ✅ Updated balances shown here after confirm_transfer */}
          {balances ? (
            <div className="mt-3 text-sm text-zinc-300">
              <span className="text-zinc-400">Balances (demo): </span>
              <span className="font-medium">
                Checking: ${Number(balances.checking ?? 0).toFixed(2)}
              </span>
              <span className="mx-2 text-zinc-500">•</span>
              <span className="font-medium">
                Savings: ${Number(balances.savings ?? 0).toFixed(2)}
              </span>
            </div>
          ) : null}
        </header>

        <div className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_80px_rgba(0,0,0,0.65)] backdrop-blur-md">
          <div className="p-6">
            <div className="mb-6 flex items-center justify-between">
              <div className="text-sm text-zinc-300">Compass</div>
              <button
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
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
              {loading ? (
                <div className="mr-auto max-w-[85%] rounded-2xl px-4 py-3 text-[15px] bg-zinc-900/70 border border-white/10 text-zinc-50">
                  …
                </div>
              ) : null}
            </div>

            {/* Quick chips */}
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

            {/* Card */}
            {activeCard ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold">{activeCard.title}</div>
                    {activeCard.subtitle ? (
                      <div className="mt-1 text-sm text-zinc-300">{activeCard.subtitle}</div>
                    ) : null}
                  </div>
                </div>

                {activeCard.body ? (
                  <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-white/5 p-4 text-sm text-zinc-100">
                    {activeCard.body}
                  </pre>
                ) : null}

                {/* ✅ Actions wired to /action */}
                {activeCard.actions && activeCard.actions.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {activeCard.actions.map((a, i) => (
                      <button
                        key={i}
                        className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
                        disabled={loading}
                        onClick={() => onActionClick(a)}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

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

        <div className="mt-8 text-xs text-zinc-500">
          Demo-safe: no real banking actions occur.
        </div>
      </div>
    </div>
  );
}
