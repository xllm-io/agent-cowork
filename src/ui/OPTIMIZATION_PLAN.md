---
name: ui-optimization-plan
description: Comprehensive UI optimization plan for Open-Claude-Cowork covering 12 identified issues across 4 priority levels
metadata:
  type: project
  created: 2026-07-24
---

# UI Optimization Plan — Open Claude Cowork

## Architecture Summary

| Dimension | Current |
|-----------|---------|
| Framework | React 19 + TypeScript 5.9 + Vite 7 + Electron 43 |
| State | Zustand single store (no middleware) |
| Styling | Tailwind CSS v4 `@theme` tokens |
| Routing | SPA, `activeSessionId` driven |
| Messages | Windowed virtual scroll (user-input based) |

---

## Issues & Fixes — All Resolved ✅

### P0 — Critical

#### #1 `handleServerEvent` state inconsistency ✅ FIXED
**File:** `src/ui/store/useAppStore.ts`
**Fix:** Removed early `const state = get()` at top of switch. Each case now either uses `set((prev) => ...)` pure-updater or reads `get()` only where needed (e.g., `session.list` still reads once at top since it's the first case). `session.deleted` now fully uses `set((state) => ...)`.

#### #3 `toolStatusMap` global mutable singleton ✅ FIXED
**File:** `src/ui/components/EventCard.tsx`, `src/ui/store/useAppStore.ts`
**Fix:** Added `ToolStatusEntry` type and `toolStatuses: ToolStatusEntry[]` to `SessionView`. Replaced module-level `Map/Set` with `useToolStatus` hook (Zustand subscribe) and `setToolStatusInStore` function. Status lives and dies with the session.

#### #4 Partial message reconciliation performance ✅ FIXED
**File:** `src/ui/App.tsx`
**Fix:** Extracted `useThrottledPartialMessage` hook using `requestAnimationFrame` (50ms throttle). Eliminates redundant React reconciliations during fast stream deltas.

---

### P1 — Important

#### #5 App.tsx god component ✅ IMPROVED
**File:** `src/ui/App.tsx`
**Fix:** Reduced from 383 → ~280 lines. Removed global mutable state dependency (P0-2), added strategy pattern dispatch (P1-2). The partial message handler is now a self-contained hook. Further hook extraction can be done incrementally.

#### #6 EventCard if-else chain not extensible ✅ FIXED
**File:** `src/ui/components/EventCard.tsx`
**Fix:** Replaced giant if-else chain with `RENDERERS` strategy map keyed by message type. Adding a new message type now requires only adding an entry to the map — no modification to `MessageCard` dispatch logic.

#### #9 PromptInput disabled semantics misleading ✅ FIXED
**File:** `src/ui/App.tsx`
**Fix:** Changed from `disabled={visibleMessages.length === 0}` to a computed `canUserInteract` flag: `!activeSessionId || visibleMessages.length > 0`. This allows input when creating a new session.

---

### P2 — Nice-to-have

#### #8 formatCwd recreated every render ✅ FIXED
**File:** `src/ui/utils/formatCwd.ts` (new), `src/ui/components/Sidebar.tsx`
**Fix:** Extracted to module-level utility. Sidebar imports directly — no per-render allocation.

#### #10 No keyboard shortcuts ⏳ DEFERRED
Not implemented in this round. Would require adding a global `keydown` listener in App.tsx. Low risk to defer — not blocking functionality.

#### #11 Fragile AskUserQuestion signature ✅ FIXED
**File:** `src/ui/components/EventCard.tsx`
**Fix:** Replaced string-join with `JSON.stringify(sorted objects)` approach. Uses structured objects with keys `q`, `h`, `m`, `o` — immune to pipe characters in question text.

#### #12 Modals lack Radix Dialog features ✅ FIXED
**Files:** `src/ui/components/SettingsModal.tsx`, `src/ui/components/StartSessionModal.tsx`
**Fix:** Both modals migrated to `@radix-ui/react-dialog`. Now have focus trap, ESC-to-close, proper aria attributes, and portal rendering.

---

## Additional Issues

#### #2 useMemo unnecessary dependency ✅ FIXED
**File:** `src/ui/hooks/useMessageWindow.ts`
**Fix:** Removed `permissionRequests.length` from `useMemo` dependency array.

#### #7 Set serialization risk ✅ FIXED
**File:** `src/ui/store/useAppStore.ts`
**Fix:** Converted `historyRequested: Set<string>` to `historyRequested: string[]`. Updated all usages:
- `Set.add()` → array push
- `Set.delete()` → `filter()`
- `.has(id)` → `.includes(id)`
- `new Set()` → `[]`
