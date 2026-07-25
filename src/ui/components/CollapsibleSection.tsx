import { useState } from "react";

// ---------------------------------------------------------------------------
// Status dot colors
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted-light",
  running: "bg-info",
  success: "bg-success",
  error: "bg-error",
};

// ---------------------------------------------------------------------------
// CollapsibleSection — reusable collapsible card for thinking / tool / result
// ---------------------------------------------------------------------------

export function CollapsibleSection({
  title,
  icon,
  status = "success",
  children,
  maxLines = 0,
  defaultExpanded = false,
}: {
  title: string;
  icon?: React.ReactNode;
  status?: "pending" | "running" | "success" | "error";
  children: React.ReactNode;
  /** Auto-collapse content after this many lines (0 = never) */
  maxLines?: number;
  /** Show a copy button when expanded */
  copyable?: boolean;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="my-2 rounded-xl border border-ink-900/5 bg-surface-secondary overflow-hidden transition-colors hover:border-ink-900/10">
      {/* Header row — always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium text-muted hover:text-ink-600 transition-colors"
      >
        {/* Status dot */}
        <span className={`relative flex h-2 w-2 shrink-0 ${STATUS_COLORS[status] || STATUS_COLORS.success}`}>
          {status === "running" && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
          )}
        </span>

        {/* Icon */}
        {icon && <span className="h-4 w-4 shrink-0 text-muted">{icon}</span>}

        {/* Title */}
        <span className="min-w-0 truncate text-left">{title}</span>

        {/* Expand/collapse hint */}
        {!isExpanded && maxLines > 0 && (
          <span className="ml-auto text-[10px] text-muted-light">▼</span>
        )}

        {/* Chevron */}
        <svg
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-ink-900/5 px-3.5 pb-3 pt-3">
          {maxLines > 0 && typeof children === "string" ? (
            <div className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed overflow-hidden" style={{
              maxHeight: maxLines * 1.5 + "rem",
            }}>
              {children}
              {/* Show ellipsis if truncated */}
              {children.split("\n").length > maxLines && (
                <span className="text-muted-light"> ... (truncated)</span>
              )}
            </div>
          ) : (
            <>{children}</>
          )}
        </div>
      )}
    </div>
  );
}
