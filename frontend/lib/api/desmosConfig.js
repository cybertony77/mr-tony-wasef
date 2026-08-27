import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../axios';

export const desmosConfigKeys = {
  all: ['desmos-config'],
  config: () => [...desmosConfigKeys.all, 'items'],
};

const desmosConfigApi = {
  getConfig: async () => {
    const response = await apiClient.get('/api/desmos-config');
    return response.data;
  },
  saveConfig: async (items) => {
    const response = await apiClient.put('/api/desmos-config', { items });
    return response.data;
  },
};

export const useDesmosConfig = (options = {}) => {
  return useQuery({
    queryKey: desmosConfigKeys.config(),
    queryFn: () => desmosConfigApi.getConfig(),
    staleTime: 60 * 1000,
    retry: 1,
    ...options,
  });
};

export const useSaveDesmosConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items) => desmosConfigApi.saveConfig(items),
    onSuccess: (data) => {
      queryClient.setQueryData(desmosConfigKeys.config(), (prev) => ({
        ...(prev || {}),
        items: data.items,
      }));
    },
  });
};
