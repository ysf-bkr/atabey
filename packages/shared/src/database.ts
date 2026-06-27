let globalDB: any = null;

export const databaseHolder = {
    setDB(db: any) {
        globalDB = db;
    },
    getDB() {
        if (!globalDB) {
            throw new Error("Atabey Shared Database has not been initialized. Please call databaseHolder.setDB(db) at startup.");
        }
        return globalDB;
    }
};
