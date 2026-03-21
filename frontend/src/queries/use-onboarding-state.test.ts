import { describe, expect, it, jest } from "@jest/globals"

jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn()
}))

jest.mock("@/api/client", () => ({
  apiClient: {
    getOnboardingState: jest.fn()
  }
}))

import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

import { onboardingStateQueryKey, useOnboardingStateQuery } from "./use-onboarding-state"

describe("useOnboardingStateQuery", () => {
  it("fetches onboarding state without retries", () => {
    const mockedUseQuery = useQuery as jest.Mock
    mockedUseQuery.mockReturnValue({ data: null })

    useOnboardingStateQuery()

    expect(useQuery).toHaveBeenCalledWith({
      queryKey: onboardingStateQueryKey,
      queryFn: apiClient.getOnboardingState,
      retry: false
    })
  })
})
