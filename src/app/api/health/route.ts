/**
 * Health Check API
 * GET: Check service health or get summary
 * POST: Run health check on all services
 */

import { NextRequest, NextResponse } from "next/server";
import { checkService, checkAllServices, getHealthSummary } from "@/lib/healthcheck";

// GET: Get health summary or check single service
export async function GET(request: NextRequest) {
    const serviceId = request.nextUrl.searchParams.get("serviceId");

    if (serviceId) {
        // Check single service
        const result = await checkService(serviceId);
        return NextResponse.json({ success: true, data: result });
    }

    // Get summary
    const summary = await getHealthSummary();
    return NextResponse.json({ success: true, data: summary });
}

// POST: Run health check on all services
export async function POST() {
    try {
        const results = await checkAllServices();

        const summary = {
            checked: results.length,
            online: results.filter(r => r.status === "online").length,
            offline: results.filter(r => r.status === "offline").length,
            unknown: results.filter(r => r.status === "unknown").length,
        };

        return NextResponse.json({
            success: true,
            summary,
            results,
        });
    } catch (error: any) {
        console.error("Health check error:", error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
