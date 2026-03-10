import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const clients = await prisma.client.findMany();
        const vps = await prisma.vps.findMany();
        const services = await prisma.service.findMany();
        const payments = await prisma.payment.findMany();
        const revenueHistory = await prisma.revenueHistory.findMany();
        const appSettings = await prisma.appSettings.findMany();

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
