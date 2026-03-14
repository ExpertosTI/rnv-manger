import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';
const SENSITIVE_KEY_PATTERNS = ["password", "pass", "token", "secret", "key", "pin"];

function isSensitiveKey(key: string) {
    const lower = key.toLowerCase();
    return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

export async function GET() {
    try {
        const clients = await prisma.client.findMany();
        const vps = await prisma.vPS.findMany();
        const services = await prisma.service.findMany();
        const payments = await prisma.payment.findMany();
        const revenueHistory = await prisma.revenueHistory.findMany();
        const appSettings = (await prisma.appSettings.findMany()).filter((setting) => !isSensitiveKey(setting.key));

        const backupData = {
            version: "1.0",
            timestamp: new Date().toISOString(),
            data: {
                clients,
                vps,
                services,
                payments,
                revenueHistory,
                appSettings
            }
        };

        return NextResponse.json(backupData);
    } catch (error: any) {
        console.error("Export error:", error);
        return NextResponse.json(
            { error: "Failed to export data", details: error.message },
            { status: 500 }
        );
    }
}
