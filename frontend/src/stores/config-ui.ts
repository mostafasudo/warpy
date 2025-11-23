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
  setBaseForm: (payload: Partial<BaseFormState>) => void
  resetBaseForm: () => void
  setHeaderForm: (payload: Partial<HeaderFormState>) => void
  resetHeaderForm: () => void
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
  setBaseForm: (payload) =>
    set((state) => ({
      baseForm: { ...state.baseForm, ...payload }
    })),
  resetBaseForm: () => set({ baseForm: defaultBaseForm }),
  setHeaderForm: (payload) =>
    set((state) => ({
      headerForm: { ...state.headerForm, ...payload }
    })),
  resetHeaderForm: () => set({ headerForm: defaultHeaderForm })
}))

export const configSelectors = {
  baseForm: (state: ConfigUiState) => state.baseForm,
  headerForm: (state: ConfigUiState) => state.headerForm,
  setBaseForm: (state: ConfigUiState) => state.setBaseForm,
  resetBaseForm: (state: ConfigUiState) => state.resetBaseForm,
  setHeaderForm: (state: ConfigUiState) => state.setHeaderForm,
  resetHeaderForm: (state: ConfigUiState) => state.resetHeaderForm
}
