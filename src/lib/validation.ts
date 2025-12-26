/**
 * Validation Schemas using Zod
 * Provides type-safe validation for all API inputs
 */

import { z } from "zod";

// Client validation schemas
export const ClientCreateSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email format").optional().nullable(),
    phone: z.string().min(7, "Phone must be at least 7 characters").optional().nullable(),
    companyName: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    monthlyFee: z.number().min(0, "Monthly fee cannot be negative").optional(),
    currency: z.enum(["USD", "EUR", "DOP"]).optional(),
    paymentDay: z.number().min(1).max(31).optional(),
});

export const ClientUpdateSchema = ClientCreateSchema.partial();

// VPS validation schemas
export const VPSCreateSchema = z.object({
    name: z.string().min(1, "Name is required"),
    ipAddress: z.string().regex(/^(?:\d{1,3}\.){3}\d{1,3}$/, "Invalid IP address"),
    provider: z.string().optional(),
    hostingerId: z.string().optional().nullable(),
    sshUser: z.string().optional(),
    sshPort: z.number().min(1).max(65535).optional(),
    clientId: z.string().optional().nullable(),
});

// Service validation schemas
export const ServiceCreateSchema = z.object({
    name: z.string().min(1, "Service name is required"),
    type: z.enum(["odoo", "postgres", "nginx", "redis", "other"]),
    port: z.number().min(1).max(65535).optional().nullable(),
    url: z.string().url("Invalid URL").optional().nullable(),
    configFile: z.string().optional().nullable(),
    vpsId: z.string().optional().nullable(),
});

// Payment validation schemas
export const PaymentCreateSchema = z.object({
    amount: z.number().positive("Amount must be positive"),
    currency: z.enum(["USD", "EUR", "DOP"]).optional(),
    clientId: z.string().min(1, "Client ID is required"),
    notes: z.string().optional().nullable(),
    status: z.enum(["pending", "completed", "failed"]).optional(),
});

// Odoo Invoice validation
export const OdooInvoiceCreateSchema = z.object({
    clientId: z.string().optional(),
    partnerId: z.number().optional(),
    lines: z.array(z.object({
        name: z.string().min(1, "Line item name is required"),
        quantity: z.number().positive("Quantity must be positive"),
        price_unit: z.number().min(0, "Price cannot be negative"),
    })).min(1, "At least one invoice line is required"),
});

// Utility function to validate request body
export async function validateRequest<T>(
    request: Request,
    schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; errors: string[] }> {
    try {
        const body = await request.json();
        const result = schema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`);
            return { success: false, errors };
        }

        return { success: true, data: result.data };
    } catch (error) {
        return { success: false, errors: ["Invalid JSON body"] };
    }
}

export type ClientCreate = z.infer<typeof ClientCreateSchema>;
export type ClientUpdate = z.infer<typeof ClientUpdateSchema>;
export type VPSCreate = z.infer<typeof VPSCreateSchema>;
export type ServiceCreate = z.infer<typeof ServiceCreateSchema>;
export type PaymentCreate = z.infer<typeof PaymentCreateSchema>;
export type OdooInvoiceCreate = z.infer<typeof OdooInvoiceCreateSchema>;
