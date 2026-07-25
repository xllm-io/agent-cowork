import type { StreamMessage } from "../types";
import type { PartialContentBlock } from "../store/useAppStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssistantContentBlock {
  type: 'thinking' | 'text' | 'tool_use' | 'tool_result';
  id?: string;           // tool_use.id
  name?: string;         // tool name (Bash, Read, etc.)
  command?: string;      // for Bash tools
  filePath?: string;     // for Read/Write/Edit tools
  input?: Record<string, any>;
  output?: string;       // text content or tool result
  isMarkdown?: boolean;  // whether output should be rendered as markdown
  isError?: boolean;     // tool result error flag
  status: 'pending' | 'running' | 'success' | 'error';
}

export interface TurnGroup {
  turnIndex: number;
  userInput: StreamMessage & { type: "user_prompt" };
  assistantMessages: StreamMessage[]; // SDKAssistantMessage items
  toolsUsed: string[]; // extracted tool names from content blocks
  hasThinking: boolean;
  textContent: string; // concatenated assistant text blocks
  isStreaming: boolean; // true if last message is partial/streaming
  assistantBlocks: AssistantContentBlock[]; // NEW: structured content blocks
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract tool command info from a tool_use block.
 */
function getToolInfo(block: any): { command?: string; filePath?: string } {
  const input = block?.input || {};
  switch (block.name) {
    case "Bash": return { command: input?.command };
    case "Read": case "Write": case "Edit": return { filePath: input?.file_path };
    case "Glob": case "Grep": return { command: input?.pattern };
    case "Task": return { command: input?.description };
    case "WebFetch": return { command: input?.url };
    default: return {};
  }
}

/**
 * Convert a PartialContentBlock into an AssistantContentBlock.
 */
function partialToAssistantBlock(p: PartialContentBlock): AssistantContentBlock {
  if (p.type === "tool_use") {
    let parsedInput: Record<string, any> = {};
    try {
      const raw = p.input._partial as string || "";
      if (raw) parsedInput = JSON.parse(raw);
    } catch { /* still streaming, keep partial */ }
    const extraInput: Record<string, any> = {};
    for (const [k, v] of Object.entries(p.input)) {
      if (k !== "_partial") extraInput[k] = v;
    }
    parsedInput = { ...parsedInput, ...extraInput };

    const info = getToolInfo({ name: p.name, input: parsedInput });
    return {
      type: "tool_use", id: p.id, name: p.name,
      command: info.command, filePath: info.filePath,
      input: parsedInput, output: "", status: "pending",
    };
  }
  return {
    type: p.type, output: p.content,
    status: p.isComplete ? "success" : "running",
  };
}

/**
 * Assemble partial blocks from stream_event messages within a single turn.
 * Scopes partials to the turn they belong to — adding a new turn never
 * affects previous ones because each turn accumulates its own partials.
 */
function assembleTurnPartials(turnMessages: StreamMessage[]): PartialContentBlock[] {
  const blocks: PartialContentBlock[] = [];

  for (const msg of turnMessages) {
    if (msg.type !== "stream_event") continue;
    const evt = (msg as any).event;
    if (!evt) continue;

    if (evt.type === "content_block_start") {
      const cb = evt.content_block;
      if (!cb || !cb.type) continue;
      const type = cb.type as "thinking" | "text" | "tool_use";
      const newBlock: PartialContentBlock = { type, content: "", input: {}, isComplete: false };
      if (type === "tool_use" && cb.id) newBlock.id = cb.id;
      if (type === "tool_use" && cb.name) newBlock.name = cb.name;
      blocks.push(newBlock);
    } else if (evt.type === "content_block_stop") {
      for (let i = blocks.length - 1; i >= 0; i--) {
        if (!blocks[i].isComplete) {
          blocks[i] = { ...blocks[i], isComplete: true };
          break;
        }
      }
    } else if (evt.type === "content_block_delta") {
      const delta = evt.delta;
      if (!delta || !delta.type) continue;
      const blockType = delta.type;

      let idx = blocks.findIndex((b) => b.type === blockType && !b.isComplete);
      if (idx === -1) {
        blocks.push({ type: blockType as "thinking" | "text" | "tool_use", content: "", input: {}, isComplete: false });
        idx = blocks.length - 1;
      }

      const block = blocks[idx];
      if (blockType === "input_json" && delta.partial_json) {
        block.input = { ...block.input, _partial: (block.input._partial || "") + delta.partial_json };
      } else {
        const raw = (delta as any)[blockType] ?? "";
        block.content += raw;
      }
    }
  }

  return blocks;
}

/**
 * Extract structured content blocks for a single turn.
 * Prioritizes assembled assistant messages; falls back to partials
 * when streaming is still in progress.
 */
function extractBlocksForTurn(
  assistantMessages: StreamMessage[],
  turnStreamEvents: StreamMessage[],
): AssistantContentBlock[] {
  const blocks: AssistantContentBlock[] = [];

  // 1) From assembled assistant messages (authoritative for completed turns)
  for (const msg of assistantMessages) {
    if (msg.type !== "assistant") continue;
    const sdkMsg = msg as any;
    const contents = sdkMsg?.message?.content || [];
    for (const block of contents) {
      if (!block) continue;
      if (block.type === "thinking") {
        blocks.push({ type: "thinking", output: block.thinking || "", status: "success" });
      } else if (block.type === "text") {
        blocks.push({ type: "text", output: block.text || "", status: "success" });
      } else if (block.type === "tool_use") {
        const info = getToolInfo(block);
        blocks.push({
          type: "tool_use", id: block.id, name: block.name,
          command: info.command, filePath: info.filePath,
          input: block.input, status: "pending",
        });
      }
    }
  }

  // 2) If no assembled blocks yet (streaming in progress), use partials
  //    Otherwise merge partials only for types not covered by assembled blocks
  const partials = assembleTurnPartials(turnStreamEvents);
  const assembledTypes = new Set(blocks.map(b => b.type));

  for (const p of partials) {
    if (!assembledTypes.has(p.type)) {
      blocks.push(partialToAssistantBlock(p));
    }
  }

  return blocks;
}

/**
 * Extract tool names used within a set of assistant messages.
 */
function extractTools(messages: StreamMessage[]): string[] {
  const tools = new Set<string>();
  for (const msg of messages) {
    if (msg.type !== "assistant") continue;
    const sdkMsg = msg as any;
    const contents = sdkMsg?.message?.content || [];
    for (const block of contents) {
      if (block?.type === "tool_use" && block?.name) {
        tools.add(block.name);
      }
    }
  }
  return [...tools];
}

/**
 * Concatenate all text content blocks from assistant messages.
 */
function extractText(messages: StreamMessage[]): string {
  let text = "";
  for (const msg of messages) {
    if (msg.type !== "assistant") continue;
    const sdkMsg = msg as any;
    const contents = sdkMsg?.message?.content || [];
    for (const block of contents) {
      if (block?.type === "text" && block?.text) {
        text += block.text;
      }
    }
  }
  return text.trim();
}

/**
 * Check if any assistant message contains a thinking block.
 */
function hasThinking(messages: StreamMessage[]): boolean {
  for (const msg of messages) {
    if (msg.type !== "assistant") continue;
    const sdkMsg = msg as any;
    const contents = sdkMsg?.message?.content || [];
    for (const block of contents) {
      if (block?.type === "thinking") return true;
    }
  }
  return false;
}

/**
 * Determine if the last assistant message appears to be streaming/partial.
 */
function detectStreaming(messages: StreamMessage[], totalMessages: number, visibleStartIndex: number): boolean {
  if (messages.length === 0) return false;
  const lastMsg = messages[messages.length - 1];
  if (lastMsg.type !== "assistant") return false;

  const lastVisibleIndex = messages.length - 1;
  const actualLastMsgIdx = visibleStartIndex + lastVisibleIndex;

  return actualLastMsgIdx >= totalMessages - 1;
}

// ---------------------------------------------------------------------------
// Main grouping function
// ---------------------------------------------------------------------------

/**
 * Group a flat array of StreamMessages into conversation turns.
 * Each turn starts with a user_prompt and collects all following
 * assistant messages until the next user_prompt, system, or result.
 *
 * Partial blocks are assembled per-turn from stream_event messages that
 * fall within that turn's scope, so adding a new turn never affects
 * previous turns' rendering.
 */
export function groupIntoTurns(
  messages: Array<{ originalIndex: number; message: StreamMessage }>,
): TurnGroup[] {
  // Find indices where user_prompts occur — these define turn boundaries
  const userPromptIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].message.type === "user_prompt") {
      userPromptIndices.push(i);
    }
  }

  if (userPromptIndices.length === 0) return [];

  const turns: TurnGroup[] = [];

  for (let t = 0; t < userPromptIndices.length; t++) {
    const startIdx = userPromptIndices[t];
    // This turn's range: from its user_prompt up to (but not including) the next one
    const endIdx = t < userPromptIndices.length - 1 ? userPromptIndices[t + 1] : messages.length;

    const turnMessages = messages.slice(startIdx, endIdx);

    // Collect stream_event partials scoped to this turn only
    const streamEvents = turnMessages
      .filter(m => m.message.type === "stream_event")
      .map(m => m.message);

    // Collect assembled assistant messages for this turn
    const assistantMessages = turnMessages
      .filter(m => m.message.type === "assistant")
      .map(m => m.message);

    turns.push({
      turnIndex: t,
      userInput: turnMessages[0].message as StreamMessage & { type: "user_prompt" },
      assistantMessages,
      toolsUsed: extractTools(assistantMessages),
      hasThinking: hasThinking(assistantMessages),
      textContent: extractText(assistantMessages),
      isStreaming: detectStreaming(assistantMessages, messages.length, startIdx),
      assistantBlocks: extractBlocksForTurn(assistantMessages, streamEvents),
    });
  }

  return turns;
}
