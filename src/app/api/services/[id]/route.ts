/**
 * Service Detail API
 * GET, PUT, DELETE for individual services
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET: Get service details
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        const service = await prisma.service.findUnique({
            where: { id },
            include: {
                vps: {
                    select: { id: true, name: true, ipAddress: true },
                },
                client: {
                    select: { id: true, name: true, email: true },
                },
            },
        });

        if (!service) {
            return NextResponse.json({ success: false, error: "Service not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: service });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// PUT: Update service
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const body = await request.json();

        const { name, type, url, port, monthlyCost, configFile, clientId, vpsId, status } = body;

        // Build update data
        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (type !== undefined) updateData.type = type;
        if (url !== undefined) updateData.url = url || null;
        if (port !== undefined) updateData.port = port || null;
        if (monthlyCost !== undefined) updateData.monthlyCost = monthlyCost;
        if (configFile !== undefined) updateData.configFile = configFile || null;
        if (status !== undefined) updateData.status = status;

        // Handle client relation
        if (clientId !== undefined) {
            updateData.clientId = clientId || null;
        }

        // Handle VPS relation
        if (vpsId !== undefined) {
            updateData.vpsId = vpsId || null;
        }

        const service = await prisma.service.update({
            where: { id },
            data: updateData,
            include: {
                vps: { select: { id: true, name: true, ipAddress: true } },
                client: { select: { id: true, name: true } },
            },
        });

        // Update client's total cost if linked
        if (service.clientId) {
            await updateClientTotalCost(service.clientId);
        }

        return NextResponse.json({ success: true, data: service });
    } catch (error: any) {
        if (error.code === "P2025") {
            return NextResponse.json({ success: false, error: "Service not found" }, { status: 404 });
        }
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// DELETE: Delete service
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        const service = await prisma.service.findUnique({ where: { id } });
        if (!service) {
            return NextResponse.json({ success: false, error: "Service not found" }, { status: 404 });
        }

        const clientId = service.clientId;

        await prisma.service.delete({ where: { id } });

        // Update client's total cost after deletion
        if (clientId) {
            await updateClientTotalCost(clientId);
        }

        return NextResponse.json({ success: true, message: "Service deleted" });
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

    const vpsCost = client.vpsList.reduce((sum: number, vps: any) => sum + (vps.monthlyCost || 0), 0);
    const serviceCost = client.services.reduce((sum: number, svc: any) => sum + (svc.monthlyCost || 0), 0);
    const totalCost = vpsCost + serviceCost + (client.monthlyFee || 0);

    await prisma.client.update({
        where: { id: clientId },
        data: { totalMonthlyCost: totalCost },
    });
}
