import { useCallback, useRef, useState } from "react";
import type { TurnGroup } from "../hooks/useTurns";
import { UserBubble } from "./UserBubble";
import { AssistantProse } from "./AssistantProse";
import { DecisionPanel } from "./DecisionPanel";
import type { PermissionRequest } from "../store/useAppStore";

// ---------------------------------------------------------------------------
// TurnBlock — groups user message + assistant response (inspired by LobsterAI)
// ---------------------------------------------------------------------------

export function TurnBlock({
  turn,
  isLastTurn = false,
  isSessionRunning = false,
  permissionRequests = [],
  onPermissionResult = () => {},
}: {
  turn: TurnGroup;
  isLastTurn?: boolean;
  isSessionRunning?: boolean;
  permissionRequests?: PermissionRequest[];
  onPermissionResult?: (toolUseId: string) => void;
}) {
  const [isReEditing, setIsReEditing] = useState(false);
  const [reEditText, setReEditText] = useState(turn.userInput.prompt);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Determine if this turn is the active streaming turn
  const isStreaming = isLastTurn && isSessionRunning;

  // Find pending AskUserQuestion that matches a tool_use block in this turn
  const activePermissionRequest = permissionRequests.find(pr =>
    pr.toolName === "AskUserQuestion" &&
    turn.assistantBlocks.some(b => b.type === "tool_use" && b.name === pr.toolName)
  );

  const handleReEdit = useCallback(() => {
    setIsReEditing(true);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }, 50);
  }, []);

  const handleReEditSave = useCallback(() => {
    setIsReEditing(false);
    console.log("Re-edit:", reEditText);
  }, [reEditText]);

  const handleReEditCancel = useCallback(() => {
    setIsReEditing(false);
    setReEditText(turn.userInput.prompt);
  }, [turn.userInput.prompt]);

  return (
    <div className="py-3" data-turn-index={turn.turnIndex}>
      {/* User message */}
      {isReEditing ? (
        <div className="mb-3 ml-auto max-w-[85%]">
          <textarea
            ref={textareaRef}
            value={reEditText}
            onChange={(e) => setReEditText(e.target.value)}
            className="w-full rounded-xl border border-accent/30 bg-surface px-4 py-2.5 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none shadow-subtle"
            rows={3}
          />
          <div className="flex items-center gap-2 mt-2 justify-end">
            <button
              onClick={handleReEditCancel}
              className="text-xs text-muted hover:text-ink-600 px-2 py-1 rounded hover:bg-surface-tertiary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleReEditSave}
              className="text-xs text-white bg-accent hover:bg-accent-hover px-3 py-1 rounded-lg transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        <UserBubble
          prompt={turn.userInput.prompt}
          onReEdit={handleReEdit}
        />
      )}

      {/* Assistant response section */}
      {(turn.assistantBlocks.length > 0 || activePermissionRequest) && (
        <div className="mt-2">
          {activePermissionRequest && (
            <div className="my-4">
              <DecisionPanel
                request={activePermissionRequest}
                onSubmit={(_result) => {
                  onPermissionResult(activePermissionRequest.toolUseId);
                }}
              />
            </div>
          )}
          {turn.assistantBlocks.length > 0 && (
            <AssistantProse
              blocks={turn.assistantBlocks}
              isStreaming={isStreaming}
              onFork={() => {
                console.log("Fork from turn", turn.turnIndex);
              }}
            />
          )}
        </div>
      )}

      {/* Fallback: if this turn has assistant content signals but nothing to display yet, show a placeholder */}
      {turn.assistantBlocks.length === 0 && !activePermissionRequest && (turn.hasThinking || turn.textContent.length > 0 || isStreaming) && (
        <div className="my-2 text-sm text-muted italic">
          {isStreaming ? "Thinking..." : "Assistant is responding..."}
        </div>
      )}
    </div>
  );
}
