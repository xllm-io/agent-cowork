import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

// ---------------------------------------------------------------------------
// ModelSelect — dropdown fed by getAvailableModels (custom list + settings.json).
// An empty value means "use the configured default model".
// ---------------------------------------------------------------------------

const DEFAULT_LABEL = "Default model";

export function ModelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (model: string) => void;
}) {
  const [models, setModels] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  // Refresh the list each time the menu opens so newly-saved models appear.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    window.electron
      .getAvailableModels()
      .then((r) => { if (!cancelled) setModels(r?.models ?? []); })
      .catch(() => { if (!cancelled) setModels([]); });
    return () => { cancelled = true; };
  }, [open]);

  const label = value.trim() || DEFAULT_LABEL;

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex h-8 min-w-0 shrink items-center gap-1.5 rounded-lg border border-ink-900/10 bg-surface px-2.5 text-[13px] text-ink-700 hover:border-ink-900/20 focus:border-accent focus:outline-none transition-colors"
          title={label}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 2a2 2 0 012 2v1a2 2 0 002 2h1a2 2 0 010 4h-1a2 2 0 00-2 2v1a2 2 0 01-4 0v-1a2 2 0 00-2-2H5a2 2 0 010-4h1a2 2 0 002-2V4a2 2 0 012-2z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={`min-w-0 truncate max-w-[160px] ${value.trim() ? "" : "text-muted"}`}>{label}</span>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 max-h-[280px] min-w-[220px] overflow-y-auto rounded-xl border border-ink-900/10 bg-surface p-1 shadow-elevated"
        >
          <ModelItem
            label={DEFAULT_LABEL}
            selected={!value.trim()}
            muted
            onSelect={() => onChange("")}
          />
          {models.length > 0 && <DropdownMenu.Separator className="my-1 h-px bg-ink-900/5" />}
          {models.map((m) => (
            <ModelItem
              key={m}
              label={m}
              selected={value.trim() === m}
              onSelect={() => onChange(m)}
            />
          ))}
          {models.length === 0 && (
            <div className="px-3 py-2 text-[12px] text-muted-light">
              No models configured. Add them in Settings.
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ModelItem({
  label,
  selected,
  muted,
  onSelect,
}: {
  label: string;
  selected: boolean;
  muted?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-tertiary ${muted ? "text-muted" : "text-ink-700"}`}
    >
      <span className="min-w-0 truncate">{label}</span>
      {selected && (
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </DropdownMenu.Item>
  );
}
