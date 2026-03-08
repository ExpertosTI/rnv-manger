import { NextResponse } from "next/server";
import { getOdooClient } from "@/lib/odoo";
import prisma from "@/lib/prisma";

// GET - List invoices from Odoo
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get("limit") || "50");

        const odoo = getOdooClient();
        const invoices = await odoo.getInvoices(limit);

        return NextResponse.json({
            success: true,
            data: invoices,
            count: invoices.length,
        });
    } catch (error: any) {
        console.error("[Odoo Invoices] Error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Failed to fetch invoices",
        }, { status: 500 });
    }
}

// POST - Create invoice in Odoo
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { clientId, partnerId, lines } = body;

        if (!lines || !Array.isArray(lines) || lines.length === 0) {
            return NextResponse.json({
                success: false,
                error: "Invoice lines are required",
            }, { status: 400 });
        }

        let odooPartnerId = partnerId;

        // If clientId provided, get or create Odoo partner
        if (clientId && !odooPartnerId) {
            const client = await prisma.client.findUnique({
                where: { id: clientId },
            });

            if (!client) {
                return NextResponse.json({
                    success: false,
                    error: "Client not found",
                }, { status: 404 });
            }

            // Sync client to Odoo and get partner ID
            const odoo = getOdooClient();
            odooPartnerId = await odoo.syncPartner({
                name: client.name,
                email: client.email || undefined,
                phone: client.phone || undefined,
            });
        }

        if (!odooPartnerId) {
            return NextResponse.json({
                success: false,
                error: "Partner ID is required (or provide clientId to auto-sync)",
            }, { status: 400 });
        }

        const odoo = getOdooClient();
        const invoiceId = await odoo.createInvoice(odooPartnerId, lines);

        return NextResponse.json({
            success: true,
            data: { invoiceId, partnerId: odooPartnerId },
            message: `Invoice ${invoiceId} created successfully`,
        });
    } catch (error: any) {
        console.error("[Odoo Invoices] Create error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Failed to create invoice",
        }, { status: 500 });
    }
}
