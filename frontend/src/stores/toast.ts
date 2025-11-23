import { create } from "zustand"

type ToastVariant = "success" | "error"

type ToastItem = {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

type ToastState = {
  toasts: ToastItem[]
  addToast: (toast: Omit<ToastItem, "id">) => void
  removeToast: (id: string) => void
}

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = createId()
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }]
    }))
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((item) => item.id !== id)
      }))
    }, 3600)
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((item) => item.id !== id)
    }))
}))

export const toastSelectors = {
  toasts: (state: ToastState) => state.toasts,
  addToast: (state: ToastState) => state.addToast,
  removeToast: (state: ToastState) => state.removeToast
}
