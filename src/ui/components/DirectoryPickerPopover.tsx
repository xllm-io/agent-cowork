import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// DirectoryPickerPopover — recent dirs + search + browse
// ---------------------------------------------------------------------------

type DirItem = {
  path: string;
  label: string; // human-readable basename or last-2 segments
};

function dirLabel(fullPath: string): string {
  const parts = fullPath.split("/").filter(Boolean);
  return parts.length > 1 ? parts.slice(-2).join("/") : parts[0] ?? fullPath;
}

export function DirectoryPickerPopover({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (path: string) => void;
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [recentDirs, setRecentDirs] = useState<DirItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch recent CWDs from backend
  useEffect(() => {
    setLoading(true);
    window.electron
      .getRecentCwds(8)
      .then((raw) => {
        if (!raw || !Array.isArray(raw)) return setRecentDirs([]);
        const seen = new Set<string>();
        const deduped: DirItem[] = [];
        for (const p of raw) {
          if (!p || typeof p !== "string") continue;
          if (seen.has(p)) continue;
          seen.add(p);
          if (p === value) continue; // skip currently selected
          deduped.push({ path: p, label: dirLabel(p) });
        }
        setRecentDirs(deduped);
      })
      .catch(() => setRecentDirs([]))
      .finally(() => setLoading(false));
  }, [value]);

  // Focus search on mount
  useEffect(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  // Close on outside click / escape
  useEffect(() => {
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === "Escape") {
        onClose();
        return;
      }
      if (e instanceof MouseEvent) {
        if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
          onClose();
        }
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", handler);
    };
  }, [onClose]);

  // Filter by search query
  const filtered = recentDirs.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return d.label.toLowerCase().includes(q) || d.path.toLowerCase().includes(q);
  });

  const handleSelect = useCallback(
    (dir: DirItem) => {
      onChange(dir.path);
      onClose();
    },
    [onChange, onClose],
  );

  const handleBrowse = useCallback(async () => {
    try {
      const result = await window.electron.selectDirectory();
      if (result) {
        onChange(result);
        onClose();
      }
    } catch {
      // silently ignore — user may have cancelled
    }
  }, [onChange, onClose]);

  return (
    <div
      ref={popoverRef}
      className="absolute top-full left-0 z-50 mt-2 w-[320px] rounded-xl border border-ink-900/10 bg-surface shadow-elevated overflow-hidden animate-fade-in-up"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-900/5">
        <span className="text-xs font-medium text-ink-600">Working Directory</span>
        <button
          onClick={handleBrowse}
          className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            <path d="M12 11v6M9 14h6" strokeLinecap="round" />
          </svg>
          Browse
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-ink-900/5">
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 shrink-0 text-muted-light"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
        </svg>
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search history..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-sm text-ink-700 placeholder:text-muted-light focus:outline-none"
        />
      </div>

      {/* Directory list */}
      <div className="max-h-[240px] overflow-y-auto py-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <svg className="w-4 h-4 animate-spin text-muted-light" viewBox="0 0 100 101" fill="none">
              <path
                d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                fill="currentColor"
                opacity="0.3"
              />
              <path
                d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                fill="currentColor"
              />
            </svg>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center">
            <svg
              viewBox="0 0 24 24"
              className="mx-auto h-8 w-8 text-muted-light/50"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            >
              <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <p className="mt-2 text-xs text-muted-light">
              {searchQuery ? "No matching directories" : "No recent directories"}
            </p>
            {!searchQuery && (
              <button
                onClick={handleBrowse}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-ink-900/10 bg-surface px-3 py-1.5 text-xs text-accent hover:bg-surface-tertiary transition-colors"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  <path d="M12 11v6M9 14h6" strokeLinecap="round" />
                </svg>
                Browse folder
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-px px-1">
            {filtered.map((dir) => {
              const isSelected = value === dir.path;
              return (
                <button
                  key={dir.path}
                  onClick={() => handleSelect(dir)}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-all duration-100 ${
                    isSelected
                      ? "bg-accent-subtle text-accent font-medium"
                      : "text-ink-700 hover:bg-surface-tertiary"
                  }`}
                >
                  {/* Folder icon */}
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-4 w-4 shrink-0 ${isSelected ? "text-accent" : "text-muted-light"}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="min-w-0 truncate">{dir.label}</span>
                  {isSelected && (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 shrink-0 ml-auto text-accent"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-ink-900/5 px-3 py-2">
        <button
          onClick={handleBrowse}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-ink-900/10 bg-surface py-2 text-xs font-medium text-ink-700 hover:border-accent/30 hover:text-accent hover:bg-surface-raised transition-all duration-150 active:scale-[0.98]"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Browse local folders
        </button>
      </div>
    </div>
  );
}
