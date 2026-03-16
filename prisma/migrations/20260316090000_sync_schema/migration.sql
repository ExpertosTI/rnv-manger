ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "odooPartnerId" INTEGER;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "odooLastSync" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "odooData" JSONB;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "totalMonthlyCost" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "VPS" ADD COLUMN IF NOT EXISTS "monthlyCost" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "VPS" ADD COLUMN IF NOT EXISTS "configFiles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "resourceUsage" JSONB;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "monthlyCost" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "clientId" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Service_clientId_fkey'
    ) THEN
        ALTER TABLE "Service"
        ADD CONSTRAINT "Service_clientId_fkey"
        FOREIGN KEY ("clientId") REFERENCES "Client"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "odooInvoiceId" INTEGER;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "odooInvoiceName" TEXT;

CREATE TABLE IF NOT EXISTS "RevenueHistory" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clients" INTEGER NOT NULL DEFAULT 0,
    "vps" INTEGER NOT NULL DEFAULT 0,
    "services" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RevenueHistory_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'RevenueHistory_year_month_key'
    ) THEN
        ALTER TABLE "RevenueHistory"
        ADD CONSTRAINT "RevenueHistory_year_month_key" UNIQUE ("year", "month");
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AppSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'AppSettings_key_key'
    ) THEN
        ALTER TABLE "AppSettings"
        ADD CONSTRAINT "AppSettings_key_key" UNIQUE ("key");
    END IF;
END $$;
