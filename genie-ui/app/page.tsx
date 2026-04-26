"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Mic, Plus, Search, Send } from "lucide-react";
import type { ChatMessage, Conversation, GenieMessageStatus, SSEEvent } from "@/lib/types";
import { ChatMessageComponent } from "@/components/ChatMessage";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
import { HeatMapsView } from "@/components/HeatMapsView";
import { AnalyticsDashboardView } from "@/components/AnalyticsDashboardView";
import { MedicalDesertsView } from "@/components/MedicalDesertsView";

// ── Nav tab definitions ───────────────────────────────────────────────────────
const NAV_TABS = [
  { label: "Search",          emoji: "🔍" },
  { label: "Results",         emoji: "📋" },
  { label: "Heat Maps",       emoji: "🗺️" },
  { label: "Medical Deserts", emoji: "⚠️" },
  { label: "Analytics",       emoji: "📊" },
];

const DEMO_QUERIES = [
  "Find nearest facility for emergency appendectomy in rural Bihar",
  "Hospitals with dialysis in Mumbai with Trust Score > 75",
  "Neonatal ICU facilities within 50km of Patna",
  "Emergency surgery centers in Uttar Pradesh",
  "Trauma care units with 24/7 availability in Delhi NCR",
  "Medical deserts — districts with no trusted ICU access",
];

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<GenieMessageStatus | null>(null);
  const [pendingUserContent, setPendingUserContent] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const liveConvIdRef = useRef<string | null>(null);

  const [manualTab,  setManualTab]  = useState<string | null>(null);
  const [userMode,   setUserMode]   = useState<"patient" | "institution" | null>(null);

  const currentConv = conversations.find((c) => c.id === currentConvId) ?? null;
  const messages = currentConv?.messages ?? [];
  const inChat = messages.length > 0 || !!pendingUserContent;
  const derivedTab = inChat ? "Results" : "Search";
  const activeTab = manualTab ?? derivedTab;

  // Only show Search + Results for patients; all tabs for institution
  const visibleTabs = userMode === "patient"
    ? NAV_TABS.filter((t) => t.label === "Search" || t.label === "Results")
    : NAV_TABS;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading]);

  const resizeTextarea = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  };

  const newChat = () => {
    if (isLoading) return;
    setCurrentConvId(null);
    setInput("");
    setPendingUserContent(null);
    setManualTab(null);
    setUserMode(null);
    liveConvIdRef.current = null;
  };

  const send = useCallback(async () => {
    const content = input.trim();
    if (!content || isLoading) return;

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setPendingUserContent(content);
    setManualTab(null);
    setIsLoading(true);
    setCurrentStatus("SUBMITTED");
    liveConvIdRef.current = null;

    const existingConvId = currentConvId;
    if (existingConvId) {
      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content, timestamp: new Date() };
      setConversations((prev) =>
        prev.map((c) => c.id === existingConvId ? { ...c, messages: [...c.messages, userMsg] } : c)
      );
      setPendingUserContent(null);
    }

    try {
      const response = await fetch("/api/genie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, conversationId: currentConvId }),
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try { handleSSEEvent(JSON.parse(line.slice(6)), content, existingConvId); }
          catch { /* malformed line */ }
        }
      }
    } catch (err) {
      const msg: ChatMessage = {
        id: crypto.randomUUID(), role: "assistant", content: "", timestamp: new Date(),
        error: err instanceof Error ? err.message : "Unknown error",
      };
      appendMessage(liveConvIdRef.current ?? existingConvId, msg);
    } finally {
      setIsLoading(false);
      setCurrentStatus(null);
      setPendingUserContent(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, isLoading, currentConvId]);

  function handleSSEEvent(event: SSEEvent, userContent: string, existingConvId: string | null) {
    if (event.type === "status") {
      setCurrentStatus(event.status);
      if (!liveConvIdRef.current) {
        liveConvIdRef.current = event.conversationId;
        if (!existingConvId) {
          const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: userContent, timestamp: new Date() };
          const newConv: Conversation = {
            id: event.conversationId,
            title: userContent.length > 55 ? userContent.slice(0, 52) + "…" : userContent,
            createdAt: new Date(),
            messages: [userMsg],
          };
          setConversations((prev) => [newConv, ...prev]);
          setCurrentConvId(event.conversationId);
          setPendingUserContent(null);
        }
      }
    } else if (event.type === "done") {
      const msg: ChatMessage = {
        id: crypto.randomUUID(), role: "assistant", content: "", timestamp: new Date(),
        attachments: event.attachments, queryResult: event.queryResult,
      };
      appendMessage(event.conversationId, msg);
    } else if (event.type === "error") {
      const msg: ChatMessage = {
        id: crypto.randomUUID(), role: "assistant", content: "", timestamp: new Date(),
        error: event.message,
      };
      appendMessage(liveConvIdRef.current ?? existingConvId, msg);
    }
  }

  function appendMessage(convId: string | null, msg: ChatMessage) {
    if (!convId) return;
    setConversations((prev) =>
      prev.map((c) => c.id === convId ? { ...c, messages: [...c.messages, msg] } : c)
    );
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleSuggest = (q: string) => {
    setInput(q);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── Top nav bar ─────────────────────────────────────────────────────── */}
      <header style={{ background: "var(--bg-nav)", flexShrink: 0 }}>
        <div className="flex items-center h-16 px-6 gap-6">

          {/* Logo */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center"
              style={{ background: "var(--accent)" }}>
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <div>
              <div className="text-white font-bold text-sm leading-tight">CareMap India</div>
              <div className="text-xs leading-tight tracking-widest uppercase"
                style={{ color: "var(--text-nav)", fontSize: "9px" }}>
                Healthcare Intelligence Platform
              </div>
            </div>
          </div>

          {/* Nav tabs */}
          <nav className="flex-1 flex items-center justify-center gap-1">
            {visibleTabs.map((tab) => {
              const isActive = tab.label === activeTab;
              const handleTabClick = () => {
                if (tab.label === "Search") { newChat(); }
                else if (tab.label === "Results") { setManualTab(null); }
                else { setManualTab(tab.label); }
              };
              return (
                <button
                  key={tab.label}
                  onClick={handleTabClick}
                  className="flex items-center gap-1.5 px-4 h-16 text-sm font-medium transition-colors relative"
                  style={{ color: isActive ? "var(--text-nav-active)" : "var(--text-nav)" }}
                >
                  <span>{tab.emoji}</span>
                  <span>{tab.label}</span>
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                      style={{ background: "var(--accent)" }}
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-nav)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              10,247 facilities indexed
            </span>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={{ borderColor: "#3a5168", color: "var(--text-nav)" }}
            >
              📋 Institution
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={{ borderColor: "#3a5168", color: "var(--text-nav)" }}
            >
              ← Back to Login
            </button>
          </div>
        </div>
      </header>

      {/* ── Content area ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden" style={{ background: "var(--bg)" }}>

        {/* Sidebar — only visible when there are conversations */}
        {conversations.length > 0 && (
          <aside
            className="w-56 flex-shrink-0 flex flex-col border-r"
            style={{ background: "var(--bg-sidebar)", borderColor: "var(--border)" }}
          >
            <div className="px-3 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <button
                onClick={newChat}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-card)" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              >
                <Plus className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
                New conversation
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2 px-2">
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider mb-1"
                style={{ color: "var(--text-muted)" }}>
                Recent
              </p>
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setCurrentConvId(conv.id)}
                  className="w-full text-left flex items-center gap-2 px-2 py-2 rounded-lg mb-0.5 text-xs transition-colors"
                  style={{
                    color: conv.id === currentConvId ? "var(--accent)" : "var(--text-secondary)",
                    background: conv.id === currentConvId ? "var(--accent-light)" : "transparent",
                    fontWeight: conv.id === currentConvId ? 500 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (conv.id !== currentConvId) e.currentTarget.style.background = "var(--bg)";
                  }}
                  onMouseLeave={(e) => {
                    if (conv.id !== currentConvId) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{conv.title}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* Main chat / landing area */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Standalone tabs */}
          {activeTab === "Heat Maps" && <HeatMapsView />}
          {activeTab === "Analytics" && <AnalyticsDashboardView />}
          {activeTab === "Medical Deserts" && <MedicalDesertsView />}

          {activeTab !== "Heat Maps" && activeTab !== "Analytics" && activeTab !== "Medical Deserts" && (userMode === null ? (
            /* ── Hero landing page ── */
            <div
              className="flex-1 relative flex flex-col justify-center"
              style={{
                backgroundImage: "url('/hero-bg.jpg')",
                backgroundSize: "cover",
                backgroundPosition: "center right",
                minHeight: 0,
              }}
            >
              {/* Dark gradient overlay */}
              <div
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(105deg, rgba(10,20,35,0.96) 0%, rgba(10,20,35,0.86) 45%, rgba(10,20,35,0.4) 72%, rgba(10,20,35,0.1) 100%)",
                }}
              />

              {/* Content */}
              <div className="relative z-10 px-14 py-16 max-w-xl">

                {/* Live badge */}
                <div
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-10"
                  style={{ background: "rgba(44,181,163,0.18)", color: "var(--accent)", border: "1px solid rgba(44,181,163,0.4)" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse" />
                  Live · AI-powered · 10,000 facilities indexed
                </div>

                {/* Headline */}
                <h1 className="text-5xl font-bold leading-tight mb-10" style={{ letterSpacing: "-0.02em" }}>
                  <span className="text-white block">Find the right care.</span>
                  <span className="block" style={{ color: "var(--accent)" }}>Verify the capability.</span>
                  <span className="text-white block">Close the gap.</span>
                </h1>

                {/* Translucent buttons */}
                <div className="space-y-3">
                  {/* Patient */}
                  <button
                    onClick={() => { setUserMode("patient"); setManualTab(null); }}
                    className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all group"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      backdropFilter: "blur(12px)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(255,255,255,0.12)" }}
                    >
                      <span className="text-lg">👤</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">Sign in as Patient</p>
                      <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                        Find verified nearby care for yourself or a family member
                      </p>
                    </div>
                    <span className="text-white/50 group-hover:text-white transition-colors text-lg">→</span>
                  </button>

                  {/* Institution */}
                  <button
                    onClick={() => { setUserMode("institution"); setManualTab(null); }}
                    className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all group"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      backdropFilter: "blur(12px)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(255,255,255,0.12)" }}
                    >
                      <span className="text-lg">🏥</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">Sign in as Institution</p>
                      <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                        NGO · Hospital · Government body · Policy maker
                      </p>
                    </div>
                    <span className="text-white/50 group-hover:text-white transition-colors text-lg">→</span>
                  </button>
                </div>
              </div>
            </div>
          ) : !inChat ? (
            /* ── Search landing (post sign-in) ── */
            <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-6 py-12">
              <div className="w-full max-w-2xl flex flex-col items-center text-center">
                <div
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-6 border"
                  style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                >
                  Powered by AI · Verified Data · Real Capabilities
                </div>
                <h1 className="text-4xl font-bold mb-3 leading-tight" style={{ color: "var(--text-primary)" }}>
                  Discover Healthcare You Can Trust
                </h1>
                <p className="text-base mb-8" style={{ color: "var(--text-secondary)" }}>
                  Search for medical facilities based on real capabilities, not just claims.
                </p>
                <div
                  className="w-full flex items-end gap-3 px-5 py-4 rounded-2xl border mb-3"
                  style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "var(--shadow-md)" }}
                  onFocusCapture={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                  onBlurCapture={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                >
                  <Search className="w-5 h-5 flex-shrink-0 mb-0.5" style={{ color: "var(--text-muted)" }} />
                  <textarea
                    ref={textareaRef}
                    value={input}
                    rows={1}
                    disabled={isLoading}
                    placeholder="e.g., Find nearest facility for emergency appendectomy in rural Bihar"
                    onChange={(e) => { setInput(e.target.value); resizeTextarea(); }}
                    onKeyDown={handleKeyDown}
                    className="flex-1 bg-transparent text-sm outline-none resize-none"
                    style={{ color: "var(--text-primary)", minHeight: "24px", maxHeight: "120px" }}
                  />
                  <button
                    onClick={send}
                    disabled={!input.trim() || isLoading}
                    className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ background: "var(--accent)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--accent-hover)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--accent)")}
                  >
                    <Send className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
                <div className="w-full text-left">
                  <p className="flex items-center gap-2 text-sm font-medium mb-3" style={{ color: "var(--accent)" }}>
                    <span>↗</span> Try these example searches:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {DEMO_QUERIES.map((q) => (
                      <button
                        key={q}
                        onClick={() => { setInput(q); textareaRef.current?.focus(); }}
                        className="text-left text-sm px-4 py-3 rounded-xl border transition-all"
                        style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)", boxShadow: "var(--shadow-sm)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "var(--shadow-md)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── Chat messages ── */
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
                {messages.map((msg) => (
                  <ChatMessageComponent key={msg.id} message={msg} onSuggest={handleSuggest} />
                ))}
                {pendingUserContent && (
                  <ChatMessageComponent
                    message={{ id: "__pending__", role: "user", content: pendingUserContent, timestamp: new Date() }}
                  />
                )}
                {isLoading && <ThinkingIndicator status={currentStatus} />}
                <div ref={messagesEndRef} />
              </div>
            </div>
          ))}

          {/* ── Input bar (chat mode only, not on map tabs) ─────────────────── */}
          {inChat && activeTab !== "Heat Maps" && activeTab !== "Analytics" && activeTab !== "Medical Deserts" && (
            <div
              className="flex-shrink-0 px-6 py-4 border-t"
              style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            >
              <div className="max-w-3xl mx-auto">
                <div
                  className="flex items-end gap-3 rounded-2xl px-5 py-3 border transition-colors"
                  style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
                  onFocusCapture={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                  onBlurCapture={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                >
                  <Search className="w-4 h-4 flex-shrink-0 mb-1" style={{ color: "var(--text-muted)" }} />
                  <textarea
                    ref={textareaRef}
                    value={input}
                    rows={1}
                    disabled={isLoading}
                    placeholder="Ask about facilities, medical deserts, trust scores…"
                    onChange={(e) => { setInput(e.target.value); resizeTextarea(); }}
                    onKeyDown={handleKeyDown}
                    className="flex-1 bg-transparent text-sm outline-none resize-none"
                    style={{ color: "var(--text-primary)", minHeight: "24px", maxHeight: "160px" }}
                  />
                  <button
                    onClick={send}
                    disabled={!input.trim() || isLoading}
                    className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ background: "var(--accent)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--accent-hover)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--accent)")}
                  >
                    <Send className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
                <p className="text-center text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                  Shift+Enter for new line · Enter to send
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
