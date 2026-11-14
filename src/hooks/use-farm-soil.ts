import { useQuery } from "@tanstack/react-query";
import { fetchSoilContext } from "@/lib/farm-context";
import type { Coordinates } from "@/lib/nasa-power";

export function useFarmSoil(location: Coordinates, enabled: boolean) {
  return useQuery({
    queryKey: ["farm-soil", `${location.latitude},${location.longitude}`],
    enabled,
    staleTime: 7 * 86400000,
    gcTime: 7 * 86400000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) => fetchSoilContext(location, signal),
  });
}
