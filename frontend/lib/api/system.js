import { useQuery } from '@tanstack/react-query';
import apiClient from '../axios';

export const systemKeys = {
  all: ['system'],
  config: () => [...systemKeys.all, 'config', 'features-v3'],
};

const systemApi = {
  getConfig: async () => {
    const response = await apiClient.get('/api/system/config');
    return response.data;
  },
};

/**
 * Feature flags are stored as booleans or string booleans in env.config.
 * Treat missing config as unknown (false here); callers must check loading first.
 */
export function isFeatureEnabled(config, feature) {
  const value = config?.[feature];
  return value === true || value === 'true' || value === 1 || value === '1';
}

export const useSystemConfig = (options = {}) => {
  return useQuery({
    queryKey: systemKeys.config(),
    queryFn: () => systemApi.getConfig(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
    ...options,
  });
};

/** When NATIONAL_SYSTEM=true, Course fields are labeled Grade and Course Type is hidden. */
export function useNationalSystem() {
  const { data: systemConfig } = useSystemConfig();
  return isFeatureEnabled(systemConfig, 'national_system');
}

export function getCourseFieldLabels(isNational) {
  return {
    course: isNational ? 'Grade' : 'Course',
    courseLower: isNational ? 'grade' : 'course',
    filterByCourse: isNational ? 'Filter by Grade' : 'Filter by Course',
    selectCourse: isNational ? 'Select Grade' : 'Select Course',
    addAnotherCourse: isNational ? 'Add another grade' : 'Add another course',
    showCourseType: !isNational,
    showGradeField: !isNational,
    score: isNational ? 'Degree' : 'Score',
    scoreLower: isNational ? 'degree' : 'score',
  };
}
