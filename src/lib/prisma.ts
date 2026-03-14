import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

const buildDatabaseUrl = () => {
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD;
    const dbName = process.env.DB_NAME;
    if (!dbUser || !dbPassword || !dbName) {
        return "";
    }
    const dbHost = process.env.DB_HOST || "127.0.0.1";
    const dbPort = process.env.DB_PORT || "5432";
    return `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}?schema=public`;
};

const runtimeDatabaseUrl = buildDatabaseUrl();
if (runtimeDatabaseUrl) {
    process.env.DATABASE_URL = runtimeDatabaseUrl;
}

const createPrismaClient = () => {
    console.log("[Prisma] Creating client, DATABASE_URL exists:", !!process.env.DATABASE_URL);
    return new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

export default prisma;

