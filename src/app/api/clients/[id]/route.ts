/**
 * Client Detail API - GET, PUT, DELETE for individual client
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logAudit, getClientIP } from "@/lib/audit";

type RouteParams = { params: Promise<{ id: string }> };

// GET: Get client details by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        const client = await prisma.client.findUnique({
            where: { id },
            include: {
                vpsList: {
                    select: {
                        id: true,
                        name: true,
                        ipAddress: true,
                        status: true,
                        monthlyCost: true,
                    },
                },
                services: {
                    select: {
                        id: true,
                        name: true,
                        type: true,
                        url: true,
                        monthlyCost: true,
                        status: true,
                    },
                },
                payments: {
                    orderBy: { createdAt: "desc" },
                    take: 10,
                    select: {
                        id: true,
                        amount: true,
                        date: true,
                        status: true,
                        odooInvoiceName: true,
                    },
                },
            },
        });

        if (!client) {
            return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
        }

        // Calculate total costs
        const vpsCost = client.vpsList.reduce((sum, vps) => sum + (vps.monthlyCost || 0), 0);
        const serviceCost = client.services.reduce((sum, svc) => sum + (svc.monthlyCost || 0), 0);
        const totalMonthlyCost = vpsCost + serviceCost + (client.monthlyFee || 0);

        return NextResponse.json({
            success: true,
            data: {
                ...client,
                vpsCost,
                serviceCost,
                totalMonthlyCost,
            },
        });
    } catch (error: any) {
        console.error("Error fetching client:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// PUT: Update client details
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { name, email, phone, companyName, notes, monthlyFee, paymentDay, isActive, currency } = body;

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email || null;
        if (phone !== undefined) updateData.phone = phone || null;
        if (companyName !== undefined) updateData.companyName = companyName || null;
        if (notes !== undefined) updateData.notes = notes || null;
        if (monthlyFee !== undefined) updateData.monthlyFee = monthlyFee;
        if (paymentDay !== undefined) updateData.paymentDay = paymentDay;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (currency !== undefined) updateData.currency = currency;

        const updatedClient = await prisma.client.update({
            where: { id },
            data: updateData,
            include: {
                vpsList: {
                    select: { id: true, name: true, monthlyCost: true },
                },
                services: {
                    select: { id: true, name: true, monthlyCost: true },
                },
            },
        });

        await logAudit({ action: "UPDATE", entity: "client", entityId: id, description: "Cliente actualizado: " + (body.name || id), ipAddress: getClientIP(request) });

        return NextResponse.json({ success: true, data: updatedClient });
    } catch (error: any) {
        console.error("Error updating client:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// DELETE: Delete client
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        // Check if client exists
        const client = await prisma.client.findUnique({ where: { id } });
        if (!client) {
            return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
        }

        // Delete client (cascade will handle related records)
        await prisma.client.delete({ where: { id } });

        await logAudit({ action: "DELETE", entity: "client", entityId: id, description: "Cliente eliminado", ipAddress: getClientIP(request) });

        return NextResponse.json({ success: true, message: "Client deleted successfully" });
    } catch (error: any) {
        console.error("Error deleting client:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
