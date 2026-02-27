import { create } from "zustand";

import type { ToolResponse } from "@/types";

type ToolUiState = {
  page: number;
  pageSize: number;
  editorOpen: boolean;
  editingId: string | null;
  editingTool: ToolResponse | null;
  search: string;
  searchDraft: string;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setSearch: (search: string) => void;
  setSearchDraft: (search: string) => void;
  openCreate: () => void;
  openEdit: (tool: ToolResponse) => void;
  closeEditor: () => void;
};

export const useToolsUiStore = create<ToolUiState>((set) => ({
  page: 1,
  pageSize: 5,
  editorOpen: false,
  editingId: null,
  editingTool: null,
  search: "",
  searchDraft: "",
  setPage: (page) => set({ page }),
  setPageSize: (pageSize) => set({ pageSize }),
  setSearch: (search) => set({ search, page: 1 }),
  setSearchDraft: (search) => set({ searchDraft: search }),
  openCreate: () =>
    set({ editorOpen: true, editingId: null, editingTool: null }),
  openEdit: (tool) =>
    set({
      editorOpen: true,
      editingId: tool.id,
      editingTool: tool,
    }),
  closeEditor: () =>
    set({ editorOpen: false, editingId: null, editingTool: null }),
}));

export const toolsUiSelectors = {
  page: (state: ToolUiState) => state.page,
  pageSize: (state: ToolUiState) => state.pageSize,
  editorOpen: (state: ToolUiState) => state.editorOpen,
  editingId: (state: ToolUiState) => state.editingId,
  editingTool: (state: ToolUiState) => state.editingTool,
  search: (state: ToolUiState) => state.search,
  searchDraft: (state: ToolUiState) => state.searchDraft,
  setPage: (state: ToolUiState) => state.setPage,
  setPageSize: (state: ToolUiState) => state.setPageSize,
  setSearch: (state: ToolUiState) => state.setSearch,
  setSearchDraft: (state: ToolUiState) => state.setSearchDraft,
  openCreate: (state: ToolUiState) => state.openCreate,
  openEdit: (state: ToolUiState) => state.openEdit,
  closeEditor: (state: ToolUiState) => state.closeEditor,
};
