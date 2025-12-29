import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export const featureEndpointsQueryKey = (featureId: string, page: number) =>
  ["features", featureId, "endpoints", page] as const;

export const useFeatureEndpointsQuery = (
  featureId: string,
  page: number,
  enabled = true,
) =>
  useQuery({
    queryKey: featureEndpointsQueryKey(featureId, page),
    queryFn: () => apiClient.listFeatureEndpoints(featureId, page),
    placeholderData: keepPreviousData,
    enabled,
    retry: 1,
  });




