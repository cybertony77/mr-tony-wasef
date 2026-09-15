import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../axios';

export const subscriptionKeys = {
  all: ['subscription'],
  detail: () => [...subscriptionKeys.all, 'detail'],
  status: () => [...subscriptionKeys.all, 'status'],
};

const subscriptionApi = {
  /** Full record — developer only */
  get: async () => {
    const response = await apiClient.get('/api/subscription');
    return response.data;
  },

  /** Timer/warning fields only — admin, assistant, developer */
  getStatus: async () => {
    const response = await apiClient.get('/api/subscription/status');
    return response.data;
  },

  create: async (subscriptionData) => {
    const response = await apiClient.post('/api/subscription', subscriptionData);
    return response.data;
  },

  cancel: async () => {
    const response = await apiClient.put('/api/subscription');
    return response.data;
  },

  expire: async () => {
    const response = await apiClient.patch('/api/subscription');
    return response.data;
  },
};

/** Developer dashboard — full subscription document */
export const useSubscription = (options = {}) => {
  return useQuery({
    queryKey: subscriptionKeys.detail(),
    queryFn: () => subscriptionApi.get(),
    refetchInterval: false,
    refetchIntervalInBackground: false,
    staleTime: 10 * 60 * 1000,
    retry: 2,
    retryDelay: 1000,
    ...options,
  });
};

/** UserMenu / _app — remaining time only (admin/assistant/developer) */
export const useSubscriptionStatus = (options = {}) => {
  return useQuery({
    queryKey: subscriptionKeys.status(),
    queryFn: () => subscriptionApi.getStatus(),
    refetchInterval: false,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    ...options,
  });
};

export const useCreateSubscription = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (subscriptionData) => subscriptionApi.create(subscriptionData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
  });
};

export const useCancelSubscription = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => subscriptionApi.cancel(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
  });
};

export const useExpireSubscription = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => subscriptionApi.expire(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
  });
};
