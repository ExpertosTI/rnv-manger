/**
 * API to import services from DNS records
 * Creates services and links them to VPS by IP address
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// DNS records mapped to services
const DNS_SERVICES = [
    // IP: 85.31.224.232
    { subdomain: "www", ip: "85.31.224.232", type: "web" },
    { subdomain: "thiagosmart", ip: "85.31.224.232", type: "odoo" },
    { subdomain: "dyfsmart", ip: "85.31.224.232", type: "odoo" },
    { subdomain: "soriinails", ip: "85.31.224.232", type: "odoo" },
    { subdomain: "odoo", ip: "85.31.224.232", type: "odoo" },
    { subdomain: "delkilo", ip: "85.31.224.232", type: "odoo" },
    { subdomain: "thiago", ip: "85.31.224.232", type: "odoo" },
    { subdomain: "lakersdisco", ip: "85.31.224.232", type: "odoo" },
    { subdomain: "alcaduarte", ip: "85.31.224.232", type: "odoo" },

    // IP: 86.38.217.170
    { subdomain: "bx", ip: "86.38.217.170", type: "web" },
    { subdomain: "forms", ip: "86.38.217.170", type: "web" },
    { subdomain: "metro", ip: "86.38.217.170", type: "odoo" },
    { subdomain: "hansel", ip: "86.38.217.170", type: "odoo" },
    { subdomain: "evoapi", ip: "86.38.217.170", type: "api" },
    { subdomain: "ai", ip: "86.38.217.170", type: "ai" },
    { subdomain: "henryh", ip: "86.38.217.170", type: "odoo" },
    { subdomain: "ceramicajc", ip: "86.38.217.170", type: "odoo" },
    { subdomain: "clb", ip: "86.38.217.170", type: "odoo" },
    { subdomain: "delkilofood", ip: "86.38.217.170", type: "odoo" },
    { subdomain: "calpad", ip: "86.38.217.170", type: "odoo" },
    { subdomain: "prestanace", ip: "86.38.217.170", type: "web" },
    { subdomain: "blokeempleo", ip: "86.38.217.170", type: "web" },

    // IP: 93.127.217.52
    { subdomain: "rey", ip: "93.127.217.52", type: "odoo" },
    { subdomain: "sp", ip: "93.127.217.52", type: "odoo" },
    { subdomain: "guerrero", ip: "93.127.217.52", type: "odoo" },
    { subdomain: "universal", ip: "93.127.217.52", type: "odoo" },
    { subdomain: "manuelhookah", ip: "93.127.217.52", type: "odoo" },
    { subdomain: "nominarf", ip: "93.127.217.52", type: "odoo" },
    { subdomain: "reyplaza", ip: "93.127.217.52", type: "odoo" },

    // IP: 157.173.210.205
    { subdomain: "mvpflow", ip: "157.173.210.205", type: "web" },
    { subdomain: "cacorojo", ip: "157.173.210.205", type: "odoo" },
    { subdomain: "cueromacho", ip: "157.173.210.205", type: "odoo" },
    { subdomain: "launi", ip: "157.173.210.205", type: "odoo" },
    { subdomain: "naje", ip: "157.173.210.205", type: "odoo" },
    { subdomain: "lagrasa", ip: "157.173.210.205", type: "odoo" },

    // IP: 145.223.126.55
    { subdomain: "ronuimport", ip: "145.223.126.55", type: "odoo" },
    { subdomain: "magile", ip: "145.223.126.55", type: "odoo" },
    { subdomain: "camuflaje", ip: "145.223.126.55", type: "odoo" },
    { subdomain: "chatce", ip: "145.223.126.55", type: "web" },
    { subdomain: "tarjetaroja", ip: "145.223.126.55", type: "odoo" },
    { subdomain: "heredia", ip: "145.223.126.55", type: "odoo" },
    { subdomain: "pim", ip: "145.223.126.55", type: "odoo" },
    { subdomain: "easymovil", ip: "145.223.126.55", type: "odoo" },
    { subdomain: "disttineo", ip: "145.223.126.55", type: "odoo" },

    // IP: 45.9.191.18
    { subdomain: "yeurismart", ip: "45.9.191.18", type: "odoo" },
    { subdomain: "app", ip: "45.9.191.18", type: "web" },

    // IP: 86.38.204.237
    { subdomain: "mojo", ip: "86.38.204.237", type: "odoo" },
    { subdomain: "limytech", ip: "86.38.204.237", type: "odoo" },
    { subdomain: "fullbloke", ip: "86.38.204.237", type: "odoo" },

    // IP: 31.97.145.41
    { subdomain: "miniio", ip: "31.97.145.41", type: "storage" },
    { subdomain: "webhook", ip: "31.97.145.41", type: "api" },
    { subdomain: "flowise", ip: "31.97.145.41", type: "ai" },
    { subdomain: "supabase", ip: "31.97.145.41", type: "database" },
    { subdomain: "miniios3", ip: "31.97.145.41", type: "storage" },

    // IP: 129.222.118.53
    { subdomain: "cloud", ip: "129.222.118.53", type: "storage" },

    // IP: 217.15.168.218
    { subdomain: "nac", ip: "217.15.168.218", type: "web" },
];

export async function GET() {
    // Return current services grouped by VPS
    const services = await prisma.service.findMany({
        include: {
            vps: { select: { id: true, name: true, ipAddress: true } },
        },
        orderBy: { createdAt: "desc" },
    });

    const byVps = services.reduce((acc: any, svc) => {
        const vpsKey = svc.vps?.ipAddress || "unassigned";
        if (!acc[vpsKey]) acc[vpsKey] = [];
        acc[vpsKey].push(svc);
        return acc;
    }, {});

    return NextResponse.json({ success: true, data: services, byVps, count: services.length });
}

export async function POST() {
    const results = {
        created: 0,
        skipped: 0,
        errors: [] as string[],
        vpsNotFound: [] as string[],
    };

    for (const dns of DNS_SERVICES) {
        try {
            // Find VPS by IP
            const vps = await prisma.vPS.findFirst({
                where: { ipAddress: dns.ip },
            });

            if (!vps) {
                if (!results.vpsNotFound.includes(dns.ip)) {
                    results.vpsNotFound.push(dns.ip);
                }
                continue;
            }

            // Check if service already exists
            const existing = await prisma.service.findFirst({
                where: {
                    name: dns.subdomain,
                    vpsId: vps.id,
                },
            });

            if (existing) {
                results.skipped++;
                continue;
            }

            // Create service
            await prisma.service.create({
                data: {
                    name: dns.subdomain,
                    type: dns.type,
                    url: `https://${dns.subdomain}.renace.tech`,
                    vpsId: vps.id,
                    status: "running",
                },
            });

            results.created++;
        } catch (error: any) {
            results.errors.push(`${dns.subdomain}: ${error.message}`);
        }
    }

    return NextResponse.json({
        success: true,
        message: `Created ${results.created} services, skipped ${results.skipped} existing`,
        ...results,
    });
}
