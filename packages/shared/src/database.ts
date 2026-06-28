import type Database from "better-sqlite3";

let globalDB: Database.Database | null = null;

export const databaseHolder = {
    setDB(db: Database.Database) {
        globalDB = db;
    },
    getDB(): Database.Database {
        if (!globalDB) {
            throw new Error("Atabey Shared Database has not been initialized. Please call databaseHolder.setDB(db) at startup.");
        }
        return globalDB;
    }
};
