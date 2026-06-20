# Kysely ORM Standards

> Type-safe SQL query builder for TypeScript. Use for database operations.

## Setup

```typescript
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from './types';

const dialect = new SqliteDialect({
  database: new Database(process.env.DATABASE_PATH || './dev.db'),
});

export const db = new Kysely<DB>({ dialect });
```

## Table Definitions

Define types in `src/database/kysely/types.ts`:

```typescript
export interface UsersTable {
  id: string;
  email: string;
  full_name: string;
  role: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DB {
  users: UsersTable;
  customers: CustomersTable;
}
```

## Best Practices

1. Always use `where("deleted_at", "is", null)` for soft-delete
2. Use `returningAll()` after insert/update
3. Use `db.fn.countAll()` for pagination
4. Keep types in sync with actual schema
5. Use transactions for multi-step operations
