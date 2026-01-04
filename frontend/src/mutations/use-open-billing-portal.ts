import { useMutation } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const useOpenBillingPortal = () =>
  useMutation({
    mutationFn: () => apiClient.openBillingPortal()
  })

