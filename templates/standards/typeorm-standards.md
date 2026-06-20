# TypeORM Standards

> Full-featured ORM with decorator-based entity definitions.

## Setup

```typescript
import { DataSource } from "typeorm";

export const AppDataSource = new DataSource({
    type: "sqlite",
    database: process.env.DATABASE_PATH || "./dev.db",
    synchronize: process.env.NODE_ENV === "development",
    logging: process.env.NODE_ENV === "development",
    entities: ["src/database/typeorm/entities/*.ts"],
    migrations: ["src/database/typeorm/migrations/*.ts"],
});
```

## Entity Pattern

```typescript
import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from "typeorm";

@Entity("users")
export class UserEntity {
    @PrimaryColumn()
    id!: string;
    @Column({ unique: true })
    email!: string;
    @Column()
    fullName!: string;
    @Column({ default: "VIEWER" })
    role!: string;
    @CreateDateColumn()
    createdAt!: Date;
    @UpdateDateColumn()
    updatedAt!: Date;
    @DeleteDateColumn()
    deletedAt?: Date;
}
```

## Best Practices
1. Use `@DeleteDateColumn()` for soft deletes
2. Set `synchronize: false` in production
3. Use `@ManyToOne` / `@OneToMany` for relations
4. Import `reflect-metadata` at entry point
5. Generate migrations, don't rely on synchronize
