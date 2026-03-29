import { create } from "zustand"

import type { StorageSource } from "@/types"

type BaseFormState = {
  envName: string
  url: string
  editingKey: string | null
}

type HeaderFormState = {
  name: string
  source: StorageSource
  key: string
  editingKey: string | null
}

type ConfigUiState = {
  baseForm: BaseFormState
  headerForm: HeaderFormState
  baseDialogOpen: boolean
  headerDialogOpen: boolean
  baseSubmitting: boolean
  headerSubmitting: boolean
  setBaseForm: (payload: Partial<BaseFormState>) => void
  resetBaseForm: () => void
  setHeaderForm: (payload: Partial<HeaderFormState>) => void
  resetHeaderForm: () => void
  setBaseDialogOpen: (open: boolean) => void
  setHeaderDialogOpen: (open: boolean) => void
  setBaseSubmitting: (submitting: boolean) => void
  setHeaderSubmitting: (submitting: boolean) => void
}

const defaultBaseForm: BaseFormState = {
  envName: "",
  url: "",
  editingKey: null
}

const defaultHeaderForm: HeaderFormState = {
  name: "",
  source: "localStorage",
  key: "",
  editingKey: null
}

export const useConfigUiStore = create<ConfigUiState>((set) => ({
  baseForm: defaultBaseForm,
  headerForm: defaultHeaderForm,
  baseDialogOpen: false,
  headerDialogOpen: false,
  baseSubmitting: false,
  headerSubmitting: false,
  setBaseForm: (payload) =>
    set((state) => ({
      baseForm: { ...state.baseForm, ...payload }
    })),
  resetBaseForm: () => set({ baseForm: defaultBaseForm }),
  setHeaderForm: (payload) =>
    set((state) => ({
      headerForm: { ...state.headerForm, ...payload }
    })),
  resetHeaderForm: () => set({ headerForm: defaultHeaderForm }),
  setBaseDialogOpen: (open) => set({ baseDialogOpen: open }),
  setHeaderDialogOpen: (open) => set({ headerDialogOpen: open }),
  setBaseSubmitting: (submitting) => set({ baseSubmitting: submitting }),
  setHeaderSubmitting: (submitting) => set({ headerSubmitting: submitting })
}))

export const configSelectors = {
  baseForm: (state: ConfigUiState) => state.baseForm,
  headerForm: (state: ConfigUiState) => state.headerForm,
  baseDialogOpen: (state: ConfigUiState) => state.baseDialogOpen,
  headerDialogOpen: (state: ConfigUiState) => state.headerDialogOpen,
  baseSubmitting: (state: ConfigUiState) => state.baseSubmitting,
  headerSubmitting: (state: ConfigUiState) => state.headerSubmitting,
  setBaseForm: (state: ConfigUiState) => state.setBaseForm,
  resetBaseForm: (state: ConfigUiState) => state.resetBaseForm,
  setHeaderForm: (state: ConfigUiState) => state.setHeaderForm,
  resetHeaderForm: (state: ConfigUiState) => state.resetHeaderForm,
  setBaseDialogOpen: (state: ConfigUiState) => state.setBaseDialogOpen,
  setHeaderDialogOpen: (state: ConfigUiState) => state.setHeaderDialogOpen,
  setBaseSubmitting: (state: ConfigUiState) => state.setBaseSubmitting,
  setHeaderSubmitting: (state: ConfigUiState) => state.setHeaderSubmitting
}
