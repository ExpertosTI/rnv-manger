/**
 * Health Check Library
 * Verifies service availability via HTTP/TCP checks
 */

import prisma from "@/lib/prisma";

export interface HealthCheckResult {
    serviceId: string;
    serviceName: string;
    status: "online" | "offline" | "unknown";
    responseTime?: number;
    lastChecked: Date;
    error?: string;
}

/**
 * Perform HTTP health check on a URL
 */
export async function checkHttpHealth(url: string, timeout = 5000): Promise<{ status: boolean; responseTime: number; error?: string }> {
    const start = Date.now();

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
            method: "GET",
            signal: controller.signal,
            headers: { "User-Agent": "RNV-HealthCheck/1.0" },
        });

        clearTimeout(timeoutId);
        const responseTime = Date.now() - start;

        return {
            status: response.ok || response.status < 500,
            responseTime,
        };
    } catch (error: any) {
        return {
            status: false,
            responseTime: Date.now() - start,
            error: error.message,
        };
    }
}

/**
 * Check a single service
 */
export async function checkService(serviceId: string): Promise<HealthCheckResult> {
    const service = await prisma.service.findUnique({
        where: { id: serviceId },
        include: { vps: true },
    });

    if (!service) {
        return {
            serviceId,
            serviceName: "Unknown",
            status: "unknown",
            lastChecked: new Date(),
            error: "Service not found",
        };
    }

    // If service has URL, check it
    if (service.url) {
        const result = await checkHttpHealth(service.url);

        const status = result.status ? "online" : "offline";

        // Update service status in database
        await prisma.service.update({
            where: { id: serviceId },
            data: {
                status,
                lastChecked: new Date(),
            },
        });

        return {
            serviceId,
            serviceName: service.name,
            status,
            responseTime: result.responseTime,
            lastChecked: new Date(),
            error: result.error,
        };
    }

    // If no URL, try to construct one from VPS IP + port
    if (service.vps && service.port) {
        const url = `http://${service.vps.ipAddress}:${service.port}`;
        const result = await checkHttpHealth(url, 3000);

        const status = result.status ? "online" : "offline";

        await prisma.service.update({
            where: { id: serviceId },
            data: {
                status,
                lastChecked: new Date(),
            },
        });

        return {
            serviceId,
            serviceName: service.name,
            status,
            responseTime: result.responseTime,
            lastChecked: new Date(),
            error: result.error,
        };
    }

    // No way to check
    return {
        serviceId,
        serviceName: service.name,
        status: "unknown",
        lastChecked: new Date(),
        error: "No URL or port configured",
    };
}

/**
 * Check all services
 */
export async function checkAllServices(): Promise<HealthCheckResult[]> {
    const services = await prisma.service.findMany({
        where: {
            OR: [
                { url: { not: null } },
                { port: { not: null } },
            ],
        },
    });

    const results: HealthCheckResult[] = [];

    for (const service of services) {
        const result = await checkService(service.id);
        results.push(result);
    }

    return results;
}

/**
 * Get health summary
 */
export async function getHealthSummary(): Promise<{
    total: number;
    online: number;
    offline: number;
    unknown: number;
    lastCheck: Date;
}> {
    const services = await prisma.service.findMany({
        select: { status: true, lastChecked: true },
    });

    const online = services.filter(s => s.status === "online" || s.status === "running").length;
    const offline = services.filter(s => s.status === "offline" || s.status === "stopped").length;
    const unknown = services.filter(s => s.status === "unknown" || !s.status).length;

    const lastCheckDates = services
        .filter(s => s.lastChecked)
        .map(s => s.lastChecked!.getTime());

    return {
        total: services.length,
        online,
        offline,
        unknown,
        lastCheck: lastCheckDates.length > 0
            ? new Date(Math.max(...lastCheckDates))
            : new Date(),
    };
}
