/// <reference types="@testing-library/jest-dom" />
import { beforeEach, describe, expect, it, jest } from "@jest/globals"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ApiKeyPanel } from "./api-key-panel"
import { useApiKeyQuery } from "@/queries/use-api-key"
import { useRevealApiKey } from "@/mutations/use-reveal-api-key"
import { useRotateApiKey } from "@/mutations/use-rotate-api-key"

jest.mock("@/stores/toast", () => {
  const addToast = jest.fn()
  type ToastState = { addToast: jest.Mock }
  const toastState: ToastState = { addToast }
  return {
    useToastStore: <T,>(selector: (state: ToastState) => T) => selector(toastState),
    toastSelectors: {
      addToast: (state: ToastState) => state.addToast,
    },
  }
})

jest.mock("@/queries/use-api-key", () => ({
  useApiKeyQuery: jest.fn(),
}))

jest.mock("@/mutations/use-reveal-api-key", () => ({
  useRevealApiKey: jest.fn(),
}))

jest.mock("@/mutations/use-rotate-api-key", () => ({
  useRotateApiKey: jest.fn(),
}))

const mockedUseApiKeyQuery = useApiKeyQuery as unknown as jest.Mock
const mockedUseRevealApiKey = useRevealApiKey as unknown as jest.Mock
const mockedUseRotateApiKey = useRotateApiKey as unknown as jest.Mock

describe("ApiKeyPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseApiKeyQuery.mockReturnValue({
      data: { apiKeyLast4: "1234", createdAt: "2026-04-22T00:00:00Z", rotatedAt: null },
      isPending: false,
    })
    mockedUseRevealApiKey.mockReturnValue({
      mutateAsync: jest.fn(async () => ({
        apiKey: "wrk_key_1234",
        apiKeyLast4: "1234",
        createdAt: "2026-04-22T00:00:00Z",
        rotatedAt: null,
      })),
      isPending: false,
    })
    mockedUseRotateApiKey.mockReturnValue({
      mutateAsync: jest.fn(async () => ({
        apiKey: "wrk_key_5678",
        apiKeyLast4: "5678",
        createdAt: "2026-04-22T00:00:00Z",
        rotatedAt: "2026-04-22T01:00:00Z",
      })),
      isPending: false,
    })
  })

  it("renders the masked api key", () => {
    render(<ApiKeyPanel />)
    expect(screen.getByText("Use this key to control Warpy via agents.")).not.toBeNull()
    expect(screen.getByDisplayValue("••••••••••••1234")).not.toBeNull()
    expect(screen.queryByText("Public agent manual")).toBeNull()
    expect(screen.queryByRole("button", { name: /copy prompt/i })).toBeNull()
  })

  it("copies the current key", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const writeText = jest.fn((value: string) => Promise.resolve(value))
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    render(<ApiKeyPanel />)
    await user.click(screen.getByRole("button", { name: /copy current key/i }))

    await waitFor(() => {
      expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith("wrk_key_1234")
    })
  })

  it("shows the rotated key after rotation", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    render(<ApiKeyPanel />)
    await user.click(screen.getByRole("button", { name: /rotate key/i }))

    expect(await screen.findByDisplayValue("wrk_key_5678")).not.toBeNull()
  })
})
