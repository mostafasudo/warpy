import { create } from "zustand"

type EndpointUiState = {
  page: number
  pageSize: number
  editorOpen: boolean
  editingId: string | null
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  openCreate: () => void
  openEdit: (id: string) => void
  closeEditor: () => void
}

export const useEndpointsUiStore = create<EndpointUiState>((set) => ({
  page: 1,
  pageSize: 5,
  editorOpen: false,
  editingId: null,
  setPage: (page) => set({ page }),
  setPageSize: (pageSize) => set({ pageSize }),
  openCreate: () => set({ editorOpen: true, editingId: null }),
  openEdit: (id) => set({ editorOpen: true, editingId: id }),
  closeEditor: () => set({ editorOpen: false, editingId: null })
}))

export const endpointsUiSelectors = {
  page: (state: EndpointUiState) => state.page,
  pageSize: (state: EndpointUiState) => state.pageSize,
  editorOpen: (state: EndpointUiState) => state.editorOpen,
  editingId: (state: EndpointUiState) => state.editingId,
  setPage: (state: EndpointUiState) => state.setPage,
  setPageSize: (state: EndpointUiState) => state.setPageSize,
  openCreate: (state: EndpointUiState) => state.openCreate,
  openEdit: (state: EndpointUiState) => state.openEdit,
  closeEditor: (state: EndpointUiState) => state.closeEditor
}
