import React, { useEffect, useRef, useState } from "react";
import type {
  PermissionResult,
  SDKAssistantMessage,
  SDKMessage,
  SDKResultMessage,
  SDKUserMessage
} from "@anthropic-ai/claude-agent-sdk";
import type { StreamMessage } from "../types";
import type { PermissionRequest } from "../store/useAppStore";
import { useAppStore } from "../store/useAppStore";
import MDContent from "../render/markdown";
import { DecisionPanel } from "./DecisionPanel";

type MessageContent = SDKAssistantMessage["message"]["content"][number];
type ToolResultContent = SDKUserMessage["message"]["content"][number];

const MAX_VISIBLE_LINES = 3;

// ---------------------------------------------------------------------------
// AskUserQuestion signature — uses sorted JSON to avoid separator collisions
// ---------------------------------------------------------------------------

type AskUserQuestionInput = {
  questions?: Array<{
    question: string;
    header?: string;
    options?: Array<{ label: string; description?: string }>;
    multiSelect?: boolean;
  }>;
};

const getAskUserQuestionSignature = (input?: AskUserQuestionInput | null): string => {
  if (!input?.questions?.length) return "";
  const parts = input.questions.map((q) => {
    const opts = (q.options ?? []).map((o) => ({ l: o.label, d: o.description ?? "" }));
    return { q: q.question, h: q.header ?? "", m: q.multiSelect ? true : false, o: opts };
  });
  return JSON.stringify(parts);
};

// ---------------------------------------------------------------------------
// Tool status helpers — read from / write to Zustand store
// ---------------------------------------------------------------------------

const useToolStatus = (toolUseId: string | undefined, sessionId: string | null) => {
  const [status, setStatus] = useState<"pending" | "success" | "error" | undefined>(undefined);

  useEffect(() => {
    if (!toolUseId || !sessionId) return;
    // Read initial state
    const sessions = useAppStore.getState().sessions;
    const session = sessions[sessionId];
    if (!session) return;
    const entry = session.toolStatuses.find((t) => t.toolUseId === toolUseId);
    setStatus(entry?.status);

    // Subscribe to changes
    const unsub = useAppStore.subscribe((state) => {
      const s = state.sessions[sessionId];
      if (!s) return;
      const next = s.toolStatuses.find((t) => t.toolUseId === toolUseId);
      setStatus(next?.status);
    });

    return unsub;
  }, [toolUseId, sessionId]);

  return status;
};

const setToolStatusInStore = (sessionId: string, toolUseId: string, status: "pending" | "success" | "error") => {
  if (!sessionId) return;
  useAppStore.setState((state) => {
    const existing = state.sessions[sessionId];
    if (!existing) return {};
    const filtered = existing.toolStatuses.filter((t) => t.toolUseId !== toolUseId);
    return {
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...existing,
          toolStatuses: [...filtered, { toolUseId, status }]
        }
      }
    };
  });
};

// ---------------------------------------------------------------------------
// Message action buttons (hover-reveal copy)
// ---------------------------------------------------------------------------

const MessageCopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      timerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard API not available */ }
  };

  return (
    <button
      onClick={handleCopy}
      className="text-[11px] text-muted hover:text-ink-600 px-1.5 py-0.5 rounded hover:bg-surface-tertiary transition-colors"
      title="Copy to clipboard"
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
};

// ---------------------------------------------------------------------------
// StatusDot component
// ---------------------------------------------------------------------------

const StatusDot = ({ variant = "accent", isActive = false, isVisible = true }: {
  variant?: "accent" | "success" | "error"; isActive?: boolean; isVisible?: boolean;
}) => {
  if (!isVisible) return null;
  const colorClass = variant === "success" ? "bg-success" : variant === "error" ? "bg-error" : "bg-accent";
  return (
    <span className="relative flex h-2 w-2">
      {isActive && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${colorClass} opacity-75`} />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${colorClass}`} />
    </span>
  );
};

// ---------------------------------------------------------------------------
// Individual message card renderers (strategy pattern)
// ---------------------------------------------------------------------------

const SessionResultCard = ({ message }: { message: SDKResultMessage }) => {
  const formatMinutes = (ms: number | undefined) => typeof ms !== "number" ? "-" : `${(ms / 60000).toFixed(2)} min`;
  const formatUsd = (usd: number | undefined) => typeof usd !== "number" ? "-" : usd.toFixed(2);
  const formatMillions = (tokens: number | undefined) => typeof tokens !== "number" ? "-" : `${(tokens / 1_000_000).toFixed(4)} M`;

  return (
    <div className="flex flex-col gap-2 mt-4">
      <div className="header text-accent">Session Result</div>
      <div className="flex flex-col rounded-xl px-4 py-3 border border-ink-900/10 bg-surface-secondary space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <span className="font-normal">Duration</span>
          <span className="inline-flex items-center rounded-full bg-surface-tertiary px-2.5 py-0.5 text-ink-700 text-[13px]">{formatMinutes(message.duration_ms)}</span>
          <span className="font-normal">API</span>
          <span className="inline-flex items-center rounded-full bg-surface-tertiary px-2.5 py-0.5 text-ink-700 text-[13px]">{formatMinutes(message.duration_api_ms)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <span className="font-normal">Usage</span>
          <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-accent text-[13px]">Cost ${formatUsd(message.total_cost_usd)}</span>
          <span className="inline-flex items-center rounded-full bg-surface-tertiary px-2.5 py-0.5 text-ink-700 text-[13px]">Input {formatMillions(message.usage?.input_tokens)}</span>
          <span className="inline-flex items-center rounded-full bg-surface-tertiary px-2.5 py-0.5 text-ink-700 text-[13px]">Output {formatMillions(message.usage?.output_tokens)}</span>
        </div>
      </div>
    </div>
  );
};

const ErrorResultCard = ({ sdkMessage }: { sdkMessage: any }) => (
  <div className="flex flex-col gap-2 mt-4">
    <div className="header text-error">Session Error</div>
    <div className="rounded-xl bg-error-light p-3">
      <pre className="text-sm text-error whitespace-pre-wrap">{JSON.stringify(sdkMessage, null, 2)}</pre>
    </div>
  </div>
);

const AssistantBlockCard = ({ title, text, showIndicator = false }: { title: string; text: string; showIndicator?: boolean }) => (
  <div className="flex flex-col mt-4 group">
    <div className="header text-accent flex items-center gap-2">
      <StatusDot variant="success" isActive={showIndicator} isVisible={showIndicator} />
      {title}
    </div>
    <MDContent text={text} />
    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1 mt-1">
      <MessageCopyButton text={text} />
    </div>
  </div>
);

const ToolUseCard = ({ messageContent, showIndicator = false, sessionId }: {
  messageContent: MessageContent;
  showIndicator?: boolean;
  sessionId: string | null;
}) => {
  if (messageContent.type !== "tool_use") return null;

  const toolStatus = useToolStatus(messageContent.id, sessionId);
  const statusVariant = toolStatus === "error" ? "error" as const : toolStatus === "success" ? "success" as const : "accent";
  const isPending = !toolStatus || toolStatus === "pending";
  const shouldShowDot = toolStatus === "success" || toolStatus === "error" || showIndicator;

  useEffect(() => {
    if (messageContent?.id && sessionId && !toolStatus) {
      setToolStatusInStore(sessionId, messageContent.id, "pending");
    }
  }, [messageContent?.id, sessionId, toolStatus]);

  const getToolInfo = (): string | null => {
    const input = messageContent.input as Record<string, any>;
    switch (messageContent.name) {
      case "Bash": return input?.command || null;
      case "Read": case "Write": case "Edit": return input?.file_path || null;
      case "Glob": case "Grep": return input?.pattern || null;
      case "Task": return input?.description || null;
      case "WebFetch": return input?.url || null;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-[1rem] bg-surface-tertiary px-3 py-2 mt-4 overflow-hidden">
      <div className="flex flex-row items-center gap-2 min-w-0">
        <StatusDot variant={statusVariant} isActive={isPending && showIndicator} isVisible={shouldShowDot} />
        <div className="flex flex-row items-center gap-2 tool-use-item min-w-0 flex-1">
          <span className="inline-flex items-center rounded-md text-accent py-0.5 text-sm font-medium shrink-0">{messageContent.name}</span>
          <span className="text-sm text-muted truncate">{getToolInfo()}</span>
        </div>
      </div>
    </div>
  );
};

const ToolResultCard = ({ messageContent, sessionId }: {
  messageContent: ToolResultContent;
  sessionId: string | null;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isFirstRender = useRef(true);
  let lines: string[] = [];

  if (messageContent.type !== "tool_result") return null;

  const toolUseId = messageContent.tool_use_id;
  const status: "success" | "error" = messageContent.is_error ? "error" : "success";
  const isError = messageContent.is_error;

  if (messageContent.is_error) {
    lines = [extractTagContent(String(messageContent.content), "tool_use_error") || String(messageContent.content)];
  } else {
    try {
      if (Array.isArray(messageContent.content)) {
        lines = messageContent.content.map((item: any) => item.text || "").join("\n").split("\n");
      } else {
        lines = String(messageContent.content).split("\n");
      }
    } catch { lines = [JSON.stringify(messageContent, null, 2)]; }
  }

  const isMarkdownContent = isMarkdown(lines.join("\n"));
  const hasMoreLines = lines.length > MAX_VISIBLE_LINES;
  const visibleContent = hasMoreLines && !isExpanded ? lines.slice(0, MAX_VISIBLE_LINES).join("\n") : lines.join("\n");

  // Update tool status in store when result arrives
  useEffect(() => {
    if (sessionId) {
      setToolStatusInStore(sessionId, toolUseId, status);
    }
  }, [toolUseId, status, sessionId]);

  useEffect(() => {
    if (!hasMoreLines || isFirstRender.current) { isFirstRender.current = false; return; }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [hasMoreLines, isExpanded]);

  return (
    <div className="flex flex-col mt-4">
      <div className="header text-accent">Output</div>
      <div className="mt-2 rounded-xl bg-surface-tertiary p-3">
        <pre className={`text-sm whitespace-pre-wrap break-words font-mono ${isError ? "text-red-500" : "text-ink-700"}`}>
          {isMarkdownContent ? <MDContent text={visibleContent} /> : visibleContent}
        </pre>
        {hasMoreLines && (
          <button onClick={() => setIsExpanded(!isExpanded)} className="mt-2 text-sm text-accent hover:text-accent-hover transition-colors flex items-center gap-1">
            <span>{isExpanded ? "▲" : "▼"}</span>
            <span>{isExpanded ? "Collapse" : `Show ${lines.length - MAX_VISIBLE_LINES} more lines`}</span>
          </button>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

const AskUserQuestionCard = ({
  messageContent,
  permissionRequest,
  onPermissionResult,
}: {
  messageContent: MessageContent;
  permissionRequest?: PermissionRequest;
  onPermissionResult?: (toolUseId: string, result: PermissionResult) => void;
}) => {
  if (messageContent.type !== "tool_use") return null;

  const input = messageContent.input as AskUserQuestionInput | null;
  const questions = input?.questions ?? [];
  const currentSignature = getAskUserQuestionSignature(input);
  const requestSignature = getAskUserQuestionSignature(permissionRequest?.input as AskUserQuestionInput | undefined);
  const isActiveRequest = permissionRequest && currentSignature === requestSignature;

  if (isActiveRequest && onPermissionResult) {
    return (
      <div className="mt-4">
        <DecisionPanel
          request={permissionRequest}
          onSubmit={(result) => onPermissionResult(permissionRequest.toolUseId, result)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[1rem] bg-surface-tertiary px-3 py-2 mt-4">
      <div className="flex flex-row items-center gap-2">
        <StatusDot variant="success" isActive={false} isVisible={true} />
        <span className="inline-flex items-center rounded-md text-accent py-0.5 text-sm font-medium">AskUserQuestion</span>
      </div>
      {questions.map((q, idx) => (
        <div key={idx} className="text-sm text-ink-700 ml-4">{q.question}</div>
      ))}
    </div>
  );
};

const SystemInfoCard = ({ message, showIndicator = false }: { message: SDKMessage; showIndicator?: boolean }) => {
  if (message.type !== "system") return null;
  if ("subtype" in message && message.subtype !== "init") return null;

  const systemMsg = message as any;

  const InfoItem = ({ name, value }: { name: string; value: string }) => (
    <div className="text-[14px]">
      <span className="mr-4 font-normal">{name}</span>
      <span className="font-light">{value}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-2 mt-2">
      <div className="header text-accent flex items-center gap-2">
        <StatusDot variant="success" isActive={showIndicator} isVisible={showIndicator} />
        System Init
      </div>
      <div className="flex flex-col rounded-xl px-4 py-2 border border-ink-900/10 bg-surface-secondary space-y-1">
        <InfoItem name="Session ID" value={systemMsg.session_id || "-"} />
        <InfoItem name="Model Name" value={systemMsg.model || "-"} />
        <InfoItem name="Permission Mode" value={systemMsg.permissionMode || "-"} />
        <InfoItem name="Working Directory" value={systemMsg.cwd || "-"} />
      </div>
    </div>
  );
};

const UserMessageCard = ({ message, showIndicator = false }: { message: { type: "user_prompt"; prompt: string }; showIndicator?: boolean }) => (
  <div className="flex flex-col mt-4 group">
    <div className="header text-accent flex items-center gap-2">
      <StatusDot variant="success" isActive={showIndicator} isVisible={showIndicator} />
      User
    </div>
    <MDContent text={message.prompt} />
    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1 mt-1">
      <MessageCopyButton text={message.prompt} />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isMarkdown(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const patterns: RegExp[] = [/^#{1,6}\s+/m, /```[\s\S]*?```/];
  return patterns.some((pattern) => pattern.test(text));
}

function extractTagContent(input: string, tag: string): string | null {
  const match = input.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Renderer map (strategy pattern)
// ---------------------------------------------------------------------------

type RendererArgs = {
  content: MessageContent | SDKResultMessage | SDKMessage | SDKUserMessage["message"] | { type: "user_prompt"; prompt: string };
  showIndicator: boolean;
  sessionId: string | null;
  permissionRequest?: PermissionRequest;
  onPermissionResult?: (toolUseId: string, result: PermissionResult) => void;
};

const RENDERERS: Record<string, (args: RendererArgs) => React.ReactNode> = {
  user_prompt: (args: any) => <UserMessageCard message={args.content} showIndicator={args.showIndicator} />,
  system: (args: any) => <SystemInfoCard message={args.content} showIndicator={args.showIndicator} />,
  assistant_text: (args: any) => <AssistantBlockCard title="Assistant" text={args.content.text} showIndicator={args.showIndicator} />,
  assistant_thinking: (args: any) => <AssistantBlockCard title="Thinking" text={args.content.thinking} showIndicator={args.showIndicator} />,
  tool_use: (args: any) => {
    if (args.content.name === "AskUserQuestion") {
      return <AskUserQuestionCard messageContent={args.content} permissionRequest={args.permissionRequest} onPermissionResult={args.onPermissionResult} />;
    }
    return <ToolUseCard messageContent={args.content} showIndicator={args.showIndicator} sessionId={args.sessionId} />;
  },
  tool_result: (args: any) => <ToolResultCard messageContent={args.content} sessionId={args.sessionId} />,
};

// ---------------------------------------------------------------------------
// Main MessageCard — dispatches to strategy map
// ---------------------------------------------------------------------------

export function MessageCard({
  message,
  isLast = false,
  isRunning = false,
  permissionRequest,
  onPermissionResult,
  sessionId
}: {
  message: StreamMessage;
  isLast?: boolean;
  isRunning?: boolean;
  permissionRequest?: PermissionRequest;
  onPermissionResult?: (toolUseId: string, result: PermissionResult) => void;
  sessionId: string | null;
}) {
  const showIndicator = isLast && isRunning;

  // ── top-level type dispatch ────────────────────────────────────────
  if (message.type === "user_prompt") {
    return <div className="animate-fade-in-up">{RENDERERS.user_prompt({ content: message, showIndicator, sessionId, permissionRequest, onPermissionResult })}</div>;
  }

  const sdkMessage = message as SDKMessage;

  if (sdkMessage.type === "system") {
    return <div className="animate-fade-in-up">{RENDERERS.system({ content: sdkMessage, showIndicator, sessionId, permissionRequest, onPermissionResult })}</div>;
  }

  if (sdkMessage.type === "result") {
    if (sdkMessage.subtype === "success") {
      return <div className="animate-fade-in-up"><SessionResultCard message={sdkMessage} /></div>;
    }
    return <div className="animate-fade-in-up"><ErrorResultCard sdkMessage={sdkMessage} /></div>;
  }

  if (sdkMessage.type === "assistant") {
    const contents = sdkMessage.message.content;
    return (
      <div className="animate-fade-in-up">
        {contents.map((content: MessageContent, idx: number) => {
          const isLastContent = idx === contents.length - 1;
          const key = content.type === "thinking" ? "assistant_thinking" : content.type === "text" ? "assistant_text" : "tool_use";
          return (
            <React.Fragment key={idx}>
              {RENDERERS[key]?.({
                content,
                showIndicator: isLastContent && showIndicator,
                sessionId,
                permissionRequest,
                onPermissionResult
              })}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  if (sdkMessage.type === "user") {
    const contents = sdkMessage.message.content;
    return (
      <div className="animate-fade-in-up">
        {contents.map((content: ToolResultContent, idx: number) => {
          if (content.type === "tool_result") {
            return <React.Fragment key={idx}>{RENDERERS.tool_result?.({ content, showIndicator: false, sessionId })}</React.Fragment>;
          }
          return null;
        })}
      </div>
    );
  }

  return null;
}

export { MessageCard as EventCard, StatusDot, isMarkdown };
