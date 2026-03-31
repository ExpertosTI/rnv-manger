/**
 * Billing API
 * Handles cost calculation and invoice generation in Odoo
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { OdooClient } from "@/lib/odoo/client";
import { getClientWithCosts } from "@/lib/odoo/sync";
import { logAudit, getClientIP } from "@/lib/audit";

export interface InvoiceLine {
    name: string;
    quantity: number;
    price_unit: number;
}

export interface BillingResult {
    success: boolean;
    invoiceId?: number;
    invoiceName?: string;
    totalAmount?: number;
    error?: string;
}

// GET: Calculate billing summary for a client
export async function GET(request: NextRequest) {
    const clientId = request.nextUrl.searchParams.get("clientId");

    if (!clientId) {
        // Return summary of all clients with pending billing
        const clients = await prisma.client.findMany({
            where: { isActive: true },
            include: {
                vpsList: true,
                services: true,
            },
        });

        const summary = clients.map((client) => {
            const vpsCost = client.vpsList.reduce((sum, vps) => sum + (vps.monthlyCost || 0), 0);
            const serviceCost = client.services.reduce((sum, svc) => sum + (svc.monthlyCost || 0), 0);
            const totalCost = vpsCost + serviceCost + (client.monthlyFee || 0);

            return {
                id: client.id,
                name: client.name,
                odooPartnerId: client.odooPartnerId,
                vpsCost,
                serviceCost,
                baseFee: client.monthlyFee,
                totalMonthlyCost: totalCost,
                vpsCount: client.vpsList.length,
                serviceCount: client.services.length,
                canInvoice: !!client.odooPartnerId && totalCost > 0,
            };
        });

        const totalRevenue = summary.reduce((sum, c) => sum + c.totalMonthlyCost, 0);

        return NextResponse.json({
            success: true,
            data: summary,
            totals: {
                clients: clients.length,
                totalMonthlyRevenue: totalRevenue,
                clientsWithOdoo: summary.filter((c) => c.odooPartnerId).length,
            },
        });
    }

    // Get specific client billing details
    const clientData = await getClientWithCosts(clientId);

    if (!clientData) {
        return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: clientData });
}

// POST: Generate invoice in Odoo for a client
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { clientId, customLines } = body;

        if (!clientId) {
            return NextResponse.json({ success: false, error: "clientId is required" }, { status: 400 });
        }

        const client = await prisma.client.findUnique({
            where: { id: clientId },
            include: {
                vpsList: true,
                services: true,
            },
        });

        if (!client) {
            return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
        }

        if (!client.odooPartnerId) {
            return NextResponse.json(
                { success: false, error: "Client not synced with Odoo. Sync first." },
                { status: 400 }
            );
        }

        // Build invoice lines
        const invoiceLines: InvoiceLine[] = customLines || [];

        // Add VPS costs
        for (const vps of client.vpsList) {
            if (vps.monthlyCost > 0) {
                invoiceLines.push({
                    name: `VPS: ${vps.name} (${vps.ipAddress})`,
                    quantity: 1,
                    price_unit: vps.monthlyCost,
                });
            }
        }

        // Add Service costs
        for (const service of client.services) {
            if (service.monthlyCost > 0) {
                invoiceLines.push({
                    name: `Service: ${service.name} (${service.type})`,
                    quantity: 1,
                    price_unit: service.monthlyCost,
                });
            }
        }

        // Add base monthly fee if present
        if (client.monthlyFee > 0) {
            invoiceLines.push({
                name: "Monthly Management Fee",
                quantity: 1,
                price_unit: client.monthlyFee,
            });
        }

        if (invoiceLines.length === 0) {
            return NextResponse.json(
                { success: false, error: "No billable items found" },
                { status: 400 }
            );
        }

        // Create invoice in Odoo
        const odoo = new OdooClient();
        await odoo.authenticate();

        const invoiceData = {
            partner_id: client.odooPartnerId,
            move_type: "out_invoice",
            invoice_line_ids: invoiceLines.map((line) => [
                0,
                0,
                {
                    name: line.name,
                    quantity: line.quantity,
                    price_unit: line.price_unit,
                },
            ]),
        };

        const invoiceId = await odoo.execute("account.move", "create", [invoiceData]) as number;

        // Get invoice name
        const invoiceInfo = await odoo.execute(
            "account.move",
            "read",
            [[invoiceId]],
            { fields: ["name"] }
        ) as { name: string }[];
        const invoiceName = invoiceInfo[0]?.name || `INV-${invoiceId}`;

        // Calculate total
        const totalAmount = invoiceLines.reduce((sum, line) => sum + line.quantity * line.price_unit, 0);

        // Record payment in local database
        await prisma.payment.create({
            data: {
                amount: totalAmount,
                currency: client.currency,
                status: "pending",
                clientId: client.id,
                odooInvoiceId: invoiceId,
                odooInvoiceName: invoiceName,
                notes: `Auto-generated invoice with ${invoiceLines.length} items`,
            },
        });

        await logAudit({ action: "CREATE", entity: "invoice", description: "Factura generada", ipAddress: getClientIP(request) });

        return NextResponse.json({
            success: true,
            invoiceId,
            invoiceName,
            totalAmount,
            lineCount: invoiceLines.length,
        });
    } catch (error: any) {
        console.error("Billing error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
