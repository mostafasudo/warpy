import { useMutation } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const useRevealApiKey = () =>
  useMutation({
    mutationFn: apiClient.revealApiKey,
  })
