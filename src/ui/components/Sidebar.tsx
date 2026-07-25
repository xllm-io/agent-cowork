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
        // Toggle pin via store update
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
        // Trigger export (placeholder — will be wired up in Phase 4.2)
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
    // Position menu near the button
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPosition({ right: Math.max(8, window.innerWidth - rect.right), y: rect.bottom + 8 });
    setDeleteConfirmId(null);
  };

  return (
    <aside className="fixed inset-y-0 left-0 flex h-full w-[280px] flex-col gap-4 border-r border-ink-900/5 bg-[#FAF9F6] px-4 pb-4 pt-12">
      <div
        className="absolute top-0 left-0 right-0 h-12"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      <div className="flex gap-2">
        <button
          className="flex-1 rounded-xl border border-ink-900/10 bg-surface px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors"
          onClick={onNewSession}
        >
          + New Task
        </button>
        <button
          className="rounded-xl border border-ink-900/10 bg-surface px-4 py-3 text-sm text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors"
          onClick={() => useAppStore.getState().setShowSettingsModal(true)}
          aria-label="Settings"
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
      <div className="relative flex flex-col gap-2 overflow-y-auto flex-1">
        {/* Top gradient fade indicator */}
        <div className="pointer-events-none absolute top-0 left-4 right-4 z-10 h-6 bg-gradient-to-b from-[#FAF9F6] to-transparent" />

        {sessionList.length === 0 && (
          <div className="rounded-xl border border-ink-900/5 bg-surface px-4 py-5 text-center text-xs text-muted">
            No sessions yet. Click "+ New Task" to start.
          </div>
        )}
        {sessionList.map((session) => {
          const isActive = activeSessionId === session.id;
          const isRenaming = renamingId === session.id;
          const showStatusDot = session.status === "running";
          const showRelativeTime = !showStatusDot;

          return (
            <div
              key={session.id}
              className={`group relative rounded-lg p-3 cursor-pointer transition-all duration-150 ${
                isActive
                  ? "bg-black/[0.06]"
                  : "hover:bg-black/[0.04]"
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
              <div className="flex items-start">
                <div className="flex-1 min-w-0">
                  {/* Title row with status dot */}
                  <div className="flex items-center mb-1 gap-2">
                    {showStatusDot && (
                      <span className="block w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 shadow-[0_0_6px_rgba(59,130,246,0.5)] animate-pulse" />
                    )}
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
                        className="flex-1 min-w-0 rounded-lg border border-border bg-background px-2 py-1 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    ) : (
                      <h3 className="text-sm font-medium text-foreground truncate">
                        {session.title}
                      </h3>
                    )}
                  </div>

                  {/* Meta row: time + status label */}
                  <div className="flex min-w-0 items-center gap-2 text-xs text-muted-light">
                    {showRelativeTime && (
                      <span className="whitespace-nowrap">{formatRelativeTime(session.updatedAt)}</span>
                    )}
                    <span className="text-[10px] uppercase tracking-wider whitespace-nowrap">
                      {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions overlay */}
              <div className={`absolute right-1.5 top-1.5 transition-opacity ${
                isRenaming ? "opacity-0 pointer-events-none" : "opacity-0 group-hover:opacity-100"
              }`}>
                <button
                  ref={actionButtonRef}
                  onClick={(e) => openMenu(e, session)}
                  className="p-1.5 rounded-lg bg-surface-raised text-secondary hover:bg-surface transition-colors"
                  aria-label="Open session menu"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                    <circle cx="5" cy="12" r="1.7" />
                    <circle cx="12" cy="12" r="1.7" />
                    <circle cx="19" cy="12" r="1.7" />
                  </svg>
                </button>
              </div>

              {/* Context menu */}
              {menuPosition && menuSessionId === session.id && (
                <div
                  ref={menuRef}
                  className="fixed z-50 w-max min-w-[124px] max-w-[calc(100vw-16px)] rounded-xl border border-ink-900/10 bg-white shadow-lg overflow-hidden"
                  style={{ top: menuPosition.y, right: menuPosition.right }}
                >
                  {getMenuItems(session).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={item.onClick}
                      className={`w-full flex items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm transition-colors hover:bg-surface-tertiary ${
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
        <div className="pointer-events-none absolute bottom-0 left-4 right-4 z-10 h-6 bg-gradient-to-t from-[#FAF9F6] to-transparent" />
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
