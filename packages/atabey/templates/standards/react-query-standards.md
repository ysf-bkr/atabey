# React Query (TanStack Query) Standards

> Server state management for React applications.

## Overview

React Query handles server state: caching, background refetching, optimistic updates, and pagination.

## Setup

```bash
npm install @tanstack/react-query
```

## Provider Setup

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5,
            retry: 2,
            refetchOnWindowFocus: false,
        },
    },
});

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}
```

## Hook Pattern

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Fetch
export function useCustomers(page = 1) {
    return useQuery({
        queryKey: ["customers", { page }],
        queryFn: () => fetch(`/api/v1/customers?page=${page}`).then(r => r.json()),
    });
}

// Mutation with cache invalidation
export function useCreateCustomer() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data) => fetch("/api/v1/customers", {
            method: "POST",
            body: JSON.stringify(data),
        }).then(r => r.json()),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
    });
}
```

## Best Practices

1. Use query keys as arrays: `["resource", params]`
2. Set appropriate stale times based on data volatility
3. Use `onMutate` for optimistic updates
4. Keep API calls in dedicated hooks
5. Use `enabled` option for dependent queries
6. Implement error boundaries for query errors
