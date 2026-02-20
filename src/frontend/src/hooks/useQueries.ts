import { useQuery } from '@tanstack/react-query';
import { useActor } from './useActor';

// Hook to fetch geo info
export function useGeoInfo() {
  const { actor, isFetching } = useActor();

  return useQuery<string | null>({
    queryKey: ['geoInfo'],
    queryFn: async () => {
      if (!actor) return null;
      try {
        const result = await actor.getGeoInfo();
        return result;
      } catch (error) {
        console.error('Failed to fetch geo info:', error);
        return null;
      }
    },
    enabled: !!actor && !isFetching,
    staleTime: 300000, // Cache for 5 minutes
    retry: 2,
  });
}
