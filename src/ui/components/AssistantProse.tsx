import React, { useState } from "react";
import MDContent from "../render/markdown";
import type { AssistantContentBlock } from "../hooks/useTurns";

// ---------------------------------------------------------------------------
// Tool icons — minimal outline style matching Claude Code
// ---------------------------------------------------------------------------

const TOOL_ICONS: Record<string, React.ReactNode> = {
  Bash: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 8l3 3-3 3M12 14h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Read: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  Write: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  ),
  Edit: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  Glob: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
    </svg>
  ),
  Grep: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 0L0 21M21 21L0 0" strokeLinecap="round" />
    </svg>
  ),
  Task: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  WebFetch: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  ),
};

const getDefaultIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" strokeLinecap="round" />
  </svg>
);

// ---------------------------------------------------------------------------
// HoverActionBar — copy + fork buttons on hover
// ---------------------------------------------------------------------------

const HoverActionBar: React.FC<{ showCopy?: boolean; onFork?: () => void }> = ({ showCopy = true, onFork }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* not available */ }
  };

  return (
    <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      {showCopy && (
        <button onClick={() => handleCopy("placeholder")} className="text-[11px] text-muted hover:text-ink-600 px-1.5 py-0.5 rounded hover:bg-surface-tertiary transition-colors" title="Copy all text">
          {copied ? "✓ Copied" : "Copy"}
        </button>
      )}
      {onFork && (
        <button onClick={onFork} className="text-[11px] text-muted hover:text-ink-600 px-1.5 py-0.5 rounded hover:bg-surface-tertiary transition-colors" title="Fork conversation">Fork</button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------

const TypingIndicator = () => (
  <div className="flex items-center gap-1 mt-2 text-muted">
    <span className="animate-bounce-subtle">●</span>
    <span className="animate-bounce-subtle" style={{ animationDelay: "0.2s" }}>●</span>
    <span className="animate-bounce-subtle" style={{ animationDelay: "0.4s" }}>●</span>
  </div>
);

// ---------------------------------------------------------------------------
// CollapsibleSection — lightweight card for expanded detail view
// ---------------------------------------------------------------------------

function CollapsibleDetail({
  title,
  icon,
  status,
  children,
  maxLines,
}: {
  title: string;
  icon?: React.ReactNode;
  status: string;
  children: React.ReactNode;
  maxLines?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasOverflow = maxLines && typeof children === "string" && children.split("\n").length > maxLines;

  return (
    <div className="my-0.5">
      {/* Compact row — always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-1 py-1 text-left text-sm text-muted-light hover:text-ink-600 transition-colors rounded-lg hover:bg-surface-tertiary/50"
      >
        {/* Status dot */}
        <span className={`relative flex h-2 w-2 shrink-0 ${
          status === "running" ? "bg-info" : status === "error" ? "bg-error" : status === "success" ? "bg-success" : "bg-muted-light"
        }`}>
          {status === "running" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />}
        </span>

        {/* Icon */}
        {icon && <span className="shrink-0">{icon}</span>}

        {/* Title */}
        <span className="min-w-0 truncate">{title}</span>

        {/* Right side */}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {hasOverflow && <span className="text-[10px] text-muted-light">▼</span>}
          <svg
            viewBox="0 0 24 24"
            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 text-muted-light ${isExpanded ? "rotate-90" : ""}`}
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </button>

      {/* Expanded detail card */}
      {isExpanded && (
        <div className="mt-1 ml-6 rounded-xl border border-ink-900/5 bg-surface p-3 shadow-sm">
          {maxLines && typeof children === "string" && hasOverflow ? (
            <div className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed overflow-hidden" style={{ maxHeight: maxLines * 1.5 + "rem" }}>
              {children}
              <span className="text-muted-light"> ... (truncated)</span>
            </div>
          ) : (
            <>{children}</>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssistantProse — Claude Code style: compact flat rows + expandable detail
// ---------------------------------------------------------------------------

export function AssistantProse({
  blocks,
  isStreaming,
  onFork,
}: {
  blocks: AssistantContentBlock[];
  isStreaming?: boolean;
  onFork?: () => void;
}) {
  if (blocks.length === 0) return null;

  // Extract plain text for copy action
  const fullText = blocks.filter(b => b.type === "text").map(b => b.output || "").join("\n\n");

  return (
    <div className="group mr-auto max-w-[85%] lg:max-w-[75%] xl:max-w-[700px]">
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'thinking': {
            const isRunning = isStreaming && block.status !== "success";
            return (
              <CollapsibleDetail
                key={`thinking-${idx}`}
                title="Thinking"
                icon={
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
                status={isRunning ? "running" : "success"}
                maxLines={10}
              >
                {block.output || (isRunning ? "..." : "")}
              </CollapsibleDetail>
            );
          }

          case 'tool_use': {
            const toolLabel = block.name || "Tool";
            const toolDetail = block.command || block.filePath || "";
            const title = toolDetail ? `${toolLabel}: ${toolDetail}` : toolLabel;
            const icon = TOOL_ICONS[block.name || ""] ?? getDefaultIcon();

            // Build expanded content
            let inputDisplay = "";
            if (block.command) inputDisplay = `$ ${block.command}`;
            else if (block.filePath) inputDisplay = `Read: ${block.filePath}`;
            else if (block.input && Object.keys(block.input).length > 0) {
              const raw = JSON.stringify(block.input, null, 2);
              inputDisplay = raw.slice(0, 1000);
            }

            const hasOutput = inputDisplay.length > 0;

            return (
              <CollapsibleDetail
                key={`tool-${idx}`}
                title={hasOutput ? `Ran ${title}` : title}
                icon={icon}
                status={block.status}
                maxLines={0}
              >
                {hasOutput ? (
                  <pre className="text-xs font-mono text-ink-600 whitespace-pre-wrap break-words">{inputDisplay}</pre>
                ) : (
                  <p className="text-xs text-muted-light">
                    {block.status === "pending" ? "Awaiting input..." : "No input parameters"}
                  </p>
                )}
              </CollapsibleDetail>
            );
          }

          case 'tool_result': {
            const isError = block.isError;
            const icon = isError ? (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-error" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-muted-light" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            );

            return (
              <CollapsibleDetail
                key={`result-${idx}`}
                title={isError ? "Output (error)" : "Output"}
                icon={icon}
                status={isError ? "error" : "success"}
                maxLines={5}
              >
                {block.isMarkdown ? (
                  <MDContent text={block.output || ""} />
                ) : (
                  <pre className="text-sm whitespace-pre-wrap break-words font-mono text-ink-700">{block.output}</pre>
                )}
              </CollapsibleDetail>
            );
          }

          case 'text':
            return (
              <div key={`text-${idx}`} className="my-1">
                <MDContent text={block.output || ""} />
              </div>
            );

          default:
            return null;
        }
      })}

      {/* Streaming typing indicator at end of last turn */}
      {isStreaming && <TypingIndicator />}

      {/* Hover action bar */}
      {fullText && <HoverActionBar onFork={onFork} />}
    </div>
  );
}
