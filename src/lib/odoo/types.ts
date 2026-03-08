// Odoo Types for XML-RPC integration

export interface OdooConfig {
    url: string;
    db: string;
    username: string;
    apiKey: string;
}

export interface OdooPartner {
    id?: number;
    name: string;
    email?: string;
    phone?: string;
    company_type?: "person" | "company";
    street?: string;
    city?: string;
    country_id?: number;
    vat?: string;
}

export interface OdooProduct {
    id: number;
    name: string;
    list_price: number;
    default_code?: string;
    type: string;
}

export interface OdooInvoiceLine {
    product_id?: number;
    name: string;
    quantity: number;
    price_unit: number;
    tax_ids?: number[];
}

export interface OdooInvoice {
    id?: number;
    name?: string;
    partner_id: number;
    move_type: "out_invoice" | "out_refund" | "in_invoice" | "in_refund";
    invoice_date?: string;
    invoice_line_ids: OdooInvoiceLine[];
    state?: string;
    amount_total?: number;
}

export interface OdooResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}
