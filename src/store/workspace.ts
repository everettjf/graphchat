import { create } from "zustand";

type ComposerMode = "answer" | "explore" | "synthesize";

type WorkspaceState = {
  selectedNodeId: string | null;
  referenceNodeIds: string[];
  search: string;
  selectedText: string | null;
  composerOpen: boolean;
  settingsOpen: boolean;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  mode: ComposerMode;
  selectNode: (id: string | null) => void;
  toggleReference: (id: string) => void;
  clearReferences: () => void;
  setSearch: (value: string) => void;
  openComposer: (selectedText?: string | null) => void;
  closeComposer: () => void;
  setSettingsOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setMode: (mode: ComposerMode) => void;
};

export const useWorkspace = create<WorkspaceState>((set) => ({
  selectedNodeId: "root-rag",
  referenceNodeIds: [],
  search: "",
  selectedText: null,
  composerOpen: false,
  settingsOpen: false,
  sidebarOpen: false,
  inspectorOpen: true,
  mode: "answer",
  selectNode: (id) => set({ selectedNodeId: id }),
  toggleReference: (id) =>
    set((state) => ({
      referenceNodeIds: state.referenceNodeIds.includes(id)
        ? state.referenceNodeIds.filter((nodeId) => nodeId !== id)
        : [...state.referenceNodeIds, id],
    })),
  clearReferences: () => set({ referenceNodeIds: [] }),
  setSearch: (search) => set({ search }),
  openComposer: (selectedText = null) => set({ composerOpen: true, selectedText }),
  closeComposer: () => set({ composerOpen: false, selectedText: null }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setMode: (mode) => set({ mode }),
}));
