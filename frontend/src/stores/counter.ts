import { create } from "zustand"

type CounterState = {
  value: number
}

type CounterActions = {
  increment: () => void
  reset: () => void
}

type CounterStore = CounterState & CounterActions

export const useCounterStore = create<CounterStore>((set) => ({
  value: 0,
  increment: () => set((state) => ({ value: state.value + 1 })),
  reset: () => set({ value: 0 })
}))

export const counterSelectors = {
  value: (state: CounterStore) => state.value,
  increment: (state: CounterStore) => state.increment,
  reset: (state: CounterStore) => state.reset
}
