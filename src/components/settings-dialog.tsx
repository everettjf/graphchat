import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Check,
  Copy,
  Cpu,
  ExternalLink,
  KeyRound,
  Laptop,
  LoaderCircle,
  LogIn,
  LogOut,
  Server,
  ShieldCheck,
} from "lucide-react";
import type { CodexAuthStatus, ProviderSettings } from "@shared/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input, Label } from "./ui/field";
import { useWorkspace } from "@/store/workspace";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useI18n, type TranslationKey } from "@/i18n";

const providers = [
  {
    id: "openai-codex",
    label: null,
    description: "settings.chatgptDescription",
    icon: BadgeCheck,
  },
  {
    id: "openai",
    label: null,
    description: "settings.openaiDescription",
    icon: Cpu,
  },
  {
    id: "openrouter",
    label: null,
    description: "settings.openrouterDescription",
    icon: Server,
  },
  {
    id: "ollama",
    label: null,
    description: "settings.ollamaDescription",
    icon: Laptop,
  },
  {
    id: "custom",
    label: "settings.custom",
    description: "settings.customDescription",
    icon: ExternalLink,
  },
] as const;

const defaultModels: Record<ProviderSettings["provider"], string> = {
  demo: "graphchat-guide",
  "openai-codex": "gpt-5.4-mini",
  openai: "gpt-5.4-mini",
  openrouter: "openai/gpt-5.4-mini",
  ollama: "qwen3.5:4b",
  custom: "your-model",
};

export function SettingsDialog({
  settings,
  onSaved,
}: {
  settings: ProviderSettings;
  onSaved: (settings: ProviderSettings) => void;
}) {
  const { t } = useI18n();
  const { settingsOpen, setSettingsOpen } = useWorkspace();
  const [draft, setDraft] = useState(settings);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [codexAuth, setCodexAuth] = useState<CodexAuthStatus>({
    state: "signed_out",
  });
  const [authBusy, setAuthBusy] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaError, setOllamaError] = useState("");

  useEffect(() => setDraft(settings), [settings]);

  useEffect(() => {
    if (!settingsOpen || draft.provider !== "ollama") return;
    let active = true;
    setOllamaError("");
    void api
      .ollamaModels()
      .then(({ models }) => {
        if (!active) return;
        setOllamaModels(models);
        if (models.length && !models.includes(draft.model)) {
          setDraft((current) => ({ ...current, model: models[0] }));
        }
      })
      .catch((error) => {
        if (!active) return;
        setOllamaModels([]);
        setOllamaError(
          error instanceof Error ? error.message : "Unable to connect to Ollama.",
        );
      });
    return () => {
      active = false;
    };
  }, [draft.model, draft.provider, settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    let active = true;
    const refresh = async () => {
      try {
        const status = await api.codexAuthStatus();
        if (active) setCodexAuth(status);
      } catch {
        if (active) {
          setCodexAuth({
            state: "error",
            message: t("settings.authReadFailed"),
          });
        }
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 1_800);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [settingsOpen, t]);

  const startCodexLogin = async () => {
    setAuthBusy(true);
    setError("");
    try {
      setCodexAuth(await api.startCodexLogin());
    } catch (loginError) {
      setCodexAuth({
        state: "error",
        message:
          loginError instanceof Error
            ? loginError.message
            : t("settings.authStartFailed"),
      });
    } finally {
      setAuthBusy(false);
    }
  };

  const logoutCodex = async () => {
    setAuthBusy(true);
    try {
      setCodexAuth(await api.logoutCodex());
    } finally {
      setAuthBusy(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const saved = await api.saveSettings({ ...draft, apiKey: apiKey || undefined });
      onSaved(saved);
      setApiKey("");
      setSettingsOpen(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t("settings.saveFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="w-[min(94vw,680px)]">
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription>{t("settings.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {providers.map((provider) => {
            const Icon = provider.icon;
            const active = draft.provider === provider.id;
            return (
              <button
                key={provider.id}
                className={cn(
                  "relative rounded-xl border p-3 text-left transition",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] ring-2 ring-[var(--accent-ring)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]",
                )}
                onClick={() =>
                  setDraft({
                    provider: provider.id,
                    model: defaultModels[provider.id],
                    baseUrl: provider.id === "ollama" ? "http://127.0.0.1:11434/v1" : "",
                    hasApiKey:
                      provider.id === settings.provider &&
                      provider.id !== "openai-codex" &&
                      provider.id !== "ollama"
                        ? settings.hasApiKey
                        : false,
                  })
                }
              >
                <Icon className={cn("mb-2 size-4", active ? "text-[var(--accent)]" : "text-[var(--muted-light)]")} />
                <span className="block text-[11px] font-semibold text-[var(--ink)]">
                  {provider.label
                    ? t(provider.label as TranslationKey)
                    : provider.id === "openai-codex"
                      ? "ChatGPT"
                      : provider.id === "openrouter"
                        ? "OpenRouter"
                        : provider.id === "ollama"
                          ? "Ollama"
                          : "OpenAI"}
                </span>
                <span className="mt-1 hidden text-[9px] leading-4 text-[var(--muted-light)] sm:block">
                  {t(provider.description as TranslationKey)}
                </span>
                {active && <Check className="absolute right-2.5 top-2.5 size-3.5 text-[var(--accent)]" />}
              </button>
            );
          })}
        </div>

        {draft.provider === "openai-codex" && (
          <CodexLoginPanel
            status={codexAuth}
            busy={authBusy}
            onLogin={() => void startCodexLogin()}
            onLogout={() => void logoutCodex()}
          />
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="model">{t("settings.modelId")}</Label>
            <Input
              id="model"
              value={draft.model}
              onChange={(event) => setDraft({ ...draft, model: event.target.value })}
              list={draft.provider === "ollama" ? "ollama-models" : undefined}
            />
            {draft.provider === "ollama" && (
              <>
                <datalist id="ollama-models">
                  {ollamaModels.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
                <p className="mt-1.5 text-[10px] text-[var(--muted-light)]">
                  {ollamaError ||
                    (ollamaModels.length
                      ? `${ollamaModels.length} local model${ollamaModels.length === 1 ? "" : "s"} available`
                      : "Checking local Ollama models…")}
                </p>
              </>
            )}
          </div>
          {(draft.provider === "ollama" || draft.provider === "custom") && (
            <div>
              <Label htmlFor="base-url">Base URL</Label>
              <Input
                id="base-url"
                value={draft.baseUrl}
                onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
                placeholder="http://127.0.0.1:11434/v1"
              />
            </div>
          )}
          {draft.provider !== "openai-codex" &&
            draft.provider !== "ollama" && (
            <div className={cn(draft.provider !== "custom" && "sm:col-span-1")}>
              <Label htmlFor="api-key">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="size-3" /> API Key
                </span>
              </Label>
              <Input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  settings.hasApiKey
                    ? t("settings.keySaved")
                    : t("settings.keySession")
                }
                autoComplete="off"
              />
            </div>
          )}
        </div>

        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] p-4 text-xs leading-5 text-[var(--accent-fg)]">
          <strong className="mb-1 flex items-center gap-1.5 text-[11px] text-[var(--accent-fg)]">
            <ShieldCheck className="size-3.5" /> {t("settings.localFirst")}
          </strong>
          {t("settings.localFirstBody")}
        </div>

        {error && <p className="mt-3 text-xs text-[var(--danger)]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setSettingsOpen(false)}>
            {t("settings.cancel")}
          </Button>
          <Button
            onClick={() => void save()}
            disabled={
              saving ||
              !draft.model.trim() ||
              (draft.provider === "openai-codex" && codexAuth.state !== "authenticated")
            }
          >
            {saving ? t("settings.saving") : t("settings.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CodexLoginPanel({
  status,
  busy,
  onLogin,
  onLogout,
}: {
  status: CodexAuthStatus;
  busy: boolean;
  onLogin: () => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-xs)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ink)]">
            <BadgeCheck className="size-4 text-[var(--accent)]" />
            {t("settings.subscription")}
          </div>
          <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">
            {t("settings.subscriptionBody")}
          </p>
        </div>
        {status.state === "authenticated" ? (
          <Button variant="ghost" size="sm" onClick={onLogout} disabled={busy}>
            <LogOut className="size-3.5" /> {t("settings.signOut")}
          </Button>
        ) : (
          <Button size="sm" onClick={onLogin} disabled={busy || status.state === "pending"}>
            {busy || status.state === "starting" ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <LogIn className="size-3.5" />
            )}
            {status.state === "pending"
              ? t("settings.waiting")
              : t("settings.signIn")}
          </Button>
        )}
      </div>

      {status.state === "authenticated" && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--accent-soft)] px-3 py-2.5 text-[11px] font-medium text-[var(--accent-fg)]">
          <Check className="size-3.5" />{" "}
          {t("settings.connected", { source: status.source })}
        </div>
      )}

      {status.state === "pending" && (
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--paper-deep)] p-3">
          <p className="text-[10px] leading-4 text-[var(--muted)]">{status.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-[var(--ink)] px-3 py-2 font-mono text-sm font-bold tracking-[0.18em] text-[var(--accent-contrast)]">
              {status.userCode}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(status.userCode)}
            >
              <Copy className="size-3.5" /> {t("settings.copy")}
            </Button>
            <a
              href={status.verificationUri}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-[11px] font-semibold text-[var(--accent-contrast)] hover:bg-[var(--accent-strong)]"
            >
              {t("settings.openLogin")} <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      )}

      {status.state === "error" && (
        <div className="mt-3 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2.5 text-[11px] leading-4 text-[var(--danger)]">
          {status.message}
        </div>
      )}
    </div>
  );
}
