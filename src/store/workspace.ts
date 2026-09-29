import { create } from "zustand";

type ComposerMode = "answer" | "explore" | "synthesize";

/** Context carried into the next question from outside the current graph. */
export type ExternalReferenceChip =
  | { kind: "node"; nodeId: string; title: string; graphTitle: string }
  | { kind: "pi-turn"; sessionId: string; turnId: string; title: string; sessionName: string };

const sameReference = (a: ExternalReferenceChip, b: ExternalReferenceChip) =>
  a.kind === "node" && b.kind === "node"
    ? a.nodeId === b.nodeId
    : a.kind === "pi-turn" && b.kind === "pi-turn"
      ? a.sessionId === b.sessionId && a.turnId === b.turnId
      : false;
const sidebarStartsOpen =
  typeof window === "undefined" || window.innerWidth >= 1024;

type WorkspaceState = {
  selectedNodeId: string | null;
  referenceNodeIds: string[];
  externalReferences: ExternalReferenceChip[];
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
  addExternalReference: (reference: ExternalReferenceChip) => void;
  removeExternalReference: (reference: ExternalReferenceChip) => void;
  clearExternalReferences: () => void;
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
  externalReferences: [],
  search: "",
  selectedText: null,
  composerOpen: false,
  settingsOpen: false,
  sidebarOpen: sidebarStartsOpen,
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
  addExternalReference: (reference) =>
    set((state) => ({
      externalReferences: state.externalReferences.some((existing) => sameReference(existing, reference))
        ? state.externalReferences
        : [...state.externalReferences, reference],
    })),
  removeExternalReference: (reference) =>
    set((state) => ({
      externalReferences: state.externalReferences.filter((existing) => !sameReference(existing, reference)),
    })),
  clearExternalReferences: () => set({ externalReferences: [] }),
  setSearch: (search) => set({ search }),
  openComposer: (selectedText = null) => set({ composerOpen: true, selectedText }),
  closeComposer: () => set({ composerOpen: false, selectedText: null }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setMode: (mode) => set({ mode }),
}));
