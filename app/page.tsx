"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
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

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Role = "user" | "assistant";

type ChatMessage = { role: Role; content: string };

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

type AgentTraceStep = {
  stage: "Planner" | "Delegate" | "Act" | string;
  agent?: string;
  tool?: string;
  reasoning?: string;
  decision?: string;
  result?: string;
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

type InsightItem = {
  id: string;
  title: string;
  subtitle?: string;
};

type Turn = {
  id: string;
  userText: string;
  assistantText?: string;
  card?: Card | null;
  charts?: ChartsPayload | null;
  trace?: AgentTraceStep[] | null;
  insightsList?: InsightItem[] | null;
  error?: boolean;
  errorRetryText?: string;
};

/* ------------------------------------------------------------------ */
/* Constants & helpers                                                  */
/* ------------------------------------------------------------------ */

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.trim() || "http://127.0.0.1:8000";

// Chase-inspired palette
const CHASE_BLUE = "#0060F0";
const CHASE_BLUE_HOVER = "#0050D0";
const CHASE_NAVY = "#0A1628";

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function bubbleClass(role: Role) {
  if (role === "user") {
    return "ml-auto bg-[#0060F0]/90 border border-[#0060F0]/30 text-white shadow-[0_8px_24px_rgba(0,96,240,0.25)]";
  }
  return "mr-auto bg-white/8 border border-white/10 text-white/90 shadow-[0_10px_30px_rgba(0,0,0,0.35)]";
}

const PIE_COLORS = [
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
  "#fb7185",
];

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

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
        maxWidth: 260,
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

function TypingIndicator() {
  return (
    <div className="mr-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
      <span className="text-sm text-white/60">Compass is thinking</span>
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50" style={{ animationDelay: "0ms" }} />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50" style={{ animationDelay: "150ms" }} />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50" style={{ animationDelay: "300ms" }} />
      </span>
    </div>
  );
}

function stagePill(stage: string) {
  const s = (stage || "").toLowerCase();
  if (s.includes("plan"))
    return "bg-blue-500/15 border-blue-400/20 text-blue-200";
  if (s.includes("deleg"))
    return "bg-emerald-500/15 border-emerald-400/20 text-emerald-200";
  if (s.includes("act"))
    return "bg-violet-500/15 border-violet-400/20 text-violet-200";
  return "bg-white/10 border-white/10 text-white/80";
}

function isTravelCard(card?: Card | null) {
  return (card?.title || "").toLowerCase().trim() === "travel";
}

function parseTravel(body?: string) {
  const text = (body || "").toString();
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const get = (prefix: string) => {
    const ln = lines.find((l) =>
      l.toLowerCase().startsWith(prefix.toLowerCase())
    );
    if (!ln) return "";
    return ln.slice(prefix.length).trim();
  };

  return {
    destination: get("Destination:"),
    dates: get("Dates:"),
    flight: get("Flight:"),
    depart: get("Depart:"),
    ret: get("Return:"),
    hotel: get("Hotel:"),
    address: get("Address:"),
    checkin: get("Check-in:"),
    confirmation: get("Confirmation:"),
    points: get("Travel points:"),
  };
}

function shouldHideInsightAck(msg: string, card?: Card | null) {
  const t = (msg || "").toLowerCase().trim();
  if (t.startsWith("opening ")) return true;
  if (t === "opening.") return true;
  if ((card?.title || "").toLowerCase().trim() === "insights") return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Main page component                                                 */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [sessionId] = useState("demo-session");
  const [userId] = useState("ramesh");

  const [turns, setTurns] = useState<Turn[]>([
    {
      id: "t0",
      userText: "",
      assistantText: `${timeGreeting()}, Ramesh. You have new insights available — tap Insights to review, or choose an option below.`,
    },
  ]);

  const [expandedTrace, setExpandedTrace] = useState<Record<string, boolean>>(
    {}
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const quickChips = useMemo(
    () => [
      "spend analysis",
      "recurring charges",
      "account summary",
      "transfer funds",
      "travel",
      "manage cd",
      "talk to an agent",
    ],
    []
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, loading]);

  /* ---- API helpers ---- */

  async function callOrchestrate(text: string) {
    const res = await fetch(`${API_BASE}/orchestrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        user_id: userId,
        channel: "web",
        text,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API (${res.status}): ${errText}`);
    }
    return (await res.json()) as OrchestrateResponse;
  }

  async function callAction(action_name: string, params: any) {
    const res = await fetch(`${API_BASE}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        user_id: userId,
        action_name,
        params: params ?? {},
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`/action (${res.status}): ${errText}`);
    }
    return (await res.json()) as ActionResponse;
  }

  /* ---- Extractors ---- */

  function extractAssistantText(data: OrchestrateResponse | ActionResponse) {
    const msgs = Array.isArray(data.messages) ? data.messages : [];
    const first = msgs.find(
      (m) => m?.role === "assistant" && (m.content ?? "").trim()
    );
    if (first) return first.content.trim();
    return "No response.";
  }

  function extractChartsIfAny(
    data: OrchestrateResponse | ActionResponse,
    card?: Card | null
  ) {
    const charts = (data as any)?.debug?.charts as ChartsPayload | undefined;
    if (card?.title === "Spend Analysis" && charts) return charts;
    return null;
  }

  function extractTraceIfAny(data: OrchestrateResponse | ActionResponse) {
    const dbg = (data as any)?.debug;

    const at = dbg?.agent_trace as
      | {
          planner?: { decision?: string; reason?: string };
          delegate?: { agent?: string; capability?: string };
          act?: { result?: string; confidence?: string };
        }
      | undefined;

    if (at && (at.planner || at.delegate || at.act)) {
      const steps: AgentTraceStep[] = [];

      if (at.planner) {
        steps.push({
          stage: "Planner",
          agent: "Planner",
          reasoning: at.planner.reason,
          decision: at.planner.decision,
        });
      }

      if (at.delegate) {
        steps.push({
          stage: "Delegate",
          agent: at.delegate.agent || "Router",
          tool: at.delegate.capability,
          decision: at.delegate.capability
            ? `Route to ${at.delegate.capability}`
            : undefined,
        });
      }

      if (at.act) {
        steps.push({
          stage: "Act",
          agent: "Executor",
          result: at.act.result,
          reasoning: at.act.confidence
            ? `Confidence: ${at.act.confidence}`
            : undefined,
        });
      }

      return steps.length ? steps : null;
    }

    const traceArray =
      (dbg?.trace as AgentTraceStep[] | undefined) ||
      ((data as any)?.trace as AgentTraceStep[] | undefined);

    if (Array.isArray(traceArray) && traceArray.length > 0) {
      return traceArray;
    }

    return null;
  }

  /* ---- Insights ---- */

  const refreshInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const data = await callOrchestrate("insights");
      const list = ((data as any)?.debug?.insights ?? []) as InsightItem[];
      if (Array.isArray(list)) {
        const cleaned = list.filter(
          (x) => x && typeof x.id === "string" && typeof x.title === "string"
        );
        setInsights(cleaned);
        return cleaned;
      }
      setInsights([]);
      return [];
    } catch {
      setInsights([]);
      return [];
    } finally {
      setInsightsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userId]);

  useEffect(() => {
    refreshInsights();
  }, [refreshInsights]);

  async function showInsightsInChat() {
    if (loading) return;
    setLoading(true);

    const turnId = `t-${Date.now()}-insights`;

    setTurns((prev) => [
      ...prev,
      {
        id: turnId,
        userText: "",
        assistantText: "Here are your latest insights.",
        card: { title: "Insights", subtitle: "Tap an insight to view details" },
        insightsList: [],
      },
    ]);

    try {
      const list = await refreshInsights();

      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? { ...t, assistantText: "Here are your latest insights.", insightsList: list }
            : t
        )
      );
    } finally {
      setLoading(false);
    }
  }

  /* ---- Send / action ---- */

  async function send(text?: string) {
    const tRaw = (text ?? input).trim();
    if (!tRaw || loading) return;

    setLoading(true);
    setInput("");

    const turnId = `t-${Date.now()}`;
    setTurns((prev) => [...prev, { id: turnId, userText: tRaw }]);

    try {
      const data = await callOrchestrate(tRaw);
      const assistantText = extractAssistantText(data);
      const card = data.card ?? null;
      const charts = extractChartsIfAny(data, card);
      const trace = extractTraceIfAny(data);

      setTurns((prev) =>
        prev.map((x) =>
          x.id === turnId ? { ...x, assistantText, card, charts, trace } : x
        )
      );
    } catch (e: any) {
      setTurns((prev) =>
        prev.map((x) =>
          x.id === turnId
            ? {
                ...x,
                assistantText: "I'm having trouble connecting right now.",
                error: true,
                errorRetryText: tRaw,
                card: null,
                charts: null,
                trace: null,
              }
            : x
        )
      );
    } finally {
      setLoading(false);
    }
  }

  async function retryTurn(turnId: string, text: string) {
    if (loading) return;
    setLoading(true);

    setTurns((prev) =>
      prev.map((x) =>
        x.id === turnId ? { ...x, assistantText: undefined, error: false, errorRetryText: undefined } : x
      )
    );

    try {
      const data = await callOrchestrate(text);
      const assistantText = extractAssistantText(data);
      const card = data.card ?? null;
      const charts = extractChartsIfAny(data, card);
      const trace = extractTraceIfAny(data);

      setTurns((prev) =>
        prev.map((x) =>
          x.id === turnId ? { ...x, assistantText, card, charts, trace } : x
        )
      );
    } catch {
      setTurns((prev) =>
        prev.map((x) =>
          x.id === turnId
            ? { ...x, assistantText: "Still unable to connect. Please try again.", error: true, errorRetryText: text }
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
      const trace = extractTraceIfAny(data);

      setTurns((prev) =>
        prev.map((x) =>
          x.id === turnId ? { ...x, assistantText, card, charts, trace } : x
        )
      );
    } catch (e: any) {
      setTurns((prev) =>
        prev.map((x) =>
          x.id === turnId
            ? { ...x, assistantText: "Something went wrong with that action.", error: true }
            : x
        )
      );
    } finally {
      setLoading(false);
    }
  }

  async function openInsight(insightId: string) {
    if (!insightId || loading) return;

    setLoading(true);

    const turnId = `t-${Date.now()}-insight`;
    setTurns((prev) => [...prev, { id: turnId, userText: "" }]);

    try {
      const data = await callAction("insight_view", { insight_id: insightId });

      const card = data.card ?? null;
      const charts = extractChartsIfAny(data, card);
      const trace = extractTraceIfAny(data);

      let assistantText = extractAssistantText(data);
      if (shouldHideInsightAck(assistantText, card)) {
        assistantText = "";
      }

      setTurns((prev) =>
        prev.map((x) =>
          x.id === turnId ? { ...x, assistantText, card, charts, trace } : x
        )
      );
    } catch (e: any) {
      setTurns((prev) =>
        prev.map((x) =>
          x.id === turnId
            ? { ...x, assistantText: "Unable to load that insight right now." }
            : x
        )
      );
    } finally {
      setLoading(false);
    }
  }

  const insightsCount = insightsLoading ? "..." : String(insights.length);

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="min-h-screen text-white">
      {/* Background — Chase navy with blue/indigo accents */}
      <div className="fixed inset-0 -z-10 bg-[#060a14]" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_20%_0%,rgba(0,96,240,0.30),transparent_60%),radial-gradient(800px_500px_at_90%_20%,rgba(0,60,180,0.20),transparent_60%),radial-gradient(1000px_700px_at_50%_100%,rgba(0,96,240,0.10),transparent_55%)]" />
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black/0 via-black/10 to-black/40" />

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-6xl font-semibold tracking-tight">
              <span className="drop-shadow-[0_16px_60px_rgba(0,0,0,0.6)]">
                Compass
              </span>
            </h1>
            <p className="mt-2 text-white/60 text-sm">
              Intelligent banking assistant
            </p>
          </div>

          <button
            className="rounded-full border border-white/12 bg-white/5 px-5 py-2 text-sm text-white/85 shadow-[0_20px_80px_rgba(0,0,0,0.35)] hover:bg-white/10"
            onClick={() => {
              setTurns([
                {
                  id: "t0",
                  userText: "",
                  assistantText: `${timeGreeting()}, Ramesh. You have new insights available — tap Insights to review, or choose an option below.`,
                },
              ]);
              setExpandedTrace({});
              refreshInsights();
            }}
          >
            Reset
          </button>
        </header>

        {/* Phone frame */}
        <div className="mx-auto w-full max-w-4xl">
          <div className="relative rounded-[36px] border border-white/10 bg-white/5 shadow-[0_30px_140px_rgba(0,0,0,0.65)] backdrop-blur-xl">
            {/* notch */}
            <div className="absolute left-1/2 top-4 h-1.5 w-20 -translate-x-1/2 rounded-full bg-white/15" />

            <div className="p-6 md:p-8">
              {/* top bar */}
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-[#0060F0]" />
                  <span className="text-sm font-medium text-white/80">Compass</span>
                </div>

                <button
                  className="relative rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm text-white/85 hover:bg-white/10 disabled:opacity-50"
                  onClick={showInsightsInChat}
                  disabled={loading}
                >
                  Insights
                  <span className="ml-2 inline-flex items-center justify-center rounded-full bg-[#0060F0]/20 px-2 py-0.5 text-xs text-[#60a5fa]">
                    {insightsCount}
                  </span>
                </button>
              </div>

              {/* Chat area */}
              <div className="space-y-4">
                {turns.map((t) => {
                  const showUser = t.userText.trim().length > 0;
                  const traceOpen = !!expandedTrace[t.id];
                  const travel = isTravelCard(t.card)
                    ? parseTravel(t.card?.body)
                    : null;

                  return (
                    <div key={t.id} className="space-y-3">
                      {showUser ? (
                        <div
                          className={clsx(
                            "max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-snug",
                            bubbleClass("user")
                          )}
                        >
                          {t.userText}
                        </div>
                      ) : null}

                      {/* Typing indicator when waiting */}
                      {!t.assistantText && t.assistantText !== "" && !t.error ? (
                        <TypingIndicator />
                      ) : null}

                      {t.assistantText ? (
                        <div
                          className={clsx(
                            "max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-snug",
                            bubbleClass("assistant"),
                            t.error && "border-red-500/30"
                          )}
                        >
                          {t.assistantText}
                          {t.error && t.errorRetryText ? (
                            <button
                              className="ml-3 inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/15"
                              onClick={() => retryTurn(t.id, t.errorRetryText!)}
                              disabled={loading}
                            >
                              Retry
                            </button>
                          ) : null}
                        </div>
                      ) : null}

                      {/* Decision Pipeline (formerly Agentic Trace) */}
                      {t.trace && t.trace.length > 0 ? (
                        <div className="max-w-[92%]">
                          <button
                            onClick={() =>
                              setExpandedTrace((m) => ({
                                ...m,
                                [t.id]: !traceOpen,
                              }))
                            }
                            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
                          >
                            {traceOpen ? "Hide" : "Show"} Decision Pipeline
                          </button>

                          {traceOpen ? (
                            <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-4">
                              <div className="mb-3 flex items-center gap-2 text-xs text-white/60">
                                <span>Orchestration Pipeline</span>
                                <span className="text-white/30">Planner → Delegate → Act</span>
                              </div>
                              <div className="space-y-3">
                                {t.trace.map((step, idx) => (
                                  <div
                                    key={idx}
                                    className="rounded-xl border border-white/10 bg-black/35 p-3"
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span
                                        className={clsx(
                                          "inline-flex items-center rounded-full border px-2 py-1 text-[11px]",
                                          stagePill(step.stage)
                                        )}
                                      >
                                        {step.stage}
                                      </span>

                                      {step.agent ? (
                                        <span className="text-[11px] text-white/70">
                                          Agent:{" "}
                                          <span className="text-white/90">
                                            {step.agent}
                                          </span>
                                        </span>
                                      ) : null}

                                      {step.tool ? (
                                        <span className="text-[11px] text-white/70">
                                          Capability:{" "}
                                          <span className="text-white/90">
                                            {step.tool}
                                          </span>
                                        </span>
                                      ) : null}
                                    </div>

                                    {step.reasoning ? (
                                      <div className="mt-2 text-sm text-white/80">
                                        <span className="text-white/55">
                                          Why:
                                        </span>{" "}
                                        {step.reasoning}
                                      </div>
                                    ) : null}

                                    {step.decision ? (
                                      <div className="mt-1 text-sm text-white/80">
                                        <span className="text-white/55">
                                          Decision:
                                        </span>{" "}
                                        {step.decision}
                                      </div>
                                    ) : null}

                                    {step.result ? (
                                      <div className="mt-1 text-sm text-white/80">
                                        <span className="text-white/55">
                                          Result:
                                        </span>{" "}
                                        {step.result}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {/* Card */}
                      {t.card ? (
                        <div className="mt-2 rounded-2xl border border-white/10 bg-black/35 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-lg font-semibold text-white/95">
                                {t.card.title}
                              </div>
                              {t.card.subtitle ? (
                                <div className="mt-1 text-sm text-white/65">
                                  {t.card.subtitle}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          {/* Insights list */}
                          {t.insightsList && t.insightsList.length > 0 ? (
                            <div className="mt-4 space-y-2">
                              {t.insightsList.map((it) => (
                                <div
                                  key={it.id}
                                  className="rounded-2xl border border-white/10 bg-white/5 p-3"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-semibold text-white/90">
                                        {it.title}
                                      </div>
                                      {it.subtitle ? (
                                        <div className="mt-1 text-xs text-white/60">
                                          {it.subtitle}
                                        </div>
                                      ) : null}
                                    </div>
                                    <button
                                      className="shrink-0 rounded-full border border-[#0060F0]/30 bg-[#0060F0]/15 px-4 py-2 text-xs text-[#60a5fa] hover:bg-[#0060F0]/25 disabled:opacity-50"
                                      disabled={loading}
                                      onClick={() => openInsight(it.id)}
                                    >
                                      View
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {/* Travel card */}
                          {travel ? (
                            <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0060F0]/15 via-sky-500/10 to-[#0060F0]/5">
                              <div className="p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs text-white/85">
                                      Flight
                                    </span>
                                    <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs text-white/85">
                                      Hotel
                                    </span>
                                    <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs text-white/85">
                                      Trip
                                    </span>
                                  </div>
                                  {travel.points ? (
                                    <span className="inline-flex items-center rounded-full bg-[#0060F0]/20 px-3 py-1 text-xs text-[#60a5fa]">
                                      {travel.points} pts
                                    </span>
                                  ) : null}
                                </div>

                                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                                    <div className="text-xs text-white/60">
                                      Destination
                                    </div>
                                    <div className="mt-1 text-base font-semibold text-white/90">
                                      {travel.destination || "—"}
                                    </div>

                                    <div className="mt-2 text-xs text-white/60">
                                      Dates
                                    </div>
                                    <div className="mt-1 text-sm text-white/85">
                                      {travel.dates || "—"}
                                    </div>
                                  </div>

                                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                                    <div className="text-xs text-white/60">
                                      Flight
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-white/90">
                                      {travel.flight || "—"}
                                    </div>

                                    <div className="mt-2 text-xs text-white/60">
                                      Depart
                                    </div>
                                    <div className="mt-1 text-sm text-white/85">
                                      {travel.depart || "—"}
                                    </div>

                                    <div className="mt-2 text-xs text-white/60">
                                      Return
                                    </div>
                                    <div className="mt-1 text-sm text-white/85">
                                      {travel.ret || "—"}
                                    </div>
                                  </div>

                                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4 md:col-span-2">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <div className="text-xs text-white/60">
                                          Hotel
                                        </div>
                                        <div className="mt-1 text-sm font-semibold text-white/90">
                                          {travel.hotel || "—"}
                                        </div>
                                        {travel.address ? (
                                          <div className="mt-1 text-xs text-white/70">
                                            {travel.address}
                                          </div>
                                        ) : null}
                                      </div>

                                      <div className="text-right">
                                        {travel.checkin ? (
                                          <div className="text-xs text-white/70">
                                            {travel.checkin}
                                          </div>
                                        ) : null}
                                        {travel.confirmation ? (
                                          <div className="mt-1 inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-400/20 px-3 py-1 text-xs text-emerald-300">
                                            Confirmed: {travel.confirmation}
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {/* Card body (non-travel) */}
                          {t.card.body && !isTravelCard(t.card) ? (
                            <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-white/6 p-4 text-sm text-white/85">
                              {t.card.body}
                            </pre>
                          ) : null}

                          {/* Spend charts */}
                          {t.card.title === "Spend Analysis" && t.charts ? (
                            <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
                              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                                <div className="mb-2 text-sm text-white/80">
                                  Top categories
                                </div>
                                <div className="h-56 w-full">
                                  <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                  >
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
                                          <Cell
                                            key={i}
                                            fill={
                                              PIE_COLORS[i % PIE_COLORS.length]
                                            }
                                          />
                                        ))}
                                      </Pie>
                                      <Tooltip content={<DarkTooltip />} />
                                    </PieChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                                <div className="mb-2 text-sm text-white/80">
                                  Spend trend
                                </div>
                                <div className="h-56 w-full">
                                  <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                  >
                                    <LineChart data={t.charts.trend ?? []}>
                                      <CartesianGrid
                                        stroke="rgba(255,255,255,0.10)"
                                        strokeDasharray="3 3"
                                      />
                                      <XAxis
                                        dataKey="day"
                                        stroke="rgba(255,255,255,0.45)"
                                        tick={{
                                          fill: "rgba(255,255,255,0.70)",
                                        }}
                                      />
                                      <YAxis
                                        stroke="rgba(255,255,255,0.45)"
                                        tick={{
                                          fill: "rgba(255,255,255,0.70)",
                                        }}
                                      />
                                      <Tooltip content={<DarkTooltip />} />
                                      <Line
                                        type="monotone"
                                        dataKey="value"
                                        stroke="#0060F0"
                                        strokeWidth={3}
                                        dot={{
                                          r: 3,
                                          stroke: "#0060F0",
                                          fill: "#0b1220",
                                        }}
                                        activeDot={{ r: 5 }}
                                      />
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {/* Card actions */}
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

                {/* Global typing indicator when loading with no pending turn */}
                {loading && turns.length > 0 && turns[turns.length - 1].assistantText !== undefined ? (
                  <TypingIndicator />
                ) : null}

                <div ref={bottomRef} />
              </div>

              {/* Quick chips */}
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
                  placeholder="Ask me anything..."
                  className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-4 text-white outline-none placeholder:text-white/40 focus:border-[#0060F0]/50"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-2xl bg-[#0060F0] px-6 py-4 font-medium text-white shadow-[0_14px_50px_rgba(0,96,240,0.25)] hover:bg-[#0050D0] disabled:opacity-50"
                >
                  {loading ? "..." : "Send"}
                </button>
              </form>

              <div className="mt-2 text-xs text-white/35">
                Press Enter to send
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
