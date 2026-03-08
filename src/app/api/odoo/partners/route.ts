import { NextResponse } from "next/server";
import { getOdooClient } from "@/lib/odoo";
import prisma from "@/lib/prisma";

// GET - List partners from Odoo
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get("limit") || "100");

        const odoo = getOdooClient();
        const partners = await odoo.getPartners(limit);

        return NextResponse.json({
            success: true,
            data: partners,
            count: partners.length,
        });
    } catch (error: any) {
        console.error("[Odoo Partners] Error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Failed to fetch partners",
        }, { status: 500 });
    }
}

// POST - Sync RNV client to Odoo partner
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { clientId, name, email, phone, companyName } = body;

        // If clientId provided, get client from RNV database
        let clientData = { name, email, phone };
        if (clientId) {
            const client = await prisma.client.findUnique({
                where: { id: clientId },
            });
            if (client) {
                clientData = {
                    name: client.name,
                    email: client.email || undefined,
                    phone: client.phone || undefined,
                };
            }
        }

        if (!clientData.name) {
            return NextResponse.json({
                success: false,
                error: "Name is required",
            }, { status: 400 });
        }

        const odoo = getOdooClient();
        const partnerId = await odoo.syncPartner({
            name: clientData.name,
            email: clientData.email,
            phone: clientData.phone,
            company_type: companyName ? "company" : "person",
        });

        // Update RNV client with Odoo partner ID
        if (clientId) {
            // Note: You'll need to add odooPartnerId field to Client model
            // await prisma.client.update({
            //     where: { id: clientId },
            //     data: { odooPartnerId: partnerId },
            // });
        }

        return NextResponse.json({
            success: true,
            data: { partnerId },
            message: `Partner ${partnerId} synced successfully`,
        });
    } catch (error: any) {
        console.error("[Odoo Partners] Sync error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Failed to sync partner",
        }, { status: 500 });
    }
}
