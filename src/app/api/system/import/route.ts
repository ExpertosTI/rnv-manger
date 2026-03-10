import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        
        if (!body.data || !body.version) {
            return NextResponse.json(
                { error: "Invalid backup file format" },
                { status: 400 }
            );
        }

        const { clients, vps, services, payments, revenueHistory, appSettings } = body.data;

        // Perform restore in a transaction
        await prisma.$transaction(async (tx) => {
            // 1. Clear existing data (Order matters due to foreign keys)
            // Order: Payment -> Service -> VPS -> Client
            await tx.payment.deleteMany();
            await tx.service.deleteMany();
            await tx.vPS.deleteMany();
            await tx.client.deleteMany();
            
            // Independent tables
            await tx.revenueHistory.deleteMany();
            await tx.appSettings.deleteMany();

            // 2. Restore data (Order matters)
            // Order: Client -> VPS -> Service -> Payment
            
            // Clients
            if (clients && clients.length > 0) {
                await tx.client.createMany({
                    data: clients.map((c: any) => ({
                        ...c,
                        createdAt: new Date(c.createdAt),
                        updatedAt: new Date(c.updatedAt),
                        odooLastSync: c.odooLastSync ? new Date(c.odooLastSync) : null,
                    }))
                });
            }

            // VPS
            if (vps && vps.length > 0) {
                await tx.vPS.createMany({
                    data: vps.map((v: any) => ({
                        ...v,
                        createdAt: new Date(v.createdAt),
                        updatedAt: new Date(v.updatedAt),
                    }))
                });
            }

            // Services
            if (services && services.length > 0) {
                await tx.service.createMany({
                    data: services.map((s: any) => ({
                        ...s,
                        createdAt: new Date(s.createdAt),
                        updatedAt: new Date(s.updatedAt),
                        lastChecked: s.lastChecked ? new Date(s.lastChecked) : null,
                    }))
                });
            }

            // Payments
            if (payments && payments.length > 0) {
                await tx.payment.createMany({
                    data: payments.map((p: any) => ({
                        ...p,
                        createdAt: new Date(p.createdAt),
                        date: new Date(p.date),
                    }))
                });
            }

            // Revenue History
            if (revenueHistory && revenueHistory.length > 0) {
                await tx.revenueHistory.createMany({
                    data: revenueHistory.map((r: any) => ({
                        ...r,
                        createdAt: new Date(r.createdAt),
                        updatedAt: new Date(r.updatedAt),
                    }))
                });
            }

            // App Settings
            if (appSettings && appSettings.length > 0) {
                await tx.appSettings.createMany({
                    data: appSettings.map((a: any) => ({
                        ...a,
                        createdAt: new Date(a.createdAt),
                        updatedAt: new Date(a.updatedAt),
                    }))
                });
            }
        });

        return NextResponse.json({ success: true, message: "Data restored successfully" });
    } catch (error: any) {
        console.error("Import error:", error);
        return NextResponse.json(
            { error: "Failed to restore data", details: error.message },
            { status: 500 }
        );
    }
}
