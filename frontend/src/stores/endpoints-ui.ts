import { create } from "zustand"

type EndpointUiState = {
  page: number
  pageSize: number
  editorOpen: boolean
  editingId: string | null
  search: string
  searchDraft: string
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  setSearch: (search: string) => void
  setSearchDraft: (search: string) => void
  openCreate: () => void
  openEdit: (id: string) => void
  closeEditor: () => void
}

export const useEndpointsUiStore = create<EndpointUiState>((set) => ({
  page: 1,
  pageSize: 5,
  editorOpen: false,
  editingId: null,
  search: "",
  searchDraft: "",
  setPage: (page) => set({ page }),
  setPageSize: (pageSize) => set({ pageSize }),
  setSearch: (search) => set({ search, page: 1 }),
  setSearchDraft: (search) => set({ searchDraft: search }),
  openCreate: () => set({ editorOpen: true, editingId: null }),
  openEdit: (id) => set({ editorOpen: true, editingId: id }),
  closeEditor: () => set({ editorOpen: false, editingId: null })
}))

export const endpointsUiSelectors = {
  page: (state: EndpointUiState) => state.page,
  pageSize: (state: EndpointUiState) => state.pageSize,
  editorOpen: (state: EndpointUiState) => state.editorOpen,
  editingId: (state: EndpointUiState) => state.editingId,
  search: (state: EndpointUiState) => state.search,
  searchDraft: (state: EndpointUiState) => state.searchDraft,
  setPage: (state: EndpointUiState) => state.setPage,
  setPageSize: (state: EndpointUiState) => state.setPageSize,
  setSearch: (state: EndpointUiState) => state.setSearch,
  setSearchDraft: (state: EndpointUiState) => state.setSearchDraft,
  openCreate: (state: EndpointUiState) => state.openCreate,
  openEdit: (state: EndpointUiState) => state.openEdit,
  closeEditor: (state: EndpointUiState) => state.closeEditor
}
