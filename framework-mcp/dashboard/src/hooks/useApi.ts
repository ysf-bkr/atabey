import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

export function useApi<T>(endpoint: string, interval = 0) {
    const q = useQuery<T, Error>({
        queryKey: [endpoint],
        queryFn: async () => {
            const r = await fetch(`/api${endpoint}`);
            if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
            const json = await r.json();
            let data = json;
            if (json && typeof json === "object" && "success" in json && "data" in json) {
                data = json.data;
            }

            // Safety guard: if this endpoint is expected to return an array but doesn't, return []
            const isArrayEndpoint = ["/agents", "/approvals", "/logs", "/messages", "/tasks", "/memory/search", "/compliance"].some(ep => endpoint.startsWith(ep));
            if (isArrayEndpoint && !Array.isArray(data)) {
                return [] as unknown as T;
            }
            return data;
        },
        refetchInterval: interval || false,
    });

    const refetch = useCallback(() => { q.refetch(); }, [q.refetch]);

    return {
        data: q.data,
        loading: q.isLoading,
        error: q.error?.message ?? null,
        refetch,
    };
}
