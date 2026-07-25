import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAppStore } from "../store/useAppStore";
import { formatRelativeTime } from "../utils/formatRelativeTime";

interface SidebarProps {
  connected: boolean;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
}

// Menu item type for session context menu
type MenuItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
};

// ---------------------------------------------------------------------------
// Session icon by status
// ---------------------------------------------------------------------------

const SessionIcon = ({ status }: { status: string }) => {
  if (status === "running") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-info" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "error") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-error" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10" />
        <path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" />
      </svg>
    );
  }
  // completed / idle
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted-light" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Truncated title — keeps the end of long titles
// ---------------------------------------------------------------------------

function TruncatedTitle({ title, maxLength = 24 }: { title: string; maxLength?: number }) {
  if (title.length <= maxLength) return <span>{title}</span>;
  return (
    <>
      <span className="text-muted-light">…</span>
      <span>{title.slice(-maxLength + 1)}</span>
    </>
  );
}

export function Sidebar({
  onNewSession,
  onDeleteSession
}: SidebarProps) {
  const sessions = useAppStore((state) => state.sessions);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const setActiveSessionId = useAppStore((state) => state.setActiveSessionId);
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  // Per-session state for inline rename + delete confirmation
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ right: number; y: number } | null>(null);
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleCopyCommand = async () => {
    if (!resumeSessionId) return;
    const command = `claude --resume ${resumeSessionId}`;
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      return;
    }
    setCopied(true);
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setResumeSessionId(null);
    }, 3000);
  };

  // Close menu on outside click / escape
  useEffect(() => {
    if (!menuPosition || !menuSessionId) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !actionButtonRef.current?.contains(target)) {
        setMenuPosition(null);
        setMenuSessionId(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuPosition(null);
        setMenuSessionId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuPosition, menuSessionId]);

  // Close delete confirm on escape
  useEffect(() => {
    if (!deleteConfirmId) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDeleteConfirmId(null);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [deleteConfirmId]);

  // Focus rename input when it opens
  useEffect(() => {
    if (renamingId) {
      requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    }
  }, [renamingId]);

  const sessionList = useMemo(() => {
    const list = Object.values(sessions);
    list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return list;
  }, [sessions]);

  // Build menu items for a given session
  const getMenuItems = (session: ReturnType<typeof useAppStore.getState>["sessions"][string]): MenuItem[] => [
    {
      key: "rename",
      label: "Rename",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-500" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      ),
      onClick: () => {
        setRenamingId(session.id);
        setRenameValue(session.title);
        setMenuPosition(null);
      },
    },
    {
      key: "pin",
      label: session.pinned ? "Unpin" : "Pin",
      icon: (
        <svg viewBox="0 0 24 24" className={`h-4 w-4 ${session.pinned ? "text-accent" : "text-ink-500"}`} fill={session.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
          <path d="M12 17v5M9 3h6l-1 6h4l-5 7-3-7H9z" />
        </svg>
      ),
      onClick: () => {
        useAppStore.setState((state) => ({
          sessions: {
            ...state.sessions,
            [session.id]: { ...session, pinned: !session.pinned },
          },
        }));
        setMenuPosition(null);
      },
    },
    {
      key: "export",
      label: "Export",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-500" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      ),
      onClick: () => {
        console.log("Export session:", session.id);
        setMenuPosition(null);
      },
    },
    {
      key: "resume",
      label: "Resume in Claude Code",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-500" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 5h16v14H4z" /><path d="M7 9h10M7 12h6" /><path d="M13 15l3 2-3 2" />
        </svg>
      ),
      onClick: () => {
        setResumeSessionId(session.id);
        setMenuPosition(null);
      },
    },
    {
      key: "delete",
      label: "Delete",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-error/80" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M7 7l1 12a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9l1-12" />
        </svg>
      ),
      danger: true,
      onClick: () => {
        setDeleteConfirmId(session.id);
        setMenuPosition(null);
      },
    },
  ];

  const handleRenameSave = () => {
    const nextTitle = renameValue.trim();
    if (nextTitle && renamingId) {
      useAppStore.setState((state) => ({
        sessions: {
          ...state.sessions,
          [renamingId]: { ...state.sessions[renamingId], title: nextTitle },
        },
      }));
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const handleRenameCancel = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirmId) {
      onDeleteSession(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const openMenu = (e: React.MouseEvent, session: typeof sessionList[number]) => {
    e.stopPropagation();
    if (renamingId === session.id) return;
    if (menuPosition && menuSessionId === session.id) {
      setMenuPosition(null);
      setMenuSessionId(null);
      return;
    }
    setMenuSessionId(session.id);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPosition({ right: Math.max(8, window.innerWidth - rect.right), y: rect.bottom + 8 });
    setDeleteConfirmId(null);
  };

  return (
    <aside className="fixed inset-y-0 left-0 flex h-full w-[280px] flex-col border-r border-ink-900/5 bg-surface-cream">
      {/* Title bar (draggable region for Electron) */}
      <div
        className="absolute top-0 left-0 right-0 h-12"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* Top controls */}
      <div className="relative flex items-center gap-2 px-4 pt-16 pb-2">
        <button
          className="flex-1 rounded-xl border border-ink-900/10 bg-surface px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors"
          onClick={onNewSession}
        >
          + New Task
        </button>
        <button
          className="rounded-xl border border-ink-900/10 bg-surface px-3 py-2.5 text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors"
          onClick={() => useAppStore.getState().setShowSettingsModal(true)}
          aria-label="Settings"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06-.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Session list */}
      <div className="relative flex flex-1 flex-col overflow-y-auto px-3 py-2">
        {/* Top gradient fade indicator */}
        <div className="pointer-events-none absolute top-0 left-3 right-3 z-10 h-6 bg-gradient-to-b from-surface-cream to-transparent" />

        {sessionList.length === 0 && (
          <div className="mx-auto mt-8 max-w-[200px] rounded-xl border border-dashed border-ink-900/10 px-4 py-6 text-center">
            <svg viewBox="0 0 24 24" className="mx-auto h-8 w-8 text-muted-light/50" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="mt-2 text-xs text-muted">No tasks yet</p>
            <p className="mt-0.5 text-[11px] text-muted-light">Click "+ New Task" to start</p>
          </div>
        )}

        {sessionList.map((session) => {
          const isActive = activeSessionId === session.id;
          const isRenaming = renamingId === session.id;
          const showStatusDot = session.status === "running";

          return (
            <div
              key={session.id}
              className={`group relative my-0.5 rounded-xl p-3 cursor-pointer transition-all duration-150 ${
                isActive
                  ? "bg-accent-subtle shadow-subtle"
                  : "hover:bg-surface-tertiary"
              }`}
              onClick={() => {
                if (isRenaming) return;
                setActiveSessionId(session.id);
              }}
              onKeyDown={(e) => {
                if (isRenaming) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveSessionId(session.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-start gap-2.5">
                {/* Status icon */}
                <div className={`mt-0.5 shrink-0 ${isActive ? "text-accent" : ""}`}>
                  {showStatusDot ? (
                    <span className="block h-2.5 w-2.5 rounded-full bg-info shadow-[0_0_6px_rgba(37,99,235,0.5)] animate-pulse" />
                  ) : (
                    <SessionIcon status={session.status} />
                  )}
                </div>

                {/* Text content */}
                <div className="min-w-0 flex-1">
                  {/* Title row */}
                  <div className="mb-1 flex items-center gap-1.5">
                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameSave();
                          if (e.key === "Escape") handleRenameCancel();
                        }}
                        onBlur={handleRenameSave}
                        className="flex-1 min-w-0 rounded-lg border border-border bg-surface px-2 py-1 text-sm font-medium text-ink-800 focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    ) : (
                      <h3 className="text-sm font-medium text-ink-800 truncate leading-snug">
                        <TruncatedTitle title={session.title} />
                      </h3>
                    )}
                  </div>

                  {/* Meta row: time + status */}
                  <div className="flex items-center gap-2 text-[11px] leading-none">
                    {showStatusDot ? (
                      <span className="text-info font-medium">Running</span>
                    ) : (
                      <>
                        <span className="text-muted-light">{formatRelativeTime(session.updatedAt)}</span>
                        <span className="text-muted-light/70 uppercase tracking-wide">
                          {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions button — always visible on active, hover on others */}
                <div className={`shrink-0 transition-opacity ${
                  isRenaming ? "opacity-0 pointer-events-none" : ""
                }`}>
                  <button
                    ref={actionButtonRef}
                    onClick={(e) => openMenu(e, session)}
                    className={`rounded-lg p-1.5 transition-colors ${
                      isActive
                        ? "opacity-100 text-accent hover:bg-accent-subtle"
                        : "opacity-0 group-hover:opacity-100 text-muted hover:bg-surface hover:text-ink-700"
                    }`}
                    aria-label="Open session menu"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <circle cx="5" cy="12" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="19" cy="12" r="1.5" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Context menu */}
              {menuPosition && menuSessionId === session.id && (
                <div
                  ref={menuRef}
                  className="fixed z-50 w-max min-w-[140px] max-w-[calc(100vw-16px)] rounded-xl border border-ink-900/10 bg-surface shadow-elevated overflow-hidden"
                  style={{ top: menuPosition.y, right: menuPosition.right }}
                >
                  {getMenuItems(session).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={item.onClick}
                      className={`w-full flex items-center gap-2.5 whitespace-nowrap px-3 py-2 text-left text-sm transition-colors hover:bg-surface-tertiary ${
                        item.danger ? "text-error" : "text-ink-700"
                      }`}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Delete confirmation modal */}
              {deleteConfirmId === session.id && (
                <Dialog.Root open={true} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm" />
                    <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
                      <div className="flex items-center gap-3 px-5 py-4">
                        <div className="p-2 rounded-full bg-red-100">
                          <svg viewBox="0 0 24 24" className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          </svg>
                        </div>
                        <h2 className="text-base font-semibold text-ink-800">Delete Session</h2>
                      </div>
                      <div className="px-5 pb-4">
                        <p className="text-sm text-muted">Are you sure you want to delete this session? This action cannot be undone.</p>
                      </div>
                      <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-ink-900/10">
                        <Dialog.Close asChild>
                          <button className="px-4 py-2 text-sm font-medium rounded-lg text-muted hover:bg-surface-tertiary transition-colors">
                            Cancel
                          </button>
                        </Dialog.Close>
                        <button
                          onClick={handleDeleteConfirm}
                          className="px-4 py-2 text-sm font-medium rounded-lg bg-error hover:bg-error/90 text-white transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
              )}
            </div>
          );
        })}

        {/* Bottom gradient fade indicator */}
        <div className="pointer-events-none absolute bottom-0 left-3 right-3 z-10 h-6 bg-gradient-to-t from-surface-cream to-transparent" />
      </div>

      {/* Resume dialog */}
      <Dialog.Root open={!!resumeSessionId} onOpenChange={(open) => !open && setResumeSessionId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="text-lg font-semibold text-ink-800">Resume</Dialog.Title>
              <Dialog.Close asChild>
                <button className="rounded-full p-1 text-ink-500 hover:bg-ink-900/10" aria-label="Close dialog">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6l-12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-ink-900/10 bg-surface px-3 py-2 font-mono text-xs text-ink-700">
              <span className="flex-1 break-all">{resumeSessionId ? `claude --resume ${resumeSessionId}` : ""}</span>
              <button className="rounded-lg p-1.5 text-ink-600 hover:bg-ink-900/10" onClick={handleCopyCommand} aria-label="Copy resume command">
                {copied ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l4 4L19 6" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </aside>
  );
}
