import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAppStore, type SessionView } from "../store/useAppStore";
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

// A group of project sessions sharing the same working directory
type ProjectGroup = {
  cwd: string;
  label: string;
  latest: number;
  sessions: SessionView[];
};

// Human-readable folder label — last path segment of a cwd
function dirLabel(fullPath: string): string {
  const parts = fullPath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? fullPath;
}

// ---------------------------------------------------------------------------
// Session icon by status (compact circle indicator)
// ---------------------------------------------------------------------------

const StatusDot = ({ status, active }: { status: string; active?: boolean }) => {
  if (status === "running") {
    return (
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-info" />
      </span>
    );
  }
  if (status === "error") {
    return <span className="block h-2.5 w-2.5 shrink-0 rounded-full bg-error" />;
  }
  // completed / idle
  return <span className={`block h-2.5 w-2.5 shrink-0 rounded-full ${active ? "bg-accent/40" : "bg-muted-light/40"}`} />;
};

// ---------------------------------------------------------------------------
// Truncated title — keeps the beginning of long titles
// ---------------------------------------------------------------------------

function TruncatedTitle({ title, maxLength = 22 }: { title: string; maxLength?: number }) {
  if (title.length <= maxLength) return <span>{title}</span>;
  return (
    <>
      <span>{title.slice(0, maxLength)}</span>
      <span className="text-muted-light">…</span>
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
  const [menuPosition, setMenuPosition] = useState<{ right: number; top?: number; bottom?: number } | null>(null);
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Collapsed project folders (keyed by cwd)
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());

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

  const { pinnedSessions, projectGroups, conversationSessions, totalCount } = useMemo(() => {
    const all = Object.values(sessions);
    const byUpdated = (a: SessionView, b: SessionView) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0);

    const pinned = all.filter((s) => s.pinned).sort(byUpdated);
    const unpinned = all.filter((s) => !s.pinned);

    // Project sessions (have a cwd) grouped by directory
    const groupMap = new Map<string, SessionView[]>();
    const conversations: SessionView[] = [];
    for (const s of unpinned) {
      if (s.cwd && s.cwd.trim()) {
        const key = s.cwd;
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key)!.push(s);
      } else {
        conversations.push(s);
      }
    }

    const groups: ProjectGroup[] = [...groupMap.entries()].map(([cwd, list]) => {
      const sorted = [...list].sort(byUpdated);
      return {
        cwd,
        label: dirLabel(cwd),
        latest: sorted[0]?.updatedAt ?? 0,
        sessions: sorted,
      };
    });
    // Most recently active project folder first
    groups.sort((a, b) => b.latest - a.latest);

    conversations.sort(byUpdated);

    return {
      pinnedSessions: pinned,
      projectGroups: groups,
      conversationSessions: conversations,
      totalCount: all.length,
    };
  }, [sessions]);

  const toggleDir = (cwd: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) next.delete(cwd);
      else next.add(cwd);
      return next;
    });
  };

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

  const openMenu = (e: React.MouseEvent, session: SessionView) => {
    e.stopPropagation();
    if (renamingId === session.id) return;
    if (menuPosition && menuSessionId === session.id) {
      setMenuPosition(null);
      setMenuSessionId(null);
      return;
    }
    setMenuSessionId(session.id);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

    // Calculate available space below and above the button
    const belowSpace = window.innerHeight - rect.bottom;
    const aboveSpace = rect.top;
    const menuHeight = 250; // approximate max menu height with padding

    let top: number;

    // Prefer positioning below the button if enough space
    if (belowSpace >= menuHeight + 8) {
      top = rect.bottom + 8;
    } else if (aboveSpace >= menuHeight) {
      // Not enough room below but enough above - position above
      top = rect.top - menuHeight;
    } else {
      // Both spaces limited - try below but clamp to viewport
      top = Math.min(rect.bottom + 8, window.innerHeight - menuHeight);
    }

    // Ensure menu doesn't go off top of screen
    if (top < 0) {
      top = rect.bottom + 8;
    }

    setMenuPosition({ right: Math.max(8, window.innerWidth - rect.right), top });
    setDeleteConfirmId(null);
  };

  // Reusable session row — used by pinned, project children, and conversations.
  const renderSessionRow = (session: SessionView, opts?: { indent?: boolean }) => {
    const isActive = activeSessionId === session.id;
    const isRenaming = renamingId === session.id;
    const showStatusDot = session.status === "running";

    return (
      <div
        key={session.id}
        className={`group relative my-0.5 rounded-xl cursor-pointer transition-all duration-150 ${
          opts?.indent ? "ml-3" : ""
        } ${
          isActive
            ? "bg-surface-raised shadow-sm ring-1 ring-accent/15"
            : "hover:bg-surface-tertiary"
        }`}
        style={{ padding: "6px 10px" }}
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
        <div className="flex items-center justify-between gap-2">
          {/* Left: status dot + title */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <StatusDot status={session.status} active={isActive} />
            <h3 className={`truncate text-[14px] leading-normal ${
              isActive ? "text-ink-900" : "text-ink-800"
            }`}>
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
                  className="w-full bg-transparent focus:outline-none focus:ring-2 focus:ring-accent/30 rounded px-1 -mx-1"
                />
              ) : (
                <TruncatedTitle title={session.title} maxLength={opts?.indent ? 20 : 22} />
              )}
            </h3>
          </div>

          {/* Right: actions + meta */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Relative time */}
            {!showStatusDot && (
              <span className="text-xs text-muted-light tabular-nums">
                {formatRelativeTime(session.updatedAt)}
              </span>
            )}

            {/* Actions button */}
            <div className={`shrink-0 transition-opacity ${isRenaming ? "opacity-0 pointer-events-none" : ""}`}>
              <button
                ref={actionButtonRef}
                onClick={(e) => openMenu(e, session)}
                className={`rounded-lg p-1.5 transition-colors ${
                  isActive
                    ? "opacity-60 hover:opacity-100 text-ink-700 hover:bg-surface"
                    : "opacity-0 group-hover:opacity-60 text-ink-700 hover:opacity-100 hover:bg-surface"
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
        </div>

        {/* Context menu */}
        {menuPosition && menuSessionId === session.id && (
          <div
            ref={menuRef}
            className="fixed z-50 w-max min-w-[140px] max-w-[calc(100vw-16px)] rounded-xl border border-ink-900/10 bg-surface shadow-elevated overflow-y-auto"
            style={{ top: menuPosition.top, right: menuPosition.right }}
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
  };

  // Small section label (Pinned / Conversations)
  const SectionLabel = ({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) => (
    <div className="flex items-center gap-1.5 px-2 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-light">
      {icon}
      {children}
    </div>
  );

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

        {totalCount === 0 && (
          <div className="mx-auto mt-8 max-w-[200px] rounded-xl border border-dashed border-ink-900/10 px-4 py-6 text-center">
            <svg viewBox="0 0 24 24" className="mx-auto h-8 w-8 text-muted-light/50" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="mt-2 text-xs text-muted">No tasks yet</p>
            <p className="mt-0.5 text-[11px] text-muted-light">Click "+ New Task" to start</p>
          </div>
        )}

        {/* Pinned */}
        {pinnedSessions.length > 0 && (
          <>
            <SectionLabel
              icon={
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-accent" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 17v5M9 3h6l-1 6h4l-5 7-3-7H9z" />
                </svg>
              }
            >
              Pinned
            </SectionLabel>
            {pinnedSessions.map((session) => renderSessionRow(session))}
          </>
        )}

        {/* Project folders */}
        {projectGroups.map((group) => {
          const collapsed = collapsedDirs.has(group.cwd);
          const hasActive = group.sessions.some((s) => s.id === activeSessionId);
          return (
            <div key={group.cwd} className="mt-1">
              {/* Folder node header */}
              <button
                type="button"
                onClick={() => toggleDir(group.cwd)}
                className="group flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-tertiary"
                title={group.cwd}
              >
                {/* Chevron */}
                <svg
                  viewBox="0 0 24 24"
                  className={`h-3.5 w-3.5 shrink-0 text-muted-light transition-transform duration-200 ${collapsed ? "" : "rotate-90"}`}
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
                {/* Folder icon */}
                <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 ${hasActive ? "text-accent" : "text-muted"}`} fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${hasActive ? "text-ink-900" : "text-ink-700"}`}>
                  {group.label}
                </span>
                {/* Count badge */}
                <span className="shrink-0 rounded-full bg-surface-tertiary px-1.5 text-[11px] tabular-nums text-muted-light">
                  {group.sessions.length}
                </span>
              </button>

              {/* Folder children */}
              {!collapsed && (
                <div className="mt-0.5 border-l border-ink-900/5 pl-1">
                  {group.sessions.map((session) => renderSessionRow(session, { indent: true }))}
                </div>
              )}
            </div>
          );
        })}

        {/* Conversations */}
        {conversationSessions.length > 0 && (
          <>
            <SectionLabel
              icon={
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
            >
              Conversations
            </SectionLabel>
            {conversationSessions.map((session) => renderSessionRow(session))}
          </>
        )}

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
