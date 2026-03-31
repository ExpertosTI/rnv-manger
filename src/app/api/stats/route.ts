import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
    try {
        // Verify prisma is defined
        if (!prisma) {
            console.error("[Stats API] Prisma client is undefined");
            return NextResponse.json({
                success: false,
                error: "Database connection not available"
            }, { status: 500 });
        }

        const [vpsCount, clientCount, serviceCount, totalRevenue] = await Promise.all([
            prisma.vPS.count(),
            prisma.client.count(),
            prisma.service.count(),
            prisma.client.aggregate({
                _sum: {
                    monthlyFee: true
                }
            })
        ]);

        return NextResponse.json({
            success: true,
            data: {
                vps: vpsCount,
                clients: clientCount,
                services: serviceCount,
                revenue: totalRevenue._sum.monthlyFee || 0,
            }
        });
    } catch (error: any) {
        console.error("[Stats API] Error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Unknown error"
        }, { status: 500 });
    }
}
