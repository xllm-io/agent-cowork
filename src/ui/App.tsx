import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIPC } from "./hooks/useIPC";
import { useMessageWindow } from "./hooks/useMessageWindow";
import { useAppStore } from "./store/useAppStore";
import { groupIntoTurns } from "./hooks/useTurns";
import type { ServerEvent } from "./types";
import { Sidebar } from "./components/Sidebar";
import { SettingsModal } from "./components/SettingsModal";
import { HomeScreen } from "./components/HomeScreen";
import { DirectoryPickerPopover } from "./components/DirectoryPickerPopover";
import { ModelSelect } from "./components/ModelSelect";
import { PromptInput } from "./components/PromptInput";
import { TurnBlock } from "./components/TurnBlock";

const SCROLL_THRESHOLD = 50;

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

function App() {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const prevMessagesLengthRef = useRef(0);
  const scrollHeightBeforeLoadRef = useRef(0);
  const shouldRestoreScrollRef = useRef(false);

  const sessions = useAppStore((s) => s.sessions);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const showSettingsModal = useAppStore((s) => s.showSettingsModal);
  const setShowSettingsModal = useAppStore((s) => s.setShowSettingsModal);
  const globalError = useAppStore((s) => s.globalError);
  const setGlobalError = useAppStore((s) => s.setGlobalError);
  const historyRequested = useAppStore((s) => s.historyRequested);
  const markHistoryRequested = useAppStore((s) => s.markHistoryRequested);
  const handleServerEvent = useAppStore((s) => s.handleServerEvent);
  const prompt = useAppStore((s) => s.prompt);
  const cwd = useAppStore((s) => s.cwd);
  const pendingStart = useAppStore((s) => s.pendingStart);

  // Inline new-session form state (LobsterAI CoworkView pattern)
  const [formCwd, setFormCwd] = useState(cwd);
  const [formPrompt, setFormPrompt] = useState(prompt);
  const [formModel, setFormModel] = useState("");
  const [showDirPicker, setShowDirPicker] = useState(false);
  const dirPickerRef = useRef<HTMLDivElement>(null);
  const homePromptRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow the home-screen prompt textarea up to 12 rows, then scroll.
  useEffect(() => {
    const el = homePromptRef.current;
    if (!el) return;
    const style = window.getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || 22;
    const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const maxHeight = lineHeight * 12 + paddingY;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [formPrompt]);

  // Auto-close directory picker on outside click / escape
  useEffect(() => {
    if (!showDirPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dirPickerRef.current && !dirPickerRef.current.contains(e.target as Node)) {
        setShowDirPicker(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowDirPicker(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showDirPicker]);

  // Load API config model + recent cwds on mount
  useEffect(() => {
    window.electron.getApiConfig().then((config) => {
      if (config?.model) setFormModel(config.model);
    }).catch(() => {});
  }, []);

  // Sync local state with store when it changes
  useEffect(() => { setFormCwd(cwd); }, [cwd]);
  useEffect(() => { setFormPrompt(prompt); }, [prompt]);

  // Combined event handler — only handleServerEvent needed now;
  // partial blocks are assembled in the store and rendered via turns.
  const onEvent = useCallback((event: ServerEvent) => {
    handleServerEvent(event);
  }, [handleServerEvent]);

  const { connected, sendEvent } = useIPC(onEvent);

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const messages = activeSession?.messages ?? [];
  const permissionRequests = activeSession?.permissionRequests ?? [];
  const isRunning = activeSession?.status === "running";

  const {
    visibleMessages,
    hasMoreHistory,
    isLoadingHistory,
    loadMoreMessages,
    resetToLatest,
    totalMessages,
  } = useMessageWindow(messages, permissionRequests, activeSessionId);

  // Group visible messages into conversation turns (turn-based layout)
  // Partial blocks are now assembled per-turn in groupIntoTurns.
  const visibleTurns = useMemo(() => {
    return groupIntoTurns(visibleMessages);
  }, [visibleMessages]);

  useEffect(() => {
    if (connected) sendEvent({ type: "session.list" });
  }, [connected, sendEvent]);

  useEffect(() => {
    if (!activeSessionId || !connected) return;
    const session = sessions[activeSessionId];
    if (session && !session.hydrated && !historyRequested.includes(activeSessionId)) {
      markHistoryRequested(activeSessionId);
      sendEvent({ type: "session.history", payload: { sessionId: activeSessionId } });
    }
  }, [activeSessionId, connected, sessions, historyRequested, markHistoryRequested, sendEvent]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    setScrollY(scrollTop);
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - SCROLL_THRESHOLD;

    if (isAtBottom !== shouldAutoScroll) {
      setShouldAutoScroll(isAtBottom);
      if (isAtBottom) {
        setHasNewMessages(false);
      }
    }
  }, [shouldAutoScroll]);

  // Set up IntersectionObserver for top sentinel
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMoreHistory && !isLoadingHistory) {
          scrollHeightBeforeLoadRef.current = container.scrollHeight;
          shouldRestoreScrollRef.current = true;
          loadMoreMessages();
        }
      },
      {
        root: container,
        rootMargin: "100px 0px 0px 0px",
        threshold: 0,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMoreHistory, isLoadingHistory, loadMoreMessages]);

  // Restore scroll position after loading history
  useEffect(() => {
    if (shouldRestoreScrollRef.current && !isLoadingHistory) {
      const container = scrollContainerRef.current;
      if (container) {
        const newScrollHeight = container.scrollHeight;
        const scrollDiff = newScrollHeight - scrollHeightBeforeLoadRef.current;
        container.scrollTop += scrollDiff;
      }
      shouldRestoreScrollRef.current = false;
    }
  }, [visibleMessages, isLoadingHistory]);

  // Reset scroll state on session change
  useEffect(() => {
    setShouldAutoScroll(true);
    setHasNewMessages(false);
    prevMessagesLengthRef.current = 0;
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }, 100);
  }, [activeSessionId]);

  useEffect(() => {
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (messages.length > prevMessagesLengthRef.current && prevMessagesLengthRef.current > 0) {
      setHasNewMessages(true);
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, shouldAutoScroll]);

  const scrollToBottom = useCallback(() => {
    setShouldAutoScroll(true);
    setHasNewMessages(false);
    resetToLatest();
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [resetToLatest]);

  const handleNewSession = useCallback(() => {
    useAppStore.getState().setActiveSessionId(null);
  }, []);

  const handleDeleteSession = useCallback((sessionId: string) => {
    sendEvent({ type: "session.delete", payload: { sessionId } });
  }, [sendEvent]);

  const handleSendMessage = useCallback(() => {
    setShouldAutoScroll(true);
    setHasNewMessages(false);
    resetToLatest();
  }, [resetToLatest]);

  // Show input when there's an active session with messages
  const canUserInteract = activeSessionId && visibleMessages.length > 0;

  // Start a new session from the inline form (LobsterAI CoworkView pattern)
  // Task type is auto-derived: a chosen directory → project task; none → conversation task.
  const handleCreateSession = useCallback(async () => {
    if (!formPrompt.trim()) {
      setGlobalError("Prompt is required to start a session.");
      return;
    }

    let title = "";
    try {
      setGlobalError(null);
      useAppStore.getState().setPendingStart(true);
      title = await window.electron.generateSessionTitle(formPrompt.trim());
    } catch (error) {
      console.error(error);
      useAppStore.getState().setPendingStart(false);
      setGlobalError("Failed to get session title.");
      return;
    }

    sendEvent({
      type: "session.start",
      payload: {
        title,
        prompt: formPrompt.trim(),
        // No directory → conversation task (backend leaves cwd empty).
        cwd: formCwd.trim() || undefined,
        allowedTools: "Read,Edit,Bash",
        // Empty model → backend uses the configured default.
        model: formModel.trim() || undefined,
      }
    });

    // Clear form state
    setFormPrompt("");
  }, [formCwd, formModel, formPrompt, sendEvent, setGlobalError]);

  // Quick templates for the home screen
  const QUICK_TEMPLATES = [
    { label: "Explain code", prompt: "Please explain the code in this project and its architecture." },
    { label: "Write tests", prompt: "Write comprehensive tests for the main functionality in this project." },
    { label: "Debug issue", prompt: "Help me debug an issue. I'll describe the problem." },
    { label: "Refactor", prompt: "Help me refactor this codebase for better readability and performance." },
    { label: "Chat / Q&A", prompt: "I'd like to have a general discussion or ask some questions." },
  ];

  return (
    <div className="flex h-screen bg-surface">
      <Sidebar
        connected={connected}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
      />

      <main className="flex flex-1 flex-col ml-[280px] bg-surface-cream">
        <div
          className="flex items-center justify-center h-12 border-b border-ink-900/10 bg-surface-cream select-none"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <span className="text-sm font-medium text-ink-700">{activeSession?.title || "Agent Cowork"}</span>
        </div>

        {/* No active session — show home screen (LobsterAI CoworkView pattern) */}
        {!activeSessionId ? (
          <div className="relative flex-1 overflow-y-auto min-h-0">
            <div className="relative flex min-h-full w-full min-w-[320px] flex-col items-center px-4 py-8">
              {/* Flexible spacers (2:3 ratio, optical centering) */}
              <div aria-hidden className="w-full min-h-[56px] flex-[2_0_0px]" />

              {/* Welcome Section — staggered entrance animation */}
              <div className="w-full max-w-3xl text-center">
                <HomeScreen />
              </div>

              {/* Large Prompt Input Area — LobsterAI CoworkPromptInput size="large" pattern */}
              <div className="relative z-30 mt-9 w-full max-w-3xl animate-fade-in-up" style={{ animationDelay: "180ms", animationFillMode: "both" }}>
                <div className="rounded-2xl border border-border bg-surface shadow-card focus-within:border-accent/30 focus-within:shadow-elevated transition-all duration-200">
                  <textarea
                    ref={homePromptRef}
                    rows={2}
                    className="w-full resize-none bg-transparent px-4 pb-2 pt-3 text-sm leading-relaxed text-ink-800 placeholder:text-muted focus:outline-none min-h-[52px]"
                    placeholder="Describe what you want agent to handle..."
                    value={formPrompt}
                    onChange={(e) => setFormPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleCreateSession();
                      }
                    }}
                  />
                  <div className="relative flex items-center justify-between gap-3 px-3 pb-2.5 pt-1">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {/* Model selector */}
                      <ModelSelect value={formModel} onChange={setFormModel} />

                      {/* Attachment (placeholder) */}
                      <button
                        type="button"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink-900/10 text-muted hover:border-ink-900/20 hover:bg-surface-tertiary hover:text-ink-700 transition-colors"
                        title="Attach files (coming soon)"
                        aria-label="Attach files"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                    </div>

                    {/* Send button */}
                    <button
                      onClick={handleCreateSession}
                      disabled={!formPrompt.trim()}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
                        formPrompt.trim()
                          ? "bg-accent text-white hover:bg-accent-hover hover:shadow-lg hover:shadow-accent/20 hover:scale-105"
                          : "bg-surface-tertiary text-muted"
                      }`}
                      title="Send"
                    >
                      {pendingStart ? (
                        <svg aria-hidden="true" className="w-5 h-5 animate-spin" viewBox="0 0 100 101" fill="none">
                          <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor" opacity="0.3" />
                          <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="white" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Directory selector — below the card; optional. No directory → conversation task. */}
                <div ref={dirPickerRef} className="relative mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDirPicker(!showDirPicker)}
                    className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] transition-colors ${
                      formCwd
                        ? "border-accent/30 bg-accent/5 text-ink-700 hover:border-accent/50"
                        : "border-ink-900/10 bg-surface text-muted hover:border-ink-900/20 hover:text-ink-700"
                    }`}
                    title={formCwd || "Select a working directory (optional)"}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="min-w-0 truncate max-w-[280px]">
                      {formCwd ? formCwd.split('/').filter(Boolean).slice(-2).join('/') : "Add working directory (optional)"}
                    </span>
                  </button>

                  {/* Clear selection → reverts to conversation task */}
                  {formCwd && (
                    <button
                      type="button"
                      onClick={() => setFormCwd("")}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-tertiary hover:text-ink-700 transition-colors"
                      title="Clear directory (switch to conversation task)"
                      aria-label="Clear directory"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}

                  {/* Task type hint */}
                  <span className="text-[12px] text-muted-light">
                    {formCwd ? "Project task" : "Conversation task"}
                  </span>

                  {showDirPicker && (
                    <DirectoryPickerPopover
                      value={formCwd}
                      onChange={(path) => { setFormCwd(path); setShowDirPicker(false); }}
                      onClose={() => setShowDirPicker(false)}
                    />
                  )}
                </div>
              </div>

              {/* Quick Action Chips — LobsterAI QuickActionBar pattern */}
              <div className="relative z-0 mt-8 flex w-full max-w-3xl flex-wrap justify-center gap-2 animate-fade-in-up" style={{ animationDelay: "260ms", animationFillMode: "both" }}>
                {QUICK_TEMPLATES.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => {
                      setFormPrompt(action.prompt);
                    }}
                    className="flex items-center gap-1.5 rounded-full border border-ink-900/10 bg-surface px-3.5 py-1.5 text-sm text-ink-700 transition-all duration-200 ease-out hover:-translate-y-px hover:border-accent/30 hover:bg-surface-raised hover:text-ink-800 hover:shadow-subtle active:translate-y-0 active:scale-[0.97]"
                  >
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>

              <div aria-hidden className="w-full min-h-[24px] flex-[3_0_0px]" />
            </div>
          </div>
        ) : (
          /* Active session content */
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="relative flex-1 overflow-y-auto px-6 pb-40 pt-6"
          >
            {/* Gradient fade at top when scrolled up */}
            {hasMoreHistory && scrollY > 50 && (
              <div className="pointer-events-none absolute top-0 left-0 right-0 z-10 h-20 bg-gradient-to-b from-surface-cream to-transparent transition-opacity duration-200" />
            )}

            <div className="mx-auto max-w-3xl">
              <div ref={topSentinelRef} className="h-1" />

              {!hasMoreHistory && totalMessages > 0 && (
                <div className="flex items-center justify-center py-4 mb-4">
                  <div className="flex items-center gap-2 text-xs text-muted-light">
                    <div className="h-px w-12 bg-gradient-to-r from-transparent to-ink-900/10" />
                    Beginning of conversation
                    <div className="h-px w-12 bg-gradient-to-l from-transparent to-ink-900/10" />
                  </div>
                </div>
              )}

              {isLoadingHistory && (
                <div className="flex items-center justify-center py-4 mb-4">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Loading...</span>
                  </div>
                </div>
              )}

              {visibleTurns.length === 0 ? (
                // While session is initializing/loading, show a loading state
                // instead of the home screen to avoid confusion
                isRunning ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mb-3"></div>
                    <p className="text-sm">Agent Cowork is getting started...</p>
                  </div>
                ) : (
                  <HomeScreen />
                )
              ) : (
                visibleTurns.map((turn, turnIdx) => (
                  <TurnBlock
                    key={`${activeSessionId}-turn-${turn.turnIndex}`}
                    turn={turn}
                    isLastTurn={turnIdx === visibleTurns.length - 1}
                    isSessionRunning={isRunning}
                    permissionRequests={permissionRequests}
                    onPermissionResult={(toolUseId: string) => {
                      sendEvent({ type: "permission.response", payload: { sessionId: activeSessionId || "", toolUseId, result: { behavior: "allow" } } });
                    }}
                  />
                ))
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Prompt input — only shown when there's an active session */}
        {activeSessionId && (
          <PromptInput sendEvent={sendEvent} onSendMessage={handleSendMessage} disabled={!canUserInteract} />
        )}

        {hasNewMessages && !shouldAutoScroll && (
          <button
            onClick={scrollToBottom}
            className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-full border border-white/20 bg-accent/95 backdrop-blur-sm px-4 py-2 text-sm font-medium text-white shadow-elevated transition-all hover:bg-accent hover:scale-105 animate-slide-up-fade"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
            <span>New messages</span>
          </button>
        )}
      </main>

      {showSettingsModal && (
        <SettingsModal onClose={() => setShowSettingsModal(false)} />
      )}

      {globalError && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-error/20 bg-error-light px-4 py-3 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-sm text-error">{globalError}</span>
            <button className="text-error hover:text-error/80" onClick={() => setGlobalError(null)}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
