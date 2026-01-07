import { useMutation } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const useCreateSubscriptionCheckout = () =>
  useMutation({
    mutationFn: (plan: "basic" | "pro") => apiClient.createSubscriptionCheckout(plan)
  })

