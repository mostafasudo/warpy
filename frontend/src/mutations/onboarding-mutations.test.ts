import { describe, expect, it, jest } from "@jest/globals"

const reactQueryMock = {
  useMutation: jest.fn(),
  useQueryClient: jest.fn()
}

jest.mock("@tanstack/react-query", () => reactQueryMock)

jest.mock("@/api/client", () => ({
  apiClient: {
    startOnboarding: jest.fn(),
    addOnboardingWebsite: jest.fn(),
    finalizeOnboarding: jest.fn()
  }
}))

import { apiClient } from "@/api/client"
import { useAddOnboardingWebsite } from "@/mutations/use-add-onboarding-website"
import { useFinalizeOnboarding } from "@/mutations/use-finalize-onboarding"
import { useStartOnboarding } from "@/mutations/use-start-onboarding"
import { agentQueryKey } from "@/queries/use-agent"
import { knowledgeBaseStatusQueryKey } from "@/queries/use-knowledge-base-status"
import { knowledgeWebsitesQueryKey } from "@/queries/use-knowledge-websites"
import { onboardingStateQueryKey } from "@/queries/use-onboarding-state"

type MutationOptions = {
  mutationFn: (payload?: unknown) => Promise<unknown>
  onSuccess?: (result: unknown) => void
}

describe("onboarding mutations", () => {
  it("updates onboarding and related caches", async () => {
    const queryClient = {
      setQueryData: jest.fn(),
      invalidateQueries: jest.fn()
    }
    reactQueryMock.useQueryClient.mockReturnValue(queryClient)
    reactQueryMock.useMutation.mockImplementation((...args: unknown[]) => {
      const [options] = args as [MutationOptions]
      return {
      mutateAsync: async (payload?: unknown) => {
        const result = await options.mutationFn(payload)
        options.onSuccess?.(result)
        return result
      }
    }})

    ;(apiClient.startOnboarding as jest.Mock).mockImplementation(async () => ({
      status: "in_progress",
      shouldShow: true,
      nextStep: "website"
    }))
    ;(apiClient.addOnboardingWebsite as jest.Mock).mockImplementation(async () => ({ id: "website-1" }))
    ;(apiClient.finalizeOnboarding as jest.Mock).mockImplementation(async () => ({ id: "agent-1" }))

    await useStartOnboarding().mutateAsync()
    expect(apiClient.startOnboarding).toHaveBeenCalled()
    expect(queryClient.setQueryData).toHaveBeenCalledWith(onboardingStateQueryKey, {
      status: "in_progress",
      shouldShow: true,
      nextStep: "website"
    })

    await useAddOnboardingWebsite().mutateAsync({ url: "example.com" })
    expect(apiClient.addOnboardingWebsite).toHaveBeenCalledWith({ url: "example.com" })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: knowledgeWebsitesQueryKey })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: knowledgeBaseStatusQueryKey })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: onboardingStateQueryKey })

    await useFinalizeOnboarding().mutateAsync()
    expect(apiClient.finalizeOnboarding).toHaveBeenCalled()
    expect(queryClient.setQueryData).toHaveBeenCalledWith(agentQueryKey, { id: "agent-1" })
  })
})
