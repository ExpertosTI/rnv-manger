/**
 * Odoo Sync Module
 * Provides silent synchronization of clients/partners between Odoo and local database
 */

import { OdooClient } from "./client";
import prisma from "@/lib/prisma";
import type { Client, VPS, Service, Payment } from "@prisma/client";

// Type for Odoo Partner response
interface OdooPartnerData {
    id: number;
    name: string;
    email?: string | false;
    phone?: string | false;
    vat?: string | false;
    street?: string | false;
    city?: string | false;
    country_id?: [number, string] | false;
    company_type?: string;
}

export interface SyncResult {
    success: boolean;
    synced: number;
    created: number;
    updated: number;
    errors: string[];
}

/**
 * Sync partners from Odoo to local database
 * Creates new clients or updates existing ones based on odooPartnerId
 */
export async function syncOdooPartners(): Promise<SyncResult> {
    const result: SyncResult = {
        success: false,
        synced: 0,
        created: 0,
        updated: 0,
        errors: [],
    };

    try {
        const odoo = new OdooClient();
        await odoo.authenticate();

        // Fetch partners from Odoo (customers only)
        const partners: OdooPartnerData[] = await odoo.searchRead(
            "res.partner",
            [["customer_rank", ">", 0]],
            ["id", "name", "email", "phone", "vat", "street", "city", "country_id", "company_type"],
            100
        );

        console.log(`[Odoo Sync] Found ${partners?.length || 0} partners in Odoo`);

        // Guard against null/undefined response
        if (!partners || !Array.isArray(partners) || partners.length === 0) {
            result.success = true;
            console.log("[Odoo Sync] No partners to sync");
            return result;
        }

        for (const partner of partners) {
            try {
                // Check if client exists by odooPartnerId
                const existingClient = await prisma.client.findFirst({
                    where: { odooPartnerId: partner.id },
                });

                const odooData = {
                    vat: partner.vat || null,
                    street: partner.street || null,
                    city: partner.city || null,
                    country: partner.country_id ? partner.country_id[1] : null,
                    companyType: partner.company_type || "person",
                };

                if (existingClient) {
                    // Update existing client
                    await prisma.client.update({
                        where: { id: existingClient.id },
                        data: {
                            name: partner.name,
                            email: partner.email || existingClient.email,
                            phone: partner.phone || existingClient.phone,
                            odooData: odooData,
                            odooLastSync: new Date(),
                        },
                    });
                    result.updated++;
                } else {
                    // Create new client
                    await prisma.client.create({
                        data: {
                            name: partner.name,
                            email: partner.email || null,
                            phone: partner.phone || null,
                            odooPartnerId: partner.id,
                            odooData: odooData,
                            odooLastSync: new Date(),
                        },
                    });
                    result.created++;
                }
                result.synced++;
            } catch (partnerError: any) {
                result.errors.push(`Partner ${partner.id}: ${partnerError.message}`);
            }
        }

        result.success = true;
        console.log(`[Odoo Sync] Completed: ${result.created} created, ${result.updated} updated`);
    } catch (error: any) {
        result.errors.push(error.message);
        console.error("[Odoo Sync] Failed:", error.message);
    }

    return result;
}

/**
 * Sync a single client to Odoo (create or update partner)
 */
export async function syncClientToOdoo(clientId: string): Promise<{ success: boolean; partnerId?: number; error?: string }> {
    try {
        const client = await prisma.client.findUnique({
            where: { id: clientId },
        });

        if (!client) {
            return { success: false, error: "Client not found" };
        }

        const odoo = new OdooClient();
        await odoo.authenticate();

        const partnerData = {
            name: client.name,
            email: client.email || false,
            phone: client.phone || false,
            customer_rank: 1,
        };

        let partnerId: number;

        if (client.odooPartnerId) {
            // Update existing partner
            await odoo.execute("res.partner", "write", [[client.odooPartnerId], partnerData]);
            partnerId = client.odooPartnerId;
        } else {
            // Create new partner
            partnerId = await odoo.execute("res.partner", "create", [partnerData]) as number;
        }

        // Update local client with Odoo reference
        await prisma.client.update({
            where: { id: clientId },
            data: {
                odooPartnerId: partnerId,
                odooLastSync: new Date(),
            },
        });

        return { success: true, partnerId };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Get client data merged with costs calculation
 */
export async function getClientWithCosts(clientId: string) {
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        include: {
            vpsList: {
                include: { services: true },
            },
            services: true,
            payments: {
                orderBy: { date: "desc" },
                take: 10,
            },
        },
    });

    if (!client) return null;

    // Calculate total monthly cost
    const vpsCosts = client.vpsList.reduce((sum: number, vps: VPS) => sum + (vps.monthlyCost || 0), 0);
    const serviceCosts = client.services.reduce((sum: number, service: Service) => sum + (service.monthlyCost || 0), 0);
    const totalMonthlyCost = vpsCosts + serviceCosts + (client.monthlyFee || 0);

    return {
        ...client,
        calculatedMonthlyCost: totalMonthlyCost,
        vpsCosts,
        serviceCosts,
    };
}

/**
 * Background sync - call periodically
 */
let lastSyncTime = 0;
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

export async function backgroundSync(): Promise<void> {
    const now = Date.now();
    if (now - lastSyncTime < SYNC_INTERVAL) {
        return; // Skip if synced recently
    }

    lastSyncTime = now;
    console.log("[Odoo Sync] Running background sync...");
    await syncOdooPartners();
}
