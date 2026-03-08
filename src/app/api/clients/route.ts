/**
 * Clients API with Odoo Integration
 * Silently syncs with Odoo and provides unified client data
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ClientCreateSchema, validateRequest } from "@/lib/validation";
import { backgroundSync, syncClientToOdoo } from "@/lib/odoo/sync";

// GET all clients with services, VPS, and costs
export async function GET(request: NextRequest) {
    try {
        // Trigger background sync with Odoo (non-blocking)
        backgroundSync().catch((err) => console.log("[Background Sync]", err.message));

        const clients = await prisma.client.findMany({
            include: {
                vpsList: {
                    include: { services: true },
                },
                services: true,
                payments: {
                    orderBy: { date: "desc" },
                    take: 5,
                },
            },
            orderBy: { createdAt: "desc" },
        });

        // Enrich with calculated costs
        const enrichedClients = clients.map((client) => {
            const vpsCost = client.vpsList.reduce((sum, vps) => sum + (vps.monthlyCost || 0), 0);
            const serviceCost = client.services.reduce((sum, svc) => sum + (svc.monthlyCost || 0), 0);
            const totalMonthlyCost = vpsCost + serviceCost + (client.monthlyFee || 0);

            return {
                ...client,
                calculatedCosts: {
                    vps: vpsCost,
                    services: serviceCost,
                    baseFee: client.monthlyFee,
                    total: totalMonthlyCost,
                },
                syncedWithOdoo: !!client.odooPartnerId,
            };
        });

        return NextResponse.json({ success: true, data: enrichedClients });
    } catch (error) {
        console.error("Error fetching clients:", error);
        return NextResponse.json({ success: false, error: "Failed to fetch clients" }, { status: 500 });
    }
}

// POST create new client with optional Odoo sync
export async function POST(request: NextRequest) {
    try {
        const validation = await validateRequest(request, ClientCreateSchema);

        if (!validation.success) {
            return NextResponse.json({
                success: false,
                error: "Validation failed",
                details: validation.errors,
            }, { status: 400 });
        }

        const { name, email, phone, companyName, notes, monthlyFee, currency, paymentDay } = validation.data;

        const client = await prisma.client.create({
            data: {
                name,
                email,
                phone,
                companyName,
                notes,
                monthlyFee: monthlyFee || 0,
                currency: currency || "USD",
                paymentDay: paymentDay || 1,
            },
        });

        // Auto-sync new client to Odoo (non-blocking)
        syncClientToOdoo(client.id).catch((err) =>
            console.log("[Odoo Sync] Failed to sync new client:", err.message)
        );

        return NextResponse.json({ success: true, data: client }, { status: 201 });
    } catch (error) {
        console.error("Error creating client:", error);
        return NextResponse.json({ success: false, error: "Failed to create client" }, { status: 500 });
    }
}
