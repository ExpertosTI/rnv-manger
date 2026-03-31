import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET all VPS from database
export async function GET() {
    try {
        const vpsList = await prisma.vPS.findMany({
            include: {
                client: true,
                services: true,
            },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json({
            success: true,
            data: vpsList,
            count: vpsList.length,
        });
    } catch (error: any) {
        console.error("[VPS API] Error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Unknown error",
        }, { status: 500 });
    }
}
