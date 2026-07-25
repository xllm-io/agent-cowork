import { create } from 'zustand';
import type { ServerEvent, SessionStatus, StreamMessage } from "../types";

export type PermissionRequest = {
  toolUseId: string;
  toolName: string;
  input: unknown;
};

export type ToolStatusEntry = {
  toolUseId: string;
  status: "pending" | "success" | "error";
};

/** Partial content block being streamed for a session */
export type PartialContentBlock = {
  type: "thinking" | "text" | "tool_use";
  id?: string;
  name?: string;
  content: string;       // accumulated text output
  input: Record<string, unknown>; // accumulated tool input
  isComplete: boolean;   // true once content_block_stop arrives
};

export type SessionView = {
  id: string;
  title: string;
  status: SessionStatus;
  cwd?: string;
  messages: StreamMessage[];
  permissionRequests: PermissionRequest[];
  toolStatuses: ToolStatusEntry[];
  lastPrompt?: string;
  createdAt?: number;
  updatedAt?: number;
  hydrated: boolean;
  pinned: boolean;
  /** Live partial content blocks assembled from stream_event deltas */
  partialBlocks: PartialContentBlock[];
};

interface AppState {
  sessions: Record<string, SessionView>;
  activeSessionId: string | null;
  prompt: string;
  cwd: string;
  pendingStart: boolean;
  globalError: string | null;
  sessionsLoaded: boolean;
  showSettingsModal: boolean;
  historyRequested: string[];
  apiConfigChecked: boolean;

  setPrompt: (prompt: string) => void;
  setCwd: (cwd: string) => void;
  setPendingStart: (pending: boolean) => void;
  setGlobalError: (error: string | null) => void;
  setShowSettingsModal: (show: boolean) => void;
  setActiveSessionId: (id: string | null) => void;
  setApiConfigChecked: (checked: boolean) => void;
  markHistoryRequested: (sessionId: string) => void;
  resolvePermissionRequest: (sessionId: string, toolUseId: string) => void;
  handleServerEvent: (event: ServerEvent) => void;
}

/**
 * Assemble partial content blocks from stream_event deltas.
 * This is called on every stream.message event during streaming to build
 * up thinking/text/tool_use blocks in real-time before they arrive as
 * fully-assembled SDKAssistantMessage objects.
 */
function assemblePartialBlock(
  blocks: PartialContentBlock[],
  msg: any, // SDKPartialAssistantMessage
): PartialContentBlock[] {
  const evt = msg.event;
  if (!evt) return blocks;

  // Handle content_block_start — initialize a new block
  if (evt.type === "content_block_start") {
    const cb = evt.content_block;
    if (!cb || !cb.type) return blocks;
    const type = cb.type as "thinking" | "text" | "tool_use";
    const newBlock: PartialContentBlock = {
      type,
      content: "",
      input: {},
      isComplete: false,
    };
    if (type === "tool_use" && cb.id) newBlock.id = cb.id;
    if (type === "tool_use" && cb.name) newBlock.name = cb.name;
    return [...blocks, newBlock];
  }

  // Handle content_block_stop — mark block as complete
  if (evt.type === "content_block_stop") {
    return blocks.map((b) => (b.isComplete ? b : { ...b, isComplete: true }));
  }

  // Handle content_block_delta — accumulate content
  if (evt.type !== "content_block_delta") return blocks;

  const delta = evt.delta;
  if (!delta) return blocks;

  const blockType = delta.type; // "text" | "input_json" | "thinking"
  if (!blockType) return blocks;

  // Find or create the block being streamed
  let idx = blocks.findIndex((b) => b.type === blockType && !b.isComplete);
  if (idx === -1) {
    const newBlock: PartialContentBlock = {
      type: blockType as "thinking" | "text" | "tool_use",
      content: "",
      input: {},
      isComplete: false,
    };
    idx = blocks.length;
    blocks = [...blocks, newBlock];
  }

  const updated = [...blocks];
  const block = updated[idx];

  if (blockType === "input_json" && delta.partial_json) {
    // Accumulate JSON string for tool inputs
    block.input = { ...block.input, _partial: (block.input._partial || "") + delta.partial_json };
  } else {
    // Accumulate text/thinking content
    const raw = (delta as any)[blockType] ?? "";
    block.content += raw;
  }

  return updated;
}

function createSession(id: string): SessionView {
  return { id, title: "", status: "idle", messages: [], permissionRequests: [], toolStatuses: [], hydrated: false, pinned: false, partialBlocks: [] };
}

export const useAppStore = create<AppState>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  prompt: "",
  cwd: "",
  pendingStart: false,
  globalError: null,
  sessionsLoaded: false,
  showSettingsModal: false,
  historyRequested: [],
  apiConfigChecked: false,

  setPrompt: (prompt) => set({ prompt }),
  setCwd: (cwd) => set({ cwd }),
  setPendingStart: (pendingStart) => set({ pendingStart }),
  setGlobalError: (globalError) => set({ globalError }),
  setShowSettingsModal: (showSettingsModal) => set({ showSettingsModal }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setApiConfigChecked: (apiConfigChecked) => set({ apiConfigChecked }),

  markHistoryRequested: (sessionId) => {
    set((state) => ({
      historyRequested: [...state.historyRequested, sessionId],
    }));
  },

  resolvePermissionRequest: (sessionId, toolUseId) => {
    set((state) => {
      const existing = state.sessions[sessionId];
      if (!existing) return {};
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...existing,
            permissionRequests: existing.permissionRequests.filter(req => req.toolUseId !== toolUseId)
          }
        }
      };
    });
  },

  handleServerEvent: (event) => {
    switch (event.type) {
      case "session.list": {
        const state = get();
        const nextSessions: Record<string, SessionView> = {};
        for (const session of event.payload.sessions) {
          const existing = state.sessions[session.id] ?? createSession(session.id);
          nextSessions[session.id] = {
            ...existing,
            status: session.status,
            title: session.title,
            cwd: session.cwd,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt
          };
        }

        set({ sessions: nextSessions, sessionsLoaded: true });

        const hasSessions = event.payload.sessions.length > 0;

        if (!hasSessions) {
          get().setActiveSessionId(null);
        }

        if (!state.activeSessionId && event.payload.sessions.length > 0) {
          const sorted = [...event.payload.sessions].sort((a, b) => {
            const aTime = a.updatedAt ?? a.createdAt ?? 0;
            const bTime = b.updatedAt ?? b.createdAt ?? 0;
            return aTime - bTime;
          });
          const latestSession = sorted[sorted.length - 1];
          if (latestSession) {
            get().setActiveSessionId(latestSession.id);
          }
        } else if (state.activeSessionId) {
          const stillExists = event.payload.sessions.some(
            (session) => session.id === state.activeSessionId
          );
          if (!stillExists) {
            get().setActiveSessionId(null);
          }
        }
        break;
      }

      case "session.history": {
        const { sessionId, messages, status } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...existing, status, messages, hydrated: true, partialBlocks: [] }
            }
          };
        });
        break;
      }

      case "session.status": {
        set((state) => {
          const existing = state.sessions[event.payload.sessionId] ?? createSession(event.payload.sessionId);
          const updated: SessionView = {
            ...existing,
            status: event.payload.status,
            title: event.payload.title ?? existing.title,
            cwd: event.payload.cwd ?? existing.cwd,
            updatedAt: Date.now(),
            // Clear partial blocks when session transitions away from running
            partialBlocks: event.payload.status !== "running" ? [] : existing.partialBlocks,
          };
          return {
            sessions: {
              ...state.sessions,
              [event.payload.sessionId]: updated
            }
          };
        });

        // Check pendingStart after the set settles
        const currentState = get();
        if (currentState.pendingStart) {
          get().setActiveSessionId(currentState.activeSessionId);
          set({ pendingStart: false });
        }
        break;
      }

      case "session.deleted": {
        const { sessionId } = event.payload;
        set((state) => {
          const nextSessions = { ...state.sessions };
          delete nextSessions[sessionId];

          const nextHistoryRequested = state.historyRequested.filter(id => id !== sessionId);

          const newState: Record<string, unknown> = {
            sessions: nextSessions,
            historyRequested: nextHistoryRequested,
          };

          if (state.activeSessionId === sessionId) {
            const remaining = Object.values(nextSessions).sort(
              (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
            );
            newState.activeSessionId = remaining[0]?.id ?? null;
          }

          return newState;
        });
        break;
      }

      case "stream.message": {
        const { sessionId, message } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);

          // Assemble partial content blocks from stream_event deltas
          let nextPartialBlocks = [...existing.partialBlocks];
          if (message.type === "stream_event") {
            nextPartialBlocks = assemblePartialBlock(nextPartialBlocks, message);
          }

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                messages: [...existing.messages, message],
                partialBlocks: nextPartialBlocks,
              },
            },
          };
        });
        break;
      }

      case "stream.user_prompt": {
        const { sessionId, prompt } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                messages: [...existing.messages, { type: "user_prompt", prompt }],
                // Clear partial blocks — new user input starts a fresh turn
                partialBlocks: [],
              }
            }
          };
        });
        break;
      }

      case "permission.request": {
        const { sessionId, toolUseId, toolName, input } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                permissionRequests: [...existing.permissionRequests, { toolUseId, toolName, input }]
              }
            }
          };
        });
        break;
      }

      case "runner.error": {
        set({ globalError: event.payload.message });
        break;
      }
    }
  }
}));
