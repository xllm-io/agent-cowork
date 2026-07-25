import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

// Tab definitions
type TabKey = "api" | "behavior" | "about";
const TABS: { key: TabKey; label: string; icon?: React.ReactNode }[] = [
  { key: "api", label: "API Config" },
  { key: "behavior", label: "Behavior" },
  { key: "about", label: "About" },
];

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("api");
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Behavior settings (local state only)
  const [autoScroll, setAutoScroll] = useState(true);
  const [maxVisibleTurns, setMaxVisibleTurns] = useState(3);

  useEffect(() => {
    // Load current config
    setLoading(true);
    window.electron.getApiConfig()
      .then((config) => {
        if (config) {
          setApiKey(config.apiKey);
          setBaseURL(config.baseURL);
          setModel(config.model);
        }
      })
      .catch((err) => {
        console.error("Failed to load API config:", err);
        setError("Failed to load configuration");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) { setError("API Key is required"); return; }
    if (!baseURL.trim()) { setError("Base URL is required"); return; }
    if (!model.trim()) { setError("Model is required"); return; }

    try { new URL(baseURL); } catch { setError("Invalid Base URL format"); return; }

    setError(null);
    setSaving(true);

    try {
      const result = await window.electron.saveApiConfig({
        apiKey: apiKey.trim(),
        baseURL: baseURL.trim(),
        model: model.trim(),
        apiType: "anthropic"
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1000);
      } else {
        setError(result.error || "Failed to save configuration");
      }
    } catch (err) {
      console.error("Failed to save API config:", err);
      setError("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBehavior = () => {
    // Save behavior settings via IPC or store
    console.log("Behavior settings saved:", { autoScroll, maxVisibleTurns });
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/20 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-ink-900/5 bg-surface p-6 shadow-elevated">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-ink-800">Settings</Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-full p-1.5 text-muted hover:bg-surface-tertiary hover:text-ink-700 transition-colors" aria-label="Close">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </Dialog.Close>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mb-5 bg-surface-secondary rounded-xl p-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.key
                    ? "bg-surface text-ink-800 shadow-sm"
                    : "text-muted hover:text-ink-600"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loading && activeTab === "api" ? (
            <div className="flex items-center justify-center py-8">
              <svg aria-hidden="true" className="w-6 h-6 animate-spin text-accent" viewBox="0 0 100 101" fill="none">
                <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor" opacity="0.3" />
                <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentColor" />
              </svg>
            </div>
          ) : (
            <div className="grid gap-4">
              {/* API Config tab */}
              {activeTab === "api" && (
                <>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted">Base URL</span>
                    <input
                      type="url"
                      className="rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                      placeholder="https://..."
                      value={baseURL}
                      onChange={(e) => setBaseURL(e.target.value)}
                      required
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted">API Key</span>
                    <input
                      type="string"
                      className="rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      required
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted">Model Name</span>
                    <input
                      type="text"
                      className="rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                      placeholder="claude-3-5-sonnet-20241022"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      required
                    />
                  </label>
                </>
              )}

              {/* Behavior tab */}
              {activeTab === "behavior" && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-ink-700">Auto-scroll to bottom</div>
                      <div className="text-xs text-muted">Automatically scroll when new messages arrive</div>
                    </div>
                    <button
                      onClick={() => setAutoScroll(!autoScroll)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoScroll ? "bg-accent" : "bg-surface-tertiary"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoScroll ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>

                  <label className="grid gap-1.5 mt-2">
                    <span className="text-xs font-medium text-muted">Max visible turns</span>
                    <select
                      value={maxVisibleTurns}
                      onChange={(e) => setMaxVisibleTurns(Number(e.target.value))}
                      className="rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                    >
                      {[1, 2, 3, 4, 5, 10].map((n) => (
                        <option key={n} value={n}>{n} turns</option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              {/* About tab */}
              {activeTab === "about" && (
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-medium text-ink-700">Open Claude Cowork</div>
                    <div className="text-xs text-muted">Version 1.0.0</div>
                  </div>
                  <p className="text-sm text-muted">
                    An AI-powered coding assistant built with Electron, React, and the Anthropic Claude Agent SDK.
                  </p>
                  <a
                    href="https://github.com/zhangjun5421/Open-Claude-Cowork"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-accent hover:text-accent-hover transition-colors"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    View on GitHub
                  </a>
                </div>
              )}

              {/* Status messages */}
              {error && (
                <div className="rounded-xl border border-error/20 bg-error-light px-4 py-2.5 text-sm text-error">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-xl border border-success/20 bg-success-light px-4 py-2.5 text-sm text-success">
                  Settings saved successfully!
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 pt-2">
                <Dialog.Close asChild>
                  <button
                    className="flex-1 rounded-xl border border-ink-900/10 bg-surface px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-soft hover:bg-accent-hover transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={activeTab === "api" ? handleSave : handleSaveBehavior}
                  disabled={saving}
                >
                  {saving ? (
                    <svg aria-hidden="true" className="mx-auto w-5 h-5 animate-spin" viewBox="0 0 100 101" fill="none">
                      <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor" opacity="0.3" />
                      <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentColor" />
                    </svg>
                  ) : "Save"}
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
