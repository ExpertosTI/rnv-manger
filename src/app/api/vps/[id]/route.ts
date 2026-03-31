/**
 * VPS Detail API
 * Get, update, delete specific VPS with services and client info
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logAudit, getClientIP } from "@/lib/audit";

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET: Get VPS details with services
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        const vps = await prisma.vPS.findUnique({
            where: { id },
            include: {
                client: {
                    select: { id: true, name: true, email: true },
                },
                services: {
                    include: {
                        client: {
                            select: { id: true, name: true },
                        },
                    },
                },
            },
        });

        if (!vps) {
            return NextResponse.json({ success: false, error: "VPS not found" }, { status: 404 });
        }

        // Calculate total service cost
        const serviceCost = vps.services.reduce((sum, svc) => sum + (svc.monthlyCost || 0), 0);

        return NextResponse.json({
            success: true,
            data: {
                ...vps,
                totalServiceCost: serviceCost,
                totalMonthlyCost: (vps.monthlyCost || 0) + serviceCost,
            },
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// PUT: Update VPS
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const body = await request.json();

        const { name, monthlyCost, clientId, configFiles, sshUser, sshPort } = body;

        const vps = await prisma.vPS.update({
            where: { id },
            data: {
                name: name !== undefined ? name : undefined,
                monthlyCost: monthlyCost !== undefined ? monthlyCost : undefined,
                clientId: clientId !== undefined ? clientId : undefined,
                configFiles: configFiles !== undefined ? configFiles : undefined,
                sshUser: sshUser !== undefined ? sshUser : undefined,
                sshPort: sshPort !== undefined ? sshPort : undefined,
            },
        });

        // Update client's total cost if linked
        if (vps.clientId) {
            await updateClientTotalCost(vps.clientId);
        }

        await logAudit({ action: "UPDATE", entity: "vps", entityId: id, description: "VPS actualizado", ipAddress: getClientIP(request) });

        return NextResponse.json({ success: true, data: vps });
    } catch (error: any) {
        if (error.code === "P2025") {
            return NextResponse.json({ success: false, error: "VPS not found" }, { status: 404 });
        }
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// DELETE: Delete VPS and its services
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        const vps = await prisma.vPS.findUnique({ where: { id } });
        if (!vps) {
            return NextResponse.json({ success: false, error: "VPS not found" }, { status: 404 });
        }

        const clientId = vps.clientId;

        await prisma.vPS.delete({ where: { id } });

        // Update client's total cost after deletion
        if (clientId) {
            await updateClientTotalCost(clientId);
        }

        return NextResponse.json({ success: true, message: "VPS deleted" });
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
