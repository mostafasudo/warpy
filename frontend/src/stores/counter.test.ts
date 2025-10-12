import { describe, it, afterEach } from "@jest/globals"

import { counterSelectors, useCounterStore } from "@/stores/counter"

afterEach(() => {
  useCounterStore.setState({ value: 0 })
})

describe("counter store", () => {
  it("increments and resets the value", () => {
    const { increment, reset } = useCounterStore.getState()

    expect(counterSelectors.value(useCounterStore.getState())).toBe(0)

    increment()
    expect(counterSelectors.value(useCounterStore.getState())).toBe(1)

    reset()
    expect(counterSelectors.value(useCounterStore.getState())).toBe(0)
  })
})

