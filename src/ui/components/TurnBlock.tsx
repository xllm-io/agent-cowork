import { useCallback, useRef, useState } from "react";
import type { TurnGroup } from "../hooks/useTurns";
import { UserBubble } from "./UserBubble";
import { AssistantProse } from "./AssistantProse";

// ---------------------------------------------------------------------------
// TurnBlock — groups user message + assistant response (inspired by LobsterAI)
// ---------------------------------------------------------------------------

export function TurnBlock({
  turn,
  isLastTurn = false,
  isSessionRunning = false,
}: {
  turn: TurnGroup;
  isLastTurn?: boolean;
  isSessionRunning?: boolean;
}) {
  const [isReEditing, setIsReEditing] = useState(false);
  const [reEditText, setReEditText] = useState(turn.userInput.prompt);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Determine if this turn is the active streaming turn
  const isStreaming = isLastTurn && isSessionRunning;

  const handleReEdit = useCallback(() => {
    setIsReEditing(true);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }, 50);
  }, []);

  const handleReEditSave = useCallback(() => {
    setIsReEditing(false);
    // TODO: send re-edited prompt via IPC
    console.log("Re-edit:", reEditText);
  }, [reEditText]);

  const handleReEditCancel = useCallback(() => {
    setIsReEditing(false);
    setReEditText(turn.userInput.prompt);
  }, [turn.userInput.prompt]);

  return (
    <div className="py-1" data-turn-index={turn.turnIndex}>
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

      {/* Assistant response */}
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
  );
}
