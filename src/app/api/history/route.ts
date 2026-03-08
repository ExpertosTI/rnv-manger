import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET - Get revenue history
export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const months = parseInt(url.searchParams.get("months") || "12");

        // Get history from DB
        const history = await prisma.revenueHistory.findMany({
            orderBy: [{ year: "desc" }, { month: "desc" }],
            take: months,
        });

        // If no history, generate from current data
        if (history.length === 0) {
            const currentDate = new Date();
            const currentData = await generateCurrentMonthData();

            // Create current month entry
            await prisma.revenueHistory.upsert({
                where: {
                    year_month: {
                        year: currentDate.getFullYear(),
                        month: currentDate.getMonth() + 1,
                    },
                },
                create: {
                    year: currentDate.getFullYear(),
                    month: currentDate.getMonth() + 1,
                    ...currentData,
                },
                update: currentData,
            });

            return NextResponse.json({
                success: true,
                data: [{
                    year: currentDate.getFullYear(),
                    month: currentDate.getMonth() + 1,
                    ...currentData,
                }],
            });
        }

        return NextResponse.json({ success: true, data: history.reverse() });
    } catch (error) {
        console.error("History API Error:", error);
        return NextResponse.json(
            { success: false, error: "Error obteniendo historial" },
            { status: 500 }
        );
    }
}

// POST - Record current month snapshot
export async function POST(request: NextRequest) {
    try {
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;

        const currentData = await generateCurrentMonthData();

        const record = await prisma.revenueHistory.upsert({
            where: {
                year_month: { year, month },
            },
            create: {
                year,
                month,
                ...currentData,
            },
            update: currentData,
        });

        return NextResponse.json({ success: true, data: record });
    } catch (error) {
        console.error("History POST Error:", error);
        return NextResponse.json(
            { success: false, error: "Error guardando historial" },
            { status: 500 }
        );
    }
}

async function generateCurrentMonthData() {
    // Get current counts
    const [clientCount, vpsCount, serviceCount, payments] = await Promise.all([
        prisma.client.count({ where: { isActive: true } }),
        prisma.vPS.count(),
        prisma.service.count(),
        prisma.payment.findMany({
            where: {
                date: {
                    gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                },
                status: "completed",
            },
        }),
    ]);

    // Calculate revenue from payments this month
    const revenue = payments.reduce((sum, p) => sum + p.amount, 0);

    // Calculate expected revenue from all active clients
    const clients = await prisma.client.findMany({
        where: { isActive: true },
        include: {
            vpsList: true,
            services: true,
        },
    });

    const expectedRevenue = clients.reduce((sum, c) => {
        const vpsCost = c.vpsList.reduce((s, v) => s + (v.monthlyCost || 0), 0);
        const serviceCost = c.services.reduce((s, svc) => s + (svc.monthlyCost || 0), 0);
        return sum + (c.monthlyFee || 0) + vpsCost + serviceCost;
    }, 0);

    return {
        revenue: revenue || expectedRevenue,
        expenses: 0, // Can be expanded later
        clients: clientCount,
        vps: vpsCount,
        services: serviceCount,
    };
}
