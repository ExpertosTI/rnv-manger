import { NextRequest, NextResponse } from "next/server";
import { getHostingerVPSList, invalidateVPSCache, HostingerVPS } from "@/lib/hostinger";
import prisma from "@/lib/prisma";

export interface TransformedVPS {
    id: string;
    name: string;
    ipAddress: string;
    provider: string;
    hostingerId: string;
    status: string;
    os: string;
    plan: string;
    datacenter: string;
    cpus?: number;
    memory?: number;
    disk?: number;
    createdAt?: string;
}

function transformVPS(vps: HostingerVPS): TransformedVPS {
    return {
        id: String(vps.id),
        name: vps.hostname || `VPS-${vps.id}`,
        ipAddress: vps.ipv4?.[0]?.address || "N/A",
        provider: "Hostinger",
        hostingerId: String(vps.id),
        status: vps.state?.toLowerCase() || "unknown",
        os: vps.template?.name || "Linux",
        plan: vps.plan?.name || "VPS",
        datacenter: vps.data_center?.location || vps.data_center?.name || "Unknown",
        cpus: vps.cpus,
        memory: vps.memory,
        disk: vps.disk,
        createdAt: vps.created_at,
    };
}

export async function GET(request: NextRequest) {
    const startTime = Date.now();
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";

    try {
        if (forceRefresh) {
            invalidateVPSCache();
        }

        let vpsList: HostingerVPS[] = [];

        try {
            vpsList = await getHostingerVPSList(forceRefresh);

            // Sync with Database
            if (vpsList.length > 0) {
                console.log(`Syncing ${vpsList.length} VPS to database...`);
                for (const vps of vpsList) {
                    const transformed = transformVPS(vps);
                    await prisma.vPS.upsert({
                        where: { id: transformed.id },
                        update: {
                            name: transformed.name,
                            ipAddress: transformed.ipAddress,
                            hostingerId: transformed.hostingerId,
                        },
                        create: {
                            id: transformed.id,
                            name: transformed.name,
                            ipAddress: transformed.ipAddress,
                            hostingerId: transformed.hostingerId,
                            provider: "Hostinger",
                        },
                    });
                }
            }
        } catch (apiError) {
            console.error("❌ Hostinger API Error, falling back to DB:", apiError);
        }

        // Always try to get the latest from DB if API failed or for consistent ID mapping
        const dbServers = await prisma.vPS.findMany({
            where: { provider: "Hostinger" }
        });

        const transformedList = vpsList.length > 0
            ? vpsList.map(transformVPS)
            : dbServers.map((dbVps: any) => ({
                id: dbVps.id,
                name: dbVps.name,
                ipAddress: dbVps.ipAddress,
                provider: dbVps.provider,
                hostingerId: dbVps.hostingerId || "",
                status: "unknown", // DB doesn't store volatile status yet
                os: "Ubuntu",
                plan: "KVM",
                datacenter: "Unknown"
            }));

        const duration = Date.now() - startTime;
        return NextResponse.json({
            success: true,
            data: transformedList,
            count: transformedList.length,
            cached: !forceRefresh && vpsList.length > 0,
            fallback: vpsList.length === 0,
            duration: `${duration}ms`,
        });
    } catch (error: any) {
        const duration = Date.now() - startTime;
        console.error(`⚠️ VPS API critical error:`, error.message);
        return NextResponse.json({
            success: false,
            error: error.message,
            duration: `${duration}ms`,
        }, { status: 500 });
    }
}

export async function POST() {
    try {
        invalidateVPSCache();
        return NextResponse.json({
            success: true,
            message: "Cache invalidated successfully",
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message,
        }, { status: 500 });
    }
}

