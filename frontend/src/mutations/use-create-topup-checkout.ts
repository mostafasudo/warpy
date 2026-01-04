import { useMutation } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const useCreateTopupCheckout = () =>
  useMutation({
    mutationFn: (pkg: "1000" | "5000" | "10000") => apiClient.createTopupCheckout(pkg)
  })

