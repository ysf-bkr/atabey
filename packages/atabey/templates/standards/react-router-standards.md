# React Router Standards

> Client-side routing for React applications.

## Overview

React Router v7 provides declarative routing with nested layouts, loaders, and actions.

## Setup

```bash
npm install react-router-dom
```

## Basic Setup

```tsx
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const router = createBrowserRouter([
    {
        path: "/",
        element: <Layout />,
        children: [
            { index: true, element: <Dashboard /> },
            { path: "customers", element: <Customers /> },
            { path: "customers/:id", element: <CustomerDetail /> },
            { path: "users", element: <Users /> },
            { path: "settings", element: <Settings /> },
        ],
    },
]);

export function App() {
    return <RouterProvider router={router} />;
}
```

## Protected Routes

```tsx
function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
    const { user } = useAuth();

    if (!user) return <Navigate to="/login" replace />;
    if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

    return <>{children}</>;
}

// Usage in router
{ path: "admin", element: <ProtectedRoute roles={["ADMIN"]}><AdminPanel /></ProtectedRoute> }
```

## Best Practices

1. Use nested routes for consistent layouts
2. Implement lazy loading with `React.lazy()` for route splitting
3. Use route loaders for data fetching
4. Protect admin routes with role-based guards
5. Keep routes organized in a single configuration
6. Use `useNavigate` for programmatic navigation
