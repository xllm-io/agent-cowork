import { useState } from "react";
import MDContent from "../render/markdown";

// ---------------------------------------------------------------------------
// Copy button (local) — mirrors LobsterAI UserMessageItem.CopyButton
// ---------------------------------------------------------------------------

const CopyButton: React.FC<{ content: string; visible: boolean }> = ({ content, visible }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`p-1.5 rounded-md hover:bg-surface-raised transition-all duration-200 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      tabIndex={visible ? 0 : -1}
      title="Copy to clipboard"
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-green-500" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-muted" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// ReEdit button (local)
// ---------------------------------------------------------------------------

const ReEditButton: React.FC<{ visible: boolean; onClick: () => void }> = ({ visible, onClick }) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={`p-1.5 rounded-md hover:bg-surface-raised transition-all duration-200 ${
      visible ? "opacity-100" : "opacity-0 pointer-events-none"
    }`}
    tabIndex={visible ? 0 : -1}
    title="Re-edit"
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-muted" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  </button>
);

// ---------------------------------------------------------------------------
// UserBubble — right-aligned message bubble (inspired by LobsterAI UserMessageItem)
// ---------------------------------------------------------------------------

export function UserBubble({
  prompt,
  timestamp,
  onReEdit,
}: {
  prompt: string;
  timestamp?: number;
  onReEdit?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  const formatTime = (ts?: number): string => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div
      className="py-2 focus:outline-none"
      onMouseEnter={() => setIsHovered(true)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
    >
      <div className="flex items-start gap-3 flex-row-reverse">
        <div className="w-full min-w-0 flex flex-col items-end">
          {/* Bubble */}
          <div className="w-fit max-w-[85%] lg:max-w-[700px] rounded-2xl px-5 py-3 bg-surface text-foreground shadow-subtle">
            <MDContent text={prompt} />
          </div>

          {/* Meta row: time + copy + re-edit */}
          <div className="flex w-full items-center justify-end gap-1.5 mt-1">
            {formatTime(timestamp) && (
              <span className="text-xs text-muted-light">{formatTime(timestamp)}</span>
            )}
            <CopyButton content={prompt} visible={isHovered} />
            {onReEdit && (
              <ReEditButton visible={isHovered} onClick={onReEdit} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
