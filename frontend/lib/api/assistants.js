import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../axios';

// Query keys for assistants
export const assistantKeys = {
  all: ['assistants'],
  lists: () => [...assistantKeys.all, 'list'],
  list: (filters) => [...assistantKeys.lists(), { filters }],
  details: () => [...assistantKeys.all, 'detail'],
  detail: (id) => [...assistantKeys.details(), id],
};

// API functions
const assistantsApi = {
  // Get all assistants with pagination support
  getAll: async (params = {}) => {
    const queryParams = new URLSearchParams();
    
    // Add pagination parameters
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.search) queryParams.append('search', params.search);
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);
    
    const queryString = queryParams.toString();
    const url = queryString ? `/api/auth/assistants?${queryString}` : '/api/auth/assistants';
    
    const response = await apiClient.get(url);
    return response.data;
  },

  // Get all assistants (legacy - for backward compatibility)
  getAllLegacy: async () => {
    const response = await apiClient.get('/api/auth/assistants');
    return response.data;
  },

  // Get assistant by ID
  getById: async (id) => {
    const response = await apiClient.get(`/api/auth/assistants/${id}`);
    return response.data;
  },

  // Check if username exists (lightweight — does not require admin list access)
  checkUsernameExists: async (username, excludeId = null) => {
    const params = new URLSearchParams();
    params.set('username', String(username));
    if (excludeId != null && String(excludeId).trim() !== '') {
      params.set('exclude', String(excludeId));
    }
    const response = await apiClient.get(`/api/auth/check-username?${params.toString()}`);
    return response.data;
  },

  // Create new assistant
  create: async (assistantData) => {
    const response = await apiClient.post('/api/auth/assistants', assistantData);
    return response.data;
  },

  // Update assistant
  update: async (id, updateData) => {
    const response = await apiClient.put(`/api/auth/assistants/${id}`, updateData);
    return response.data;
  },

  // Delete assistant
  delete: async (id) => {
    const response = await apiClient.delete(`/api/auth/assistants/${id}`);
    return response.data;
  },
};

// React Query hooks
export const useAssistants = (filters = {}, options = {}) => {
  return useQuery({
    queryKey: assistantKeys.list(filters),
    queryFn: () => assistantsApi.getAllLegacy(),
    ...options, // Spread the options to allow custom configuration
  });
};

// Hook for paginated assistants with better performance
export const useAssistantsPaginated = (params = {}, options = {}) => {
  const defaultParams = {
    page: 1,
    limit: 50,
    sortBy: 'id',
    sortOrder: 'asc',
    ...params
  };

  return useQuery({
    queryKey: [...assistantKeys.all, 'paginated', defaultParams],
    queryFn: () => assistantsApi.getAll(defaultParams),
    keepPreviousData: true, // Keep previous data while loading new page
    ...options,
  });
};

// Hook for legacy compatibility (loads all assistants at once)
export const useAssistantsLegacy = (options = {}) => {
  return useQuery({
    queryKey: [...assistantKeys.all, 'legacy'],
    queryFn: () => assistantsApi.getAllLegacy(),
    ...options,
  });
};

export const useAssistant = (id) => {
  return useQuery({
    queryKey: assistantKeys.detail(id),
    queryFn: () => assistantsApi.getById(id),
    enabled: !!id,
  });
};

export const useCheckUsername = (username, excludeId = null) => {
  return useQuery({
    queryKey: [...assistantKeys.all, 'check-username', username, excludeId ?? ''],
    queryFn: () => assistantsApi.checkUsernameExists(username, excludeId),
    enabled: !!username && String(username).length > 0,
    staleTime: 0, // Always fetch fresh data for username checks
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: false, // Don't refetch on window focus for username checks
  });
};

// Mutations
export const useCreateAssistant = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (assistantData) => assistantsApi.create(assistantData),
    onSuccess: (newAssistant) => {
      // Optimistically update the assistants list
      queryClient.setQueryData(assistantKeys.lists(), (oldData) => {
        if (oldData) {
          return [...oldData, newAssistant];
        }
        return [newAssistant];
      });
      
      // Invalidate and refetch assistants list
      queryClient.invalidateQueries({ queryKey: assistantKeys.lists() });
    },
  });
};

export const useUpdateAssistant = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, updateData }) => assistantsApi.update(id, updateData),
    onMutate: async ({ id, updateData }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: assistantKeys.detail(id) });
      await queryClient.cancelQueries({ queryKey: assistantKeys.lists() });

      // Snapshot the previous value
      const previousAssistant = queryClient.getQueryData(assistantKeys.detail(id));
      const previousAssistants = queryClient.getQueryData(assistantKeys.lists());

      // Optimistically update to the new value
      if (previousAssistant) {
        queryClient.setQueryData(assistantKeys.detail(id), { ...previousAssistant, ...updateData });
      }
      
      if (previousAssistants) {
        queryClient.setQueryData(assistantKeys.lists(), (oldData) => 
          oldData?.map(assistant => assistant.id === id ? { ...assistant, ...updateData } : assistant)
        );
      }

      // Return a context object with the snapshotted value
      return { previousAssistant, previousAssistants };
    },
    onError: (err, { id }, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousAssistant) {
        queryClient.setQueryData(assistantKeys.detail(id), context.previousAssistant);
      }
      if (context?.previousAssistants) {
        queryClient.setQueryData(assistantKeys.lists(), context.previousAssistants);
      }
    },
    onSettled: (data, error, { id }) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: assistantKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assistantKeys.lists() });
    },
  });
};

export const useDeleteAssistant = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id) => assistantsApi.delete(id),
    onSuccess: (data, id) => {
      // Optimistically remove from assistants list
      queryClient.setQueryData(assistantKeys.lists(), (oldData) => 
        oldData?.filter(assistant => assistant.id !== id)
      );
      
      // Remove from cache
      queryClient.removeQueries({ queryKey: assistantKeys.detail(id) });
      
      // Invalidate and refetch assistants list
      queryClient.invalidateQueries({ queryKey: assistantKeys.lists() });
    },
  });
};
