import { useQuery } from '@tanstack/react-query';
import { useActor } from './useActor';

// Hook to fetch external IP address
export function useExternalIp() {
  const { actor, isFetching } = useActor();

  return useQuery<string>({
    queryKey: ['externalIp'],
    queryFn: async () => {
      if (!actor) return '';
      try {
        const result = await actor.getExternalIpAddress();
        return result;
      } catch (error) {
        console.error('Failed to fetch external IP:', error);
        return '';
      }
    },
    enabled: !!actor && !isFetching,
    staleTime: 60000, // Cache for 1 minute
    retry: 2,
  });
}

// Hook to measure network latency
export function useNetworkLatency() {
  const { actor, isFetching } = useActor();

  return useQuery<number>({
    queryKey: ['networkLatency'],
    queryFn: async () => {
      if (!actor) return 0;
      try {
        const result = await actor.measurePingLatency();
        return Number(result.latencyMs);
      } catch (error) {
        console.error('Failed to measure latency:', error);
        return 0;
      }
    },
    enabled: !!actor && !isFetching,
    refetchInterval: 5000, // Refresh every 5 seconds
    retry: 1,
  });
}

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
