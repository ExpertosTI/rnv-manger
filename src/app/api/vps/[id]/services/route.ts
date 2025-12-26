/**
 * Services API for a specific VPS
 * CRUD operations for services linked to VPS
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET: List all services for a VPS
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: vpsId } = await params;

        const services = await prisma.service.findMany({
            where: { vpsId },
            include: {
                client: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json({ success: true, data: services, count: services.length });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// POST: Create a new service for a VPS
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: vpsId } = await params;
        const body = await request.json();

        const { name, type, port, configFile, url, monthlyCost, clientId } = body;

        if (!name || !type) {
            return NextResponse.json(
                { success: false, error: "name and type are required" },
                { status: 400 }
            );
        }

        // Verify VPS exists
        const vps = await prisma.vPS.findUnique({ where: { id: vpsId } });
        if (!vps) {
            return NextResponse.json({ success: false, error: "VPS not found" }, { status: 404 });
        }

        const service = await prisma.service.create({
            data: {
                name,
                type,
                port: port || null,
                configFile: configFile || null,
                url: url || null,
                monthlyCost: monthlyCost || 0,
                vpsId,
                clientId: clientId || vps.clientId, // Inherit from VPS if not specified
            },
        });

        // Update client's total cost if linked
        if (service.clientId) {
            await updateClientTotalCost(service.clientId);
        }

        return NextResponse.json({ success: true, data: service }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// Helper to update client's total monthly cost
async function updateClientTotalCost(clientId: string) {
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        include: {
            vpsList: true,
            services: true,
        },
    });

    if (!client) return;

    const vpsCost = client.vpsList.reduce((sum, vps) => sum + (vps.monthlyCost || 0), 0);
    const serviceCost = client.services.reduce((sum, svc) => sum + (svc.monthlyCost || 0), 0);
    const totalCost = vpsCost + serviceCost + (client.monthlyFee || 0);

    await prisma.client.update({
        where: { id: clientId },
        data: { totalMonthlyCost: totalCost },
    });
}
