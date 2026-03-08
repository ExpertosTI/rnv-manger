/**
 * Services List API
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET all services with filters
export async function GET(request: NextRequest) {
    try {
        const vpsId = request.nextUrl.searchParams.get("vpsId");
        const clientId = request.nextUrl.searchParams.get("clientId");

        const where: any = {};
        if (vpsId) where.vpsId = vpsId;
        if (clientId) where.clientId = clientId;

        const services = await prisma.service.findMany({
            where,
            include: {
                vps: {
                    select: { id: true, name: true, ipAddress: true },
                },
                client: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json({ success: true, data: services, count: services.length });
    } catch (error: any) {
        console.error("Error fetching services:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// POST create new service
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, type, url, port, monthlyCost, configFile, clientId, vpsId } = body;

        if (!name || !type) {
            return NextResponse.json(
                { success: false, error: "name and type are required" },
                { status: 400 }
            );
        }

        const service = await prisma.service.create({
            data: {
                name,
                type,
                url: url || `https://${name}.renace.tech`,
                port: port || null,
                monthlyCost: monthlyCost || 0,
                configFile: configFile || null,
                clientId: clientId || null,
                vpsId: vpsId || null,
            },
            include: {
                vps: { select: { id: true, name: true } },
                client: { select: { id: true, name: true } },
            },
        });

        return NextResponse.json({ success: true, data: service }, { status: 201 });
    } catch (error: any) {
        console.error("Error creating service:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
