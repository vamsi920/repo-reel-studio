import { useMutation, useQueryClient } from "@tanstack/react-query";
import LLMSubscriptionService from "#/api/llm-subscription-service";
import { LLM_SUBSCRIPTION_QUERY_KEYS } from "#/hooks/query/query-keys";

export function useStartOpenAISubscriptionLogin() {
  return useMutation({
    mutationFn: LLMSubscriptionService.startOpenAIDeviceLogin,
  });
}

export function usePollOpenAISubscriptionLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: LLMSubscriptionService.pollOpenAIDeviceLogin,
    onSuccess: () => {
      // Invalidate by the shared prefix (not a single backend-scoped key) so
      // this matches every openaiStatus query regardless of which backend it
      // was fetched for -- same convention as LLM_PROFILES_QUERY_KEYS.all.
      queryClient.invalidateQueries({
        queryKey: LLM_SUBSCRIPTION_QUERY_KEYS.all,
      });
    },
  });
}

export function useLogoutOpenAISubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: LLMSubscriptionService.logoutOpenAI,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: LLM_SUBSCRIPTION_QUERY_KEYS.all,
      });
    },
  });
}
