/**
 * AI Function Handlers
 * Implementación de las funciones que la AI puede ejecutar
 */

import prisma from "@/lib/prisma";
import { exec } from "child_process";
import os from "os";
import fs from "fs";
import path from "path";

// Type definitions
interface CreateClientArgs {
    name: string;
    email?: string;
    phone?: string;
    companyName?: string;
    monthlyFee?: number;
}

interface RegisterPaymentArgs {
    clientName: string;
    amount: number;
    currency?: string;
    notes?: string;
}

interface SearchPaymentsArgs {
    clientName?: string;
    status?: string;
    minAmount?: number;
    maxAmount?: number;
    fromDate?: string;
    toDate?: string;
    limit?: number;
}

interface UpdatePaymentArgs {
    paymentId: string;
    amount?: number;
    currency?: string;
    date?: string;
    status?: string;
    notes?: string;
    reason?: string;
}

interface SearchClientArgs {
    query: string;
}

interface GetClientStatusArgs {
    clientName: string;
}

interface GetFinancialSummaryArgs {
    month?: number;
    year?: number;
}

interface CreateInvoiceOdooArgs {
    clientName: string;
    amount: number;
    description: string;
}

interface DeleteClientArgs {
    clientName: string;
}

interface AssignServiceArgs {
    clientName: string;
    serviceName: string;
    serviceId?: string;
    amount: number;
}

interface SetBillingDateArgs {
    clientName: string;
    billingDay: number;
}

interface ListPendingPaymentsArgs {
    clientName?: string;
    limit?: number;
}

interface AddExpenseArgs {
    entityType: "vps" | "service";
    entityId: string;
    amount: number;
    description: string;
    category?: string;
    provider?: string;
    pin?: string;
}

interface SearchExpensesArgs {
    entityType: "vps" | "service";
    entityId: string;
}

interface CheckVpsStatusArgs {
    vpsId: string;
}

interface ExecuteBashCommandArgs {
    command: string;
    pin?: string;
}

interface SaveMemoryArgs {
    type: string;
    content: string;
}

interface LinkServiceArgs {
    serviceName: string;
    vpsName: string;
}

interface ChangeBillingCycleArgs {
    clientName: string;
    cycle: string;
    autoRenew?: boolean;
}

function execPromise(command: string): Promise<{ stdout: string, stderr: string }> {
    return new Promise((resolve) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                resolve({ stdout, stderr: error.message });
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isPositiveNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function parseDateValue(value: unknown): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }
    if (!isNonEmptyString(value)) {
        return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeError(error: any, fallback: string) {
    const message = error?.message || "";
    const normalized = message.toLowerCase();
    const dbDown = normalized.includes("can't reach database server")
        || normalized.includes("database server")
        || normalized.includes("p1001")
        || normalized.includes("econnrefused")
        || normalized.includes("connection refused");
    if (dbDown) {
        return "Base de datos no disponible. Inicia PostgreSQL o Docker Desktop.";
    }
    return message || fallback;
}

const allowedPaymentStatus = new Set(["pending", "completed", "failed"]);
const allowedCurrencies = new Set(["USD", "EUR", "DOP"]);

// Helper: Buscar cliente por nombre (fuzzy search)
async function findClientByName(name: string) {
    const clients = await prisma.client.findMany({
        where: {
            OR: [
                { name: { contains: name, mode: "insensitive" } },
                { companyName: { contains: name, mode: "insensitive" } },
                { email: { contains: name, mode: "insensitive" } }
            ]
        },
        take: 1
    });
    return clients[0] || null;
}

/**
 * 1. Crear Cliente
 */
export async function createClient(args: CreateClientArgs) {
    try {
        if (!isNonEmptyString(args.name)) {
            return { success: false, error: "Nombre de cliente inválido" };
        }
        const client = await prisma.client.create({
            data: {
                name: args.name.trim(),
                email: args.email || null,
                phone: args.phone || null,
                companyName: args.companyName || null,
                monthlyFee: args.monthlyFee || 0,
            }
        });

        return {
            success: true,
            data: {
                id: client.id,
                name: client.name,
                email: client.email,
                monthlyFee: client.monthlyFee
            },
            message: `Cliente "${client.name}" creado exitosamente con ID ${client.id.slice(0, 8)}`
        };
    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al crear cliente")
        };
    }
}

/**
 * 2. Registrar Pago
 */
export async function registerPayment(args: RegisterPaymentArgs) {
    try {
        if (!isNonEmptyString(args.clientName)) {
            return { success: false, error: "Nombre de cliente inválido" };
        }
        if (!isPositiveNumber(args.amount)) {
            return { success: false, error: "Monto inválido" };
        }
        if (args.currency && !allowedCurrencies.has(args.currency)) {
            return { success: false, error: "Moneda inválida" };
        }
        // Buscar cliente
        const client = await findClientByName(args.clientName);
        if (!client) {
            return {
                success: false,
                error: `No se encontró el cliente "${args.clientName}". ¿Quieres que lo cree primero?`
            };
        }

        // Crear pago
        const payment = await prisma.payment.create({
            data: {
                clientId: client.id,
                amount: args.amount,
                currency: args.currency || "USD",
                notes: args.notes || null,
                status: "completed"
            }
        });

        return {
            success: true,
            data: {
                id: payment.id,
                amount: payment.amount,
                currency: payment.currency,
                clientName: client.name
            },
            message: `Pago de ${args.currency || "USD"} $${args.amount} registrado para ${client.name}`
        };
    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al registrar pago")
        };
    }
}

export async function searchPayments(args: SearchPaymentsArgs) {
    try {
        if (args.status && !allowedPaymentStatus.has(args.status)) {
            return { success: false, error: "Estado inválido" };
        }
        if (args.minAmount !== undefined && (!Number.isFinite(args.minAmount) || args.minAmount < 0)) {
            return { success: false, error: "Monto mínimo inválido" };
        }
        if (args.maxAmount !== undefined && (!Number.isFinite(args.maxAmount) || args.maxAmount < 0)) {
            return { success: false, error: "Monto máximo inválido" };
        }
        const fromDate = parseDateValue(args.fromDate);
        const toDate = parseDateValue(args.toDate);
        if (args.fromDate && !fromDate) {
            return { success: false, error: "Fecha desde inválida" };
        }
        if (args.toDate && !toDate) {
            return { success: false, error: "Fecha hasta inválida" };
        }

        let client = null;
        if (isNonEmptyString(args.clientName)) {
            client = await findClientByName(args.clientName);
            if (!client) {
                return {
                    success: false,
                    error: `No se encontró el cliente "${args.clientName}"`
                };
            }
        }

        const whereClause: any = {};
        if (client) {
            whereClause.clientId = client.id;
        }
        if (args.status) {
            whereClause.status = args.status;
        }
        if (args.minAmount !== undefined || args.maxAmount !== undefined) {
            whereClause.amount = {};
            if (args.minAmount !== undefined) {
                whereClause.amount.gte = args.minAmount;
            }
            if (args.maxAmount !== undefined) {
                whereClause.amount.lte = args.maxAmount;
            }
        }
        if (fromDate || toDate) {
            whereClause.date = {};
            if (fromDate) {
                whereClause.date.gte = fromDate;
            }
            if (toDate) {
                whereClause.date.lte = toDate;
            }
        }

        const limit = args.limit && args.limit > 0 ? Math.min(args.limit, 20) : 5;

        const payments = await prisma.payment.findMany({
            where: whereClause,
            orderBy: { date: "desc" },
            take: limit
        });

        if (payments.length === 0) {
            return {
                success: false,
                message: client ? `No hay pagos para "${client.name}" con esos criterios` : "No hay pagos con esos criterios"
            };
        }

        return {
            success: true,
            data: payments.map(p => ({
                id: p.id,
                amount: p.amount,
                currency: p.currency,
                date: p.date,
                status: p.status,
                notes: p.notes
            })),
            message: client ? `Encontrados ${payments.length} pago(s) de ${client.name}` : `Encontrados ${payments.length} pago(s)`
        };
    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al buscar pagos")
        };
    }
}

export async function updatePayment(args: UpdatePaymentArgs) {
    try {
        if (!isNonEmptyString(args.paymentId)) {
            return { success: false, error: "paymentId inválido" };
        }
        if (args.amount !== undefined && !isPositiveNumber(args.amount)) {
            return { success: false, error: "Monto inválido" };
        }
        if (args.currency && !allowedCurrencies.has(args.currency)) {
            return { success: false, error: "Moneda inválida" };
        }
        if (args.status && !allowedPaymentStatus.has(args.status)) {
            return { success: false, error: "Estado inválido" };
        }

        const parsedDate = args.date ? parseDateValue(args.date) : null;
        if (args.date && !parsedDate) {
            return { success: false, error: "Fecha inválida" };
        }

        const updateData: any = {};
        if (args.amount !== undefined) updateData.amount = args.amount;
        if (args.currency !== undefined) updateData.currency = args.currency;
        if (parsedDate) updateData.date = parsedDate;
        if (args.status !== undefined) updateData.status = args.status;
        if (args.notes !== undefined) updateData.notes = args.notes || null;

        if (Object.keys(updateData).length === 0) {
            return { success: false, error: "No hay campos para actualizar" };
        }

        const existing = await prisma.payment.findUnique({
            where: { id: args.paymentId }
        });

        if (!existing) {
            return { success: false, error: "Pago no encontrado" };
        }

        const previousData = {
            amount: existing.amount,
            currency: existing.currency,
            date: existing.date,
            status: existing.status,
            notes: existing.notes
        };
        const newData = {
            amount: updateData.amount ?? existing.amount,
            currency: updateData.currency ?? existing.currency,
            date: updateData.date ?? existing.date,
            status: updateData.status ?? existing.status,
            notes: updateData.notes ?? existing.notes
        };

        const payment = await prisma.$transaction(async (tx) => {
            const updated = await tx.payment.update({
                where: { id: args.paymentId },
                data: updateData
            });
            await tx.paymentAudit.create({
                data: {
                    paymentId: updated.id,
                    changedBy: "ai",
                    previousData,
                    newData,
                    reason: args.reason || null
                }
            });
            return updated;
        });

        return {
            success: true,
            data: {
                id: payment.id,
                amount: payment.amount,
                currency: payment.currency,
                date: payment.date,
                status: payment.status,
                notes: payment.notes
            },
            message: `Pago ${payment.id.slice(0, 8)} actualizado con auditoría`
        };
    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al actualizar pago")
        };
    }
}

/**
 * 3. Buscar Cliente
 */
export async function searchClient(args: SearchClientArgs) {
    try {
        if (!isNonEmptyString(args.query)) {
            return { success: false, error: "Búsqueda inválida" };
        }
        const clients = await prisma.client.findMany({
            where: {
                OR: [
                    { name: { contains: args.query, mode: "insensitive" } },
                    { email: { contains: args.query, mode: "insensitive" } },
                    { companyName: { contains: args.query, mode: "insensitive" } }
                ]
            },
            include: {
                _count: {
                    select: {
                        payments: true,
                        services: true,
                        vpsList: true
                    }
                }
            },
            take: 5
        });

        if (clients.length === 0) {
            return {
                success: false,
                message: `No se encontraron clientes con "${args.query}"`
            };
        }

        return {
            success: true,
            data: clients.map(c => ({
                id: c.id,
                name: c.name,
                email: c.email,
                companyName: c.companyName,
                monthlyFee: c.monthlyFee,
                stats: {
                    payments: c._count.payments,
                    services: c._count.services,
                    vps: c._count.vpsList
                }
            })),
            message: `Encontrados ${clients.length} cliente(s)`
        };
    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al buscar cliente")
        };
    }
}

/**
 * 4. Listar Clientes Activos
 */
export async function listActiveClients() {
    try {
        const clients = await prisma.client.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                companyName: true,
                monthlyFee: true,
                _count: {
                    select: {
                        vpsList: true,
                        services: true,
                        payments: true
                    }
                }
            },
            orderBy: { createdAt: "desc" },
            take: 20
        });

        const total = await prisma.client.count({ where: { isActive: true } });
        const totalRevenue = clients.reduce((sum, c) => sum + c.monthlyFee, 0);

        return {
            success: true,
            data: {
                clients: clients.map(c => ({
                    id: c.id.slice(0, 8),
                    name: c.name,
                    company: c.companyName,
                    monthlyFee: c.monthlyFee,
                    vpsCount: c._count.vpsList,
                    servicesCount: c._count.services,
                    paymentsCount: c._count.payments
                })),
                summary: {
                    total,
                    showing: clients.length,
                    totalMonthlyRevenue: totalRevenue
                }
            },
            message: `${total} clientes activos con ingresos mensuales de $${totalRevenue}`
        };
    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al listar clientes")
        };
    }
}

/**
 * 5. Obtener Estado de Cliente
 */
export async function getClientStatus(args: GetClientStatusArgs) {
    try {
        if (!isNonEmptyString(args.clientName)) {
            return { success: false, error: "Nombre de cliente inválido" };
        }
        const client = await findClientByName(args.clientName);
        if (!client) {
            return {
                success: false,
                error: `Cliente "${args.clientName}" no encontrado`
            };
        }

        const fullClient = await prisma.client.findUnique({
            where: { id: client.id },
            include: {
                vpsList: {
                    include: { vps: true }
                },
                services: true,
                payments: {
                    orderBy: { date: "desc" },
                    take: 5
                }
            }
        });

        if (!fullClient) {
            return { success: false, error: "Cliente no encontrado" };
        }

        const totalPaid = fullClient.payments.reduce((sum, p) => sum + p.amount, 0);
        const vpsCost = fullClient.vpsList.reduce((sum, cv) => sum + (cv.vps?.monthlyCost || 0), 0);
        const servicesCost = fullClient.services.reduce((sum, s) => sum + (s.monthlyCost || 0), 0);

        return {
            success: true,
            data: {
                name: fullClient.name,
                email: fullClient.email,
                monthlyFee: fullClient.monthlyFee,
                totalMonthlyCost: vpsCost + servicesCost + fullClient.monthlyFee,
                vpsCount: fullClient.vpsList.length,
                servicesCount: fullClient.services.length,
                totalPaid,
                lastPayment: fullClient.payments[0] ? {
                    amount: fullClient.payments[0].amount,
                    date: fullClient.payments[0].date
                } : null
            }
        };
    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al obtener estado del cliente")
        };
    }
}

/**
 * 6. Actualizar Día de Cobro
 */
export async function setBillingDate(args: SetBillingDateArgs) {
    try {
        if (!isNonEmptyString(args.clientName)) {
            return { success: false, error: "Nombre de cliente inválido" };
        }
        if (!Number.isInteger(args.billingDay) || args.billingDay < 1 || args.billingDay > 31) {
            return { success: false, error: "Día de cobro inválido" };
        }

        const client = await findClientByName(args.clientName);
        if (!client) {
            return { success: false, error: `Cliente "${args.clientName}" no encontrado` };
        }

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const day = now.getDate();
        const monthToUse = day <= args.billingDay ? currentMonth : currentMonth + 1;
        const targetYear = monthToUse > 11 ? currentYear + 1 : currentYear;
        const normalizedMonth = monthToUse > 11 ? 0 : monthToUse;
        const daysInMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
        const billingDay = Math.min(args.billingDay, daysInMonth);
        const nextBillingDate = new Date(targetYear, normalizedMonth, billingDay);

        const updated = await prisma.client.update({
            where: { id: client.id },
            data: {
                paymentDay: args.billingDay,
                nextBillingDate
            }
        });

        return {
            success: true,
            data: {
                clientName: updated.name,
                paymentDay: updated.paymentDay,
                nextBillingDate
            },
            message: `Día de cobro actualizado a ${updated.paymentDay} para ${updated.name}`
        };
    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al actualizar día de cobro")
        };
    }
}

/**
 * 7. Pagos Pendientes
 */
export async function listPendingPayments(args: ListPendingPaymentsArgs = {}) {
    try {
        let where: any = { isActive: true };
        if (isNonEmptyString(args.clientName)) {
            const client = await findClientByName(args.clientName);
            if (!client) {
                return { success: false, error: `Cliente "${args.clientName}" no encontrado` };
            }
            where = { id: client.id };
        }

        const today = new Date();
        const currentDay = today.getDate();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const limit = args.limit && args.limit > 0 ? Math.min(args.limit, 20) : 10;

        const clients = await prisma.client.findMany({
            where,
            include: {
                vpsList: { include: { vps: true } },
                services: true,
                payments: {
                    where: { date: { gte: startOfMonth }, status: "completed" },
                    orderBy: { date: "desc" },
                    take: 1
                }
            }
        });

        const pending = clients.map(client => {
            const vpsCost = client.vpsList.reduce((sum, cv) => sum + (cv.vps?.monthlyCost || 0), 0);
            const serviceCost = client.services.reduce((sum, svc) => sum + (svc.monthlyCost || 0), 0);
            const totalMonthlyCost = vpsCost + serviceCost + (client.monthlyFee || 0);
            const lastPayment = client.payments[0];
            const hasPaid = !!lastPayment;
            const isOverdue = currentDay > (client.paymentDay || 1) && !hasPaid;
            const amountDue = totalMonthlyCost;
            return {
                id: client.id,
                name: client.name,
                paymentDay: client.paymentDay,
                totalMonthlyCost,
                amountDue,
                lastPaymentDate: lastPayment?.date || null,
                overdue: isOverdue
            };
        }).filter(item => item.overdue);

        const result = pending.slice(0, limit);

        if (result.length === 0) {
            return { success: false, message: "No hay pagos pendientes" };
        }

        return {
            success: true,
            data: result,
            message: `Encontrados ${result.length} pagos pendientes`
        };
    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al listar pagos pendientes")
        };
    }
}

/**
 * 8. Resumen Financiero
 */
export async function getFinancialSummary(args: GetFinancialSummaryArgs) {
    try {
        const now = new Date();
        const targetMonth = args.month || (now.getMonth() + 1);
        const targetYear = args.year || now.getFullYear();

        if (!Number.isInteger(targetMonth) || targetMonth < 1 || targetMonth > 12) {
            return { success: false, error: "Mes inválido" };
        }
        if (!Number.isInteger(targetYear) || targetYear < 2000) {
            return { success: false, error: "Año inválido" };
        }

        // Pagos del mes
        const startDate = new Date(targetYear, targetMonth - 1, 1);
        const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

        const payments = await prisma.payment.findMany({
            where: {
                date: {
                    gte: startDate,
                    lte: endDate
                }
            }
        });

        const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

        // Clientes y VPS activos
        const activeClients = await prisma.client.count({ where: { isActive: true } });
        const activeVPS = await prisma.vPS.count();

        // Costos de VPS
        const vpsData = await prisma.vPS.findMany({ select: { monthlyCost: true } });
        const totalVPSCost = vpsData.reduce((sum, v) => sum + v.monthlyCost, 0);

        return {
            success: true,
            data: {
                period: `${targetMonth}/${targetYear}`,
                revenue: totalRevenue,
                expenses: totalVPSCost,
                profit: totalRevenue - totalVPSCost,
                clients: activeClients,
                vps: activeVPS,
                paymentsCount: payments.length
            }
        };
    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al obtener resumen financiero")
        };
    }
}

/**
 * 7. Listar VPS
 */
export async function listVPS() {
    try {
        const vpsList = await prisma.vPS.findMany({
            select: {
                id: true,
                name: true,
                ipAddress: true,
                provider: true,
                status: true,
                monthlyCost: true,
                _count: {
                    select: {
                        clients: true,
                        services: true
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        });

        return {
            success: true,
            data: vpsList.map(v => ({
                id: v.id.slice(0, 8),
                name: v.name,
                ip: v.ipAddress,
                provider: v.provider,
                status: v.status,
                cost: v.monthlyCost,
                clients: v._count.clients,
                services: v._count.services
            })),
            message: `${vpsList.length} servidores VPS en el sistema`
        };
    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al listar VPS")
        };
    }
}

/**
 * 8. Crear Factura en Odoo (placeholder - requiere integración real)
 */
export async function createInvoiceOdoo(args: CreateInvoiceOdooArgs) {
    try {
        if (!isNonEmptyString(args.clientName)) {
            return { success: false, error: "Nombre de cliente inválido" };
        }
        if (!isPositiveNumber(args.amount)) {
            return { success: false, error: "Monto inválido" };
        }
        if (!isNonEmptyString(args.description)) {
            return { success: false, error: "Descripción inválida" };
        }
        const client = await findClientByName(args.clientName);
        if (!client) {
            return {
                success: false,
                error: `Cliente "${args.clientName}" no encontrado`
            };
        }

        // Integración real con Odoo
        const { getOdooClient } = await import("@/lib/odoo/client");
        const odoo = getOdooClient();

        // 1. Sincronizar cliente con Odoo (buscar o crear)
        const partnerId = await odoo.syncPartner({
            name: client.name,
            email: client.email || undefined,
            phone: client.phone || undefined,
            company_type: client.companyName ? "company" : "person",
            vat: "" // Si tuviéramos RNC/Cedula lo pondríamos aquí
        });

        // 2. Crear factura
        const invoiceId = await odoo.createInvoice(partnerId, [{
            name: args.description,
            quantity: 1,
            price_unit: args.amount
        }]);

        // 3. (Opcional) Enviar por correo inmediatamente si hay email
        if (client.email) {
            try {
                await odoo.sendInvoiceByEmail(invoiceId, [client.email]);
            } catch (e) {
                console.warn("Error enviando factura por correo:", e);
            }
        }

        return {
            success: true,
            data: {
                invoiceId,
                clientName: client.name,
                amount: args.amount,
                description: args.description,
                status: "draft" // Odoo crea en borrador por defecto
            },
            message: `Factura #${invoiceId} creada exitosamente para ${client.name} en Odoo`
        };
    } catch (error: any) {
        console.error("Error creating Odoo invoice:", error);
        return {
            success: false,
            error: normalizeError(error, "Error al crear factura en Odoo")
        };
    }
}

/**
 * 9. Eliminar Cliente
 */
export async function deleteClient(args: DeleteClientArgs) {
    try {
        if (!isNonEmptyString(args.clientName)) {
            return { success: false, error: "Nombre de cliente inválido" };
        }
        const client = await findClientByName(args.clientName);
        if (!client) {
            return { success: false, error: `Cliente "${args.clientName}" no encontrado` };
        }

        await prisma.client.update({
            where: { id: client.id },
            data: { isActive: false }
        });

        return {
            success: true,
            message: `Cliente "${client.name}" ha sido eliminado (desactivado) exitosamente.`
        };
    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al eliminar cliente")
        };
    }
}

/**
 * 10. Asignar Servicio a Cliente
 */
export async function assignServiceToClient(args: AssignServiceArgs) {
    try {
        if (!isNonEmptyString(args.clientName)) {
            return { success: false, error: "Nombre de cliente inválido" };
        }
        if (!isPositiveNumber(args.amount)) {
            return { success: false, error: "Monto inválido" };
        }

        const client = await findClientByName(args.clientName);
        if (!client) {
            return { success: false, error: `Cliente "${args.clientName}" no encontrado` };
        }

        let serviceRec = null;

        // Si viene con ID explícito, lo asignamos si existe
        if (args.serviceId && isNonEmptyString(args.serviceId)) {
            serviceRec = await prisma.service.findUnique({
                where: { id: args.serviceId }
            });

            if (serviceRec) {
                // Actualizamos el servicio para pertenecer a este cliente
                await prisma.service.update({
                    where: { id: serviceRec.id },
                    data: {
                        clientId: client.id,
                        monthlyCost: args.amount,
                        name: args.serviceName || serviceRec.name
                    }
                });
            }
        }

        // Si no se encontró por ID o no venía ID, creamos un nuevo servicio
        if (!serviceRec && isNonEmptyString(args.serviceName)) {
            serviceRec = await prisma.service.create({
                data: {
                    name: args.serviceName,
                    type: "other",
                    clientId: client.id,
                    monthlyCost: args.amount,
                    status: "active"
                }
            });
        }

        const updatedClient = await prisma.client.update({
            where: { id: client.id },
            data: {
                monthlyFee: (client.monthlyFee || 0) + args.amount
            }
        });

        return {
            success: true,
            data: {
                clientName: updatedClient.name,
                newMonthlyFee: updatedClient.monthlyFee,
                serviceAdded: serviceRec?.name,
                costAdded: args.amount
            },
            message: `Servicio "${serviceRec?.name}" ($${args.amount}) asignado exitosamente a "${client.name}". ¡Tu magia ha funcionado!`
        };

    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al asignar servicio")
        };
    }
}

/**
 * 11. Buscar Servicios sin Asignar
 */
export async function listUnassignedServices() {
    try {
        const services = await prisma.service.findMany({
            where: { clientId: null },
            select: {
                id: true,
                name: true,
                type: true,
                monthlyCost: true,
                status: true
            },
            orderBy: { createdAt: "desc" },
            take: 20
        });

        if (services.length === 0) {
            return {
                success: true,
                message: "No hay ningún servicio huérfano (sin asignar) en estos momentos."
            };
        }

        return {
            success: true,
            data: services,
            message: `He encontrado ${services.length} servicios sin cliente asignado.`
        };
    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al listar servicios huérfanos")
        };
    }
}

/**
 * 12. Agregar Gasto / Costo (Protegido por PIN)
 */
export async function addExpense(args: AddExpenseArgs) {
    try {
        if (!isNonEmptyString(args.entityId)) return { success: false, error: "ID de entidad inválido" };
        if (!isPositiveNumber(args.amount)) return { success: false, error: "Monto inválido" };
        if (!isNonEmptyString(args.description)) return { success: false, error: "Descripción inválida" };

        const expectedPin = process.env.MAESTRO_PIN || "1234";

        if (!args.pin || args.pin !== expectedPin) {
            return {
                success: false,
                message: "Falta el Maestro PIN de autorización o es incorrecto. Por favor, usa el bloque :::confirm para solicitar el Maestro PIN al usuario."
            };
        }

        const data: any = {
            amount: args.amount,
            description: args.description,
            category: args.category || "other",
            provider: args.provider,
            date: new Date()
        };

        if (args.entityType === "vps") {
            data.vpsId = args.entityId;
        } else {
            data.serviceId = args.entityId;
        }

        const expense = await prisma.expense.create({ data });

        return {
            success: true,
            data: expense,
            message: `Gasto por $${args.amount} registrado exitosamente para el ${args.entityType === "vps" ? "VPS" : "Servicio"}.`
        };

    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al registrar el gasto")
        };
    }
}

/**
 * 13. Buscar Gastos de un VPS o Servicio
 */
export async function searchExpenses(args: SearchExpensesArgs) {
    try {
        if (!isNonEmptyString(args.entityId)) return { success: false, error: "ID de entidad inválido" };

        const where: any = {};
        if (args.entityType === "vps") {
            where.vpsId = args.entityId;
        } else {
            where.serviceId = args.entityId;
        }

        const expenses = await prisma.expense.findMany({
            where,
            orderBy: { date: 'desc' },
            take: 10
        });

        if (expenses.length === 0) {
            return { success: true, message: "No se encontraron gastos registrados." };
        }

        return {
            success: true,
            data: expenses,
            message: `Se encontraron ${expenses.length} gastos recientes.`
        };
    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al buscar gastos")
        };
    }
}

/**
 * 14. Chequear Estado de VPS (Ping)
 */
export async function checkVpsStatus(args: CheckVpsStatusArgs) {
    try {
        if (!isNonEmptyString(args.vpsId)) return { success: false, error: "ID de VPS inválido" };

        const vps = await prisma.vPS.findUnique({ where: { id: args.vpsId } });
        if (!vps) return { success: false, error: "VPS no encontrado" };
        if (!vps.ipAddress) return { success: false, error: "El VPS no tiene IP asignada para hacer ping" };

        const isWindows = typeof os !== 'undefined' && os.platform() === 'win32';
        const cmd = isWindows ? `ping -n 4 ${vps.ipAddress}` : `ping -c 4 ${vps.ipAddress}`;

        const { stdout } = await execPromise(cmd);
        const isOnline = stdout.toLowerCase().includes("ttl=") || stdout.toLowerCase().includes("tiempo=");

        return {
            success: true,
            data: {
                vpsName: vps.name,
                ip: vps.ipAddress,
                isOnline,
                rawOutput: stdout
            },
            message: isOnline
                ? `✅ El VPS "${vps.name}" (${vps.ipAddress}) está ONLINE y respondiendo al ping.`
                : `❌ El VPS "${vps.name}" (${vps.ipAddress}) parece estar apagado o bloqueando pings (OFFLINE).`
        };

    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al ejecutar el ping")
        };
    }
}

/**
 * 15. Ejecutar Comando Bash Peligroso (Protegido por PIN)
 */
export async function executeBashCommand(args: ExecuteBashCommandArgs) {
    try {
        if (!isNonEmptyString(args.command)) return { success: false, error: "Comando inválido" };

        const expectedPin = process.env.MAESTRO_PIN || "1234";

        if (!args.pin || args.pin !== expectedPin) {
            return {
                success: false,
                message: `Falta el Maestro PIN de autorización o es incorrecto para ejecutar '${args.command}'. Por favor, usa el bloque :::confirm para solicitar el Maestro PIN de seguridad al usuario de forma explícita.`
            };
        }

        const { stdout, stderr } = await execPromise(args.command);

        return {
            success: true,
            data: { stdout, stderr },
            message: `✅ Comando ejecutado con éxito.\n\nSalida:\n\`\`\`bash\n${stdout || stderr || 'Sin salida (ejecución silenciosa)'}\n\`\`\``
        };

    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al ejecutar el comando bash")
        };
    }
}

/**
 * 16. Buscar en la Documentación Offline (Search Docs)
 */
export async function searchDocs() {
    try {
        const root = process.cwd();
        const readmePath = path.join(root, "README.md");
        if (fs.existsSync(readmePath)) {
            const content = fs.readFileSync(readmePath, "utf-8");
            return {
                success: true,
                data: content.substring(0, 2500), // Enviar primeros 2500 chars para no saturar tokens
                message: `✅ Documentación offline cargada con éxito.`
            };
        }
        return {
            success: true,
            data: "No se encontró el archivo README.md local en el entorno.",
            message: "No hay documentación offline disponible en esta build."
        };
    } catch (error: any) {
        return {
            success: false,
            error: normalizeError(error, "Error al leer la documentación")
        };
    }
}

/**
 * 17. Save Memory — Store learned patterns/preferences
 */
export async function saveMemory(args: SaveMemoryArgs) {
    try {
        const { type, content } = args;
        if (!type || !content) {
            return { success: false, error: "type y content son requeridos" };
        }

        // Check for similar existing memory
        const existing = await prisma.aIMemory.findFirst({
            where: {
                content: { contains: content.substring(0, 50), mode: "insensitive" },
                type,
            },
        });

        if (existing) {
            await prisma.aIMemory.update({
                where: { id: existing.id },
                data: { frequency: existing.frequency + 1, lastUsed: new Date(), content },
            });
            return { success: true, message: `Memoria actualizada (frecuencia: ${existing.frequency + 1})` };
        }

        await prisma.aIMemory.create({ data: { type, content } });

        // Cyclic cleanup: keep max 50
        const count = await prisma.aIMemory.count();
        if (count > 50) {
            const oldest = await prisma.aIMemory.findMany({
                orderBy: [{ frequency: "asc" }, { lastUsed: "asc" }],
                take: count - 50,
                select: { id: true },
            });
            await prisma.aIMemory.deleteMany({ where: { id: { in: oldest.map(m => m.id) } } });
        }

        return { success: true, message: "✅ Memoria guardada exitosamente" };
    } catch (error: any) {
        return { success: false, error: normalizeError(error, "Error al guardar memoria") };
    }
}

/**
 * 18. Recall Memories — Retrieve stored memories
 */
export async function recallMemories() {
    try {
        const memories = await prisma.aIMemory.findMany({
            orderBy: [{ frequency: "desc" }, { lastUsed: "desc" }],
            take: 10,
        });
        if (memories.length === 0) {
            return { success: true, data: [], message: "No hay memorias guardadas aún." };
        }
        return {
            success: true,
            data: memories.map(m => ({
                type: m.type,
                content: m.content,
                frequency: m.frequency,
                lastUsed: m.lastUsed,
            })),
            message: `${memories.length} memorias encontradas.`,
        };
    } catch (error: any) {
        return { success: false, error: normalizeError(error, "Error al recuperar memorias") };
    }
}

/**
 * 19. Change Billing Cycle — Update client billing frequency
 */
export async function changeBillingCycle(args: ChangeBillingCycleArgs) {
    try {
        const { clientName, cycle, autoRenew } = args;
        const validCycles = ["monthly", "quarterly", "semiannual", "annual"];
        if (!validCycles.includes(cycle)) {
            return { success: false, error: `Ciclo inválido. Opciones: ${validCycles.join(", ")}` };
        }

        const client = await prisma.client.findFirst({
            where: { name: { contains: clientName, mode: "insensitive" }, isActive: true },
        });
        if (!client) {
            return { success: false, error: `No se encontró el cliente "${clientName}"` };
        }

        // Calculate next billing date based on cycle
        const now = new Date();
        const monthsMap: Record<string, number> = {
            monthly: 1, quarterly: 3, semiannual: 6, annual: 12,
        };
        const nextBilling = new Date(now);
        nextBilling.setMonth(nextBilling.getMonth() + monthsMap[cycle]);

        const updated = await prisma.client.update({
            where: { id: client.id },
            data: {
                billingCycle: cycle,
                nextBillingDate: nextBilling,
                lastBillingDate: now,
                ...(autoRenew !== undefined ? { autoRenew } : {}),
            },
        });

        const cycleLabels: Record<string, string> = {
            monthly: "Mensual", quarterly: "Trimestral", semiannual: "Semestral", annual: "Anual",
        };

        return {
            success: true,
            data: {
                client: updated.name,
                billingCycle: cycleLabels[cycle],
                nextBillingDate: nextBilling.toISOString().split("T")[0],
                autoRenew: updated.autoRenew,
            },
            message: `✅ Ciclo de facturación de **${updated.name}** cambiado a **${cycleLabels[cycle]}**. Próxima facturación: ${nextBilling.toLocaleDateString("es-ES")}.`,
        };
    } catch (error: any) {
        return { success: false, error: normalizeError(error, "Error al cambiar ciclo de facturación") };
    }
}

/**
 * 20. Manage Odoo CRM — Create/search leads and opportunities
 */
export async function manageOdooCrm(args: {
    action: string; name?: string; partnerName?: string; email?: string;
    phone?: string; expectedRevenue?: number; description?: string;
    type?: string; priority?: string; dateDeadline?: string; stages?: string[];
    limit?: number;
}) {
    try {
        const getOdooClient = (await import("@/lib/odoo/client")).default;
        const odoo = getOdooClient();

        if (args.action === "create") {
            if (!args.name) return { success: false, error: "Nombre del lead es requerido" };
            const leadId = await odoo.createLead({
                name: args.name, partnerName: args.partnerName, email: args.email,
                phone: args.phone, expectedRevenue: args.expectedRevenue,
                description: args.description, type: (args.type as any) || "opportunity",
                priority: args.priority, dateDeadline: args.dateDeadline,
            });
            return { success: true, data: { leadId }, message: `✅ Lead **${args.name}** creado en Odoo CRM (#${leadId})` };
        }

        if (args.action === "search") {
            const leads = await odoo.getLeads(args.limit || 10, args.stages);
            return {
                success: true,
                data: leads.map((l: any) => ({
                    id: l.id, name: l.name,
                    partner: l.partner_id?.[1] || l.email_from || "N/A",
                    revenue: l.expected_revenue, stage: l.stage_id?.[1],
                    priority: l.priority, deadline: l.date_deadline,
                })),
                message: `📊 ${leads.length} leads encontrados en CRM`,
            };
        }

        return { success: false, error: "Acción no soportada. Usa 'create' o 'search'." };
    } catch (error: any) {
        return { success: false, error: `Error Odoo CRM: ${error.message}` };
    }
}

/**
 * 21. Manage Odoo Tasks — Create/search project tasks
 */
export async function manageOdooTasks(args: {
    action: string; name?: string; projectName?: string; description?: string;
    dateDeadline?: string; priority?: string; partnerId?: number;
    limit?: number;
}) {
    try {
        const getOdooClient = (await import("@/lib/odoo/client")).default;
        const odoo = getOdooClient();

        if (args.action === "create") {
            if (!args.name) return { success: false, error: "Nombre de la tarea es requerido" };
            const taskId = await odoo.createTask({
                name: args.name, projectName: args.projectName || "Seguimiento Clientes",
                description: args.description, dateDeadline: args.dateDeadline,
                priority: args.priority, partnerId: args.partnerId,
            });
            return { success: true, data: { taskId }, message: `✅ Tarea **${args.name}** creada en Odoo Project (#${taskId})` };
        }

        if (args.action === "search") {
            const tasks = await odoo.getTasks(args.limit || 10, args.projectName);
            return {
                success: true,
                data: tasks.map((t: any) => ({
                    id: t.id, name: t.name,
                    project: t.project_id?.[1], stage: t.stage_id?.[1],
                    deadline: t.date_deadline, priority: t.priority,
                    partner: t.partner_id?.[1],
                })),
                message: `📋 ${tasks.length} tareas encontradas`,
            };
        }

        return { success: false, error: "Acción no soportada. Usa 'create' o 'search'." };
    } catch (error: any) {
        return { success: false, error: `Error Odoo Tasks: ${error.message}` };
    }
}

/**
 * 22. Send Odoo Notification — Send invoice email via Odoo
 */
export async function sendOdooNotification(args: {
    invoiceId?: number; clientName?: string; additionalEmails?: string[];
}) {
    try {
        const getOdooClient = (await import("@/lib/odoo/client")).default;
        const odoo = getOdooClient();

        if (args.invoiceId) {
            const result = await odoo.sendInvoiceByEmail(args.invoiceId, args.additionalEmails);
            if (result.success) {
                return { success: true, message: `📧 Factura #${args.invoiceId} enviada por correo exitosamente` };
            }
            return { success: false, error: result.error };
        }

        if (args.clientName) {
            // Find client's latest invoice
            const partners = await odoo.searchRead("res.partner",
                [["name", "ilike", args.clientName]], ["id", "name"], 1);
            if (!partners.length) return { success: false, error: `No se encontró partner "${args.clientName}" en Odoo` };

            const invoices = await odoo.searchRead("account.move",
                [["partner_id", "=", partners[0].id], ["move_type", "=", "out_invoice"]],
                ["id", "name", "amount_total", "state"], 1);
            if (!invoices.length) return { success: false, error: `No hay facturas para ${args.clientName}` };

            const result = await odoo.sendInvoiceByEmail(invoices[0].id, args.additionalEmails);
            if (result.success) {
                return { success: true, message: `📧 Factura **${invoices[0].name}** ($${invoices[0].amount_total}) enviada a **${partners[0].name}**` };
            }
            return { success: false, error: result.error };
        }

        return { success: false, error: "Se necesita invoiceId o clientName" };
    } catch (error: any) {
        return { success: false, error: `Error al enviar notificación: ${error.message}` };
    }
}

/**
 * 23. Get Odoo Deadlines — Upcoming deadlines from tasks + CRM
 */
export async function getOdooDeadlines(args: { days?: number }) {
    try {
        const getOdooClient = (await import("@/lib/odoo/client")).default;
        const odoo = getOdooClient();
        const { tasks, leads } = await odoo.getUpcomingDeadlines(args.days || 7);

        return {
            success: true,
            data: {
                tasks: tasks.map((t: any) => ({
                    name: t.name, deadline: t.date_deadline,
                    project: t.project_id?.[1], priority: t.priority,
                })),
                leads: leads.map((l: any) => ({
                    name: l.name, deadline: l.date_deadline,
                    revenue: l.expected_revenue, stage: l.stage_id?.[1],
                    partner: l.partner_id?.[1],
                })),
            },
            message: `📅 Próximos ${args.days || 7} días: **${tasks.length} tareas** y **${leads.length} leads** con deadline`,
        };
    } catch (error: any) {
        return { success: false, error: `Error Odoo deadlines: ${error.message}` };
    }
}

/**
 * 24. Link Service to VPS
 */
export async function linkServiceToVps(args: LinkServiceArgs) {
    try {
        if (!isNonEmptyString(args.serviceName) || !isNonEmptyString(args.vpsName)) {
            return { success: false, error: "Falta serviceName o vpsName" };
        }

        // Buscar VPS
        const vps = await prisma.vPS.findFirst({
            where: { name: { contains: args.vpsName, mode: "insensitive" } }
        });

        if (!vps) {
            return { success: false, error: `VPS "${args.vpsName}" no encontrado` };
        }

        // Buscar Servicio
        const service = await prisma.service.findFirst({
            where: { name: { contains: args.serviceName, mode: "insensitive" } }
        });

        if (!service) {
            return { success: false, error: `Servicio "${args.serviceName}" no encontrado` };
        }

        // Action: Link Service to VPS
        const updatedService = await prisma.service.update({
            where: { id: service.id },
            data: { vpsId: vps.id }
        });

        return {
            success: true,
            message: `Servicio **${updatedService.name}** vinculado exitosamente al VPS **${vps.name}**.`,
            data: {
                serviceId: updatedService.id,
                vpsId: vps.id
            }
        };

    } catch (error: any) {
        return { success: false, error: `Error al vincular: ${error.message}` };
    }
}

// Mapa de funciones ejecutables
export const functionHandlers: Record<string, (args: any) => Promise<any>> = {
    create_client: createClient,
    register_payment: registerPayment,
    search_payments: searchPayments,
    update_payment: updatePayment,
    search_client: searchClient,
    list_active_clients: listActiveClients,
    get_client_status: getClientStatus,
    set_billing_date: setBillingDate,
    list_pending_payments: listPendingPayments,
    get_financial_summary: getFinancialSummary,
    list_vps: listVPS,
    create_invoice_odoo: createInvoiceOdoo,
    delete_client: deleteClient,
    assign_service_to_client: assignServiceToClient,
    list_unassigned_services: listUnassignedServices,
    add_expense: addExpense,
    search_expenses: searchExpenses,
    check_vps_status: checkVpsStatus,
    execute_bash_command: executeBashCommand,
    search_docs: searchDocs,
    save_memory: saveMemory,
    recall_memories: recallMemories,
    change_billing_cycle: changeBillingCycle,
    manage_odoo_crm: manageOdooCrm,
    manage_odoo_tasks: manageOdooTasks,
    send_odoo_notification: sendOdooNotification,
    get_odoo_deadlines: getOdooDeadlines,
    link_service_to_vps: linkServiceToVps,
};


