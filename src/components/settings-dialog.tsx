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

const providers = [
  { id: "demo", label: "本地演示", description: "无需密钥，立即体验完整交互", icon: Sparkles },
  {
    id: "openai-codex",
    label: "ChatGPT",
    description: "使用 ChatGPT 订阅登录 Codex",
    icon: BadgeCheck,
  },
  { id: "openai", label: "OpenAI", description: "通过 Pi 使用 OpenAI API", icon: Cpu },
  { id: "openrouter", label: "OpenRouter", description: "一个密钥连接多种模型", icon: Server },
  { id: "ollama", label: "Ollama", description: "模型和数据完全留在本机", icon: Laptop },
  { id: "custom", label: "自定义", description: "任何 OpenAI-compatible 服务", icon: ExternalLink },
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
          setCodexAuth({ state: "error", message: "无法读取 ChatGPT 登录状态。" });
        }
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 1_800);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [settingsOpen]);

  const startCodexLogin = async () => {
    setAuthBusy(true);
    setError("");
    try {
      setCodexAuth(await api.startCodexLogin());
    } catch (loginError) {
      setCodexAuth({
        state: "error",
        message: loginError instanceof Error ? loginError.message : "无法启动 ChatGPT 登录。",
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
      setError(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="w-[min(94vw,680px)]">
        <DialogHeader>
          <DialogTitle>模型与运行方式</DialogTitle>
          <DialogDescription>
            Pi agent harness 统一模型、工具循环与流式事件。API Key 只留在当前进程；ChatGPT OAuth
            凭据只保存在本机。
          </DialogDescription>
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
                <span className="block text-[11px] font-semibold text-[var(--ink)]">{provider.label}</span>
                <span className="mt-1 hidden text-[9px] leading-4 text-[var(--muted-light)] sm:block">
                  {provider.description}
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
            <Label htmlFor="model">模型 ID</Label>
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
                placeholder={settings.hasApiKey ? "已在当前进程中设置" : "仅保留到服务关闭"}
                autoComplete="off"
              />
            </div>
          )}
        </div>

        <div className="mt-5 rounded-2xl border border-[#d8e6db] bg-[#eff5f0] p-4 text-xs leading-5 text-[#496652]">
          <strong className="mb-1 flex items-center gap-1.5 text-[11px] text-[#36513e]">
            <ShieldCheck className="size-3.5" /> 本地优先说明
          </strong>
          对话和图谱保存在本地 SQLite。使用云模型或 ChatGPT
          订阅时，只有本次运行明确选中的上下文会发送给模型；使用 Ollama 时数据不会离开本机。
        </div>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setSettingsOpen(false)}>
            取消
          </Button>
          <Button
            onClick={() => void save()}
            disabled={
              saving ||
              !draft.model.trim() ||
              (draft.provider === "openai-codex" && codexAuth.state !== "authenticated")
            }
          >
            {saving ? "正在保存…" : "保存设置"}
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
  return (
    <div className="mt-5 rounded-2xl border border-[#d9d7e7] bg-[#f4f2fa] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#39344f]">
            <BadgeCheck className="size-4 text-[#6f63a6]" />
            使用 ChatGPT 订阅
          </div>
          <p className="mt-1 text-[10px] leading-4 text-[#716b85]">
            由 Pi 发起 OpenAI 设备码登录。Graph Chat 不会看到你的密码。
          </p>
        </div>
        {status.state === "authenticated" ? (
          <Button variant="ghost" size="sm" onClick={onLogout} disabled={busy}>
            <LogOut className="size-3.5" /> 退出登录
          </Button>
        ) : (
          <Button size="sm" onClick={onLogin} disabled={busy || status.state === "pending"}>
            {busy || status.state === "starting" ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <LogIn className="size-3.5" />
            )}
            {status.state === "pending" ? "等待确认" : "使用 ChatGPT 登录"}
          </Button>
        )}
      </div>

      {status.state === "authenticated" && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#cde2d3] bg-[#edf7ef] px-3 py-2.5 text-[11px] font-medium text-[#3f6c4c]">
          <Check className="size-3.5" /> 已连接 · {status.source}
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
              <Copy className="size-3.5" /> 复制
            </Button>
            <a
              href={status.verificationUri}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#6c60a0] px-3 text-[11px] font-semibold text-white hover:bg-[#5d528f]"
            >
              打开 OpenAI 登录页 <ExternalLink className="size-3" />
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
