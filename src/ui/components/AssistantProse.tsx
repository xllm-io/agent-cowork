import React, { useState } from "react";
import MDContent from "../render/markdown";
import { CollapsibleSection } from "./CollapsibleSection";
import type { AssistantContentBlock } from "../hooks/useTurns";

// ---------------------------------------------------------------------------
// Tool icons
// ---------------------------------------------------------------------------

const TOOL_ICONS: Record<string, React.ReactNode> = {
  Bash: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 17l6-6-6-6M12 19h8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Read: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  Write: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  ),
  Edit: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
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
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* not available */ }
  };

  return (
    <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      {showCopy && (
        <button
          onClick={() => handleCopy("placeholder")}
          className="text-[11px] text-muted hover:text-ink-600 px-1.5 py-0.5 rounded hover:bg-surface-tertiary transition-colors"
          title="Copy all text"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      )}
      {onFork && (
        <button
          onClick={onFork}
          className="text-[11px] text-muted hover:text-ink-600 px-1.5 py-0.5 rounded hover:bg-surface-tertiary transition-colors"
          title="Fork conversation"
        >
          Fork
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Thinking icon
// ---------------------------------------------------------------------------

const ThinkingIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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
// AssistantProse — left-aligned assistant response with collapsible sections
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
  const fullText = blocks
    .filter(b => b.type === "text")
    .map(b => b.output || "")
    .join("\n\n");

  return (
    <div className="group mr-auto max-w-[85%]">
      {/* Render each content block as a collapsible section */}
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'thinking': {
            const isRunning = isStreaming && block.status !== "success";
            return (
              <CollapsibleSection
                key={`thinking-${idx}`}
                title="Thinking"
                icon={<ThinkingIcon />}
                status={isRunning ? "running" : block.status}
                maxLines={10}
              >
                <p className="text-sm text-ink-600 whitespace-pre-wrap leading-relaxed">
                  {block.output || (isRunning ? "..." : "")}
                </p>
              </CollapsibleSection>
            );
          }

          case 'tool_use': {
            // Build display title: "Bash: echo hello" or "Read: package.json"
            const toolLabel = block.name || "Tool";
            const toolDetail = block.command || block.filePath || "";
            const title = toolDetail ? `${toolLabel}: ${toolDetail}` : toolLabel;
            const icon = TOOL_ICONS[block.name || ""] ?? getDefaultIcon();

            // Build input display — handle partial JSON during streaming
            let inputDisplay = "";
            if (block.command) inputDisplay = `Command: ${block.command}`;
            else if (block.filePath) inputDisplay = `File: ${block.filePath}`;
            else if (block.input && Object.keys(block.input).length > 0) {
              const raw = JSON.stringify(block.input, null, 2);
              inputDisplay = raw.slice(0, 500);
              // During streaming, partial JSON may be incomplete — append ellipsis
              if (block.status === "pending") {
                inputDisplay += "\n...";
              }
            }

            return (
              <CollapsibleSection
                key={`tool-${idx}`}
                title={title}
                icon={icon}
                status={block.status}
                maxLines={0} // always show full input
              >
                {inputDisplay ? (
                  <pre className="text-xs font-mono text-muted-light whitespace-pre-wrap break-words">{inputDisplay}</pre>
                ) : (
                  <p className="text-xs text-muted-light">
                    {block.status === "pending" ? "Awaiting input..." : "No input parameters"}
                  </p>
                )}
              </CollapsibleSection>
            );
          }

          case 'tool_result': {
            const statusLabel = block.isError ? "Output (error)" : "Output";
            const statusColor = block.isError ? "error" : "success";
            const icon = block.isError ? (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-error" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-success" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10" />
                <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            );

            return (
              <CollapsibleSection
                key={`result-${idx}`}
                title={statusLabel}
                icon={icon}
                status={statusColor as "success" | "error"}
                maxLines={5}
              >
                {block.isMarkdown ? (
                  <MDContent text={block.output || ""} />
                ) : (
                  <pre className="text-sm whitespace-pre-wrap break-words font-mono text-ink-700">{block.output}</pre>
                )}
              </CollapsibleSection>
            );
          }

          case 'text':
            // Text blocks render inline (not collapsible)
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
