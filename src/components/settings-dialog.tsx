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
  Sparkles,
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
    id: "demo",
    label: "settings.demo",
    description: "settings.demoDescription",
    icon: Sparkles,
  },
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
  ollama: "gpt-oss:20b",
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

  useEffect(() => setDraft(settings), [settings]);

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
                  "relative rounded-2xl border p-3 text-left transition",
                  active
                    ? "border-[#7db28d] bg-[#edf5ef] ring-2 ring-[#7db28d]/10"
                    : "border-[var(--border)] bg-white/55 hover:border-[#bfc1b9] hover:bg-white",
                )}
                onClick={() =>
                  setDraft({
                    provider: provider.id,
                    model: defaultModels[provider.id],
                    baseUrl: provider.id === "ollama" ? "http://127.0.0.1:11434/v1" : "",
                    hasApiKey:
                      provider.id === settings.provider &&
                      provider.id !== "demo" &&
                      provider.id !== "openai-codex" &&
                      provider.id !== "ollama"
                        ? settings.hasApiKey
                        : false,
                  })
                }
              >
                <Icon className={cn("mb-2 size-4", active ? "text-[#4b7c59]" : "text-[var(--muted-light)]")} />
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
                {active && <Check className="absolute right-2.5 top-2.5 size-3.5 text-[#4b7c59]" />}
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
              disabled={draft.provider === "demo"}
            />
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
          {draft.provider !== "demo" &&
            draft.provider !== "openai-codex" &&
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

        <div className="mt-5 rounded-2xl border border-[#d8e6db] bg-[#eff5f0] p-4 text-xs leading-5 text-[#496652]">
          <strong className="mb-1 flex items-center gap-1.5 text-[11px] text-[#36513e]">
            <ShieldCheck className="size-3.5" /> {t("settings.localFirst")}
          </strong>
          {t("settings.localFirstBody")}
        </div>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
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
    <div className="mt-5 rounded-2xl border border-[#d9d7e7] bg-[#f4f2fa] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#39344f]">
            <BadgeCheck className="size-4 text-[#6f63a6]" />
            {t("settings.subscription")}
          </div>
          <p className="mt-1 text-[10px] leading-4 text-[#716b85]">
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
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#cde2d3] bg-[#edf7ef] px-3 py-2.5 text-[11px] font-medium text-[#3f6c4c]">
          <Check className="size-3.5" />{" "}
          {t("settings.connected", { source: status.source })}
        </div>
      )}

      {status.state === "pending" && (
        <div className="mt-3 rounded-xl border border-[#d8d3eb] bg-white/70 p-3">
          <p className="text-[10px] leading-4 text-[#716b85]">{status.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-[#292538] px-3 py-2 font-mono text-sm font-bold tracking-[0.18em] text-white">
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
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#6c60a0] px-3 text-[11px] font-semibold text-white hover:bg-[#5d528f]"
            >
              {t("settings.openLogin")} <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      )}

      {status.state === "error" && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[11px] leading-4 text-red-700">
          {status.message}
        </div>
      )}
    </div>
  );
}
