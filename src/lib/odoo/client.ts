/**
 * Odoo XML-RPC Client
 * Connects to Odoo using XML-RPC protocol
 * 
 * Configuration via environment variables:
 * - ODOO_URL: Base URL of Odoo server (e.g., https://renace.tech)
 * - ODOO_DB: Database name
 * - ODOO_USERNAME: User email/login
 * - ODOO_API_KEY: API Key for authentication
 */

import { OdooConfig, OdooPartner, OdooInvoice, OdooProduct, OdooResponse } from "./types";

// Simple XML-RPC client implementation for Odoo
class OdooClient {
    private config: OdooConfig;
    private uid: number | null = null;

    constructor(config?: Partial<OdooConfig>) {
        this.config = {
            url: config?.url || process.env.ODOO_URL || "",
            db: config?.db || process.env.ODOO_DB || "",
            username: config?.username || process.env.ODOO_USERNAME || "",
            apiKey: config?.apiKey || process.env.ODOO_API_KEY || "",
        };
    }

    private buildXmlRpcRequest(method: string, params: any[]): string {
        const escapeXml = (str: string) => str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        const valueToXml = (val: any): string => {
            if (val === null || val === undefined) return "<value><boolean>0</boolean></value>";
            if (typeof val === "boolean") return `<value><boolean>${val ? 1 : 0}</boolean></value>`;
            if (typeof val === "number") {
                return Number.isInteger(val)
                    ? `<value><int>${val}</int></value>`
                    : `<value><double>${val}</double></value>`;
            }
            if (typeof val === "string") return `<value><string>${escapeXml(val)}</string></value>`;
            if (Array.isArray(val)) {
                return `<value><array><data>${val.map(valueToXml).join("")}</data></array></value>`;
            }
            if (typeof val === "object") {
                const members = Object.entries(val)
                    .map(([k, v]) => `<member><name>${k}</name>${valueToXml(v)}</member>`)
                    .join("");
                return `<value><struct>${members}</struct></value>`;
            }
            return `<value><string>${String(val)}</string></value>`;
        };

        const paramsXml = params.map(p => `<param>${valueToXml(p)}</param>`).join("");
        return `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${paramsXml}</params></methodCall>`;
    }

    private parseXmlRpcResponse(xml: string): any {
        // Simple XML parser for Odoo responses
        const getTagContent = (str: string, tag: string): string | null => {
            const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
            const match = str.match(regex);
            return match ? match[1] : null;
        };

        const parseValue = (valueStr: string): any => {
            if (valueStr.includes("<int>")) return parseInt(getTagContent(valueStr, "int") || "0");
            if (valueStr.includes("<i4>")) return parseInt(getTagContent(valueStr, "i4") || "0");
            if (valueStr.includes("<double>")) return parseFloat(getTagContent(valueStr, "double") || "0");
            if (valueStr.includes("<boolean>")) return getTagContent(valueStr, "boolean") === "1";
            if (valueStr.includes("<string>")) return getTagContent(valueStr, "string") || "";
            if (valueStr.includes("<array>")) {
                const data = getTagContent(valueStr, "data") || "";
                const values = data.match(/<value>[\s\S]*?<\/value>/g) || [];
                return values.map(parseValue);
            }
            if (valueStr.includes("<struct>")) {
                const result: any = {};
                const members = valueStr.match(/<member>[\s\S]*?<\/member>/g) || [];
                for (const member of members) {
                    const name = getTagContent(member, "name");
                    const val = member.match(/<value>[\s\S]*<\/value>/);
                    if (name && val) result[name] = parseValue(val[0]);
                }
                return result;
            }
            // Default: return as string
            const content = getTagContent(valueStr, "value");
            return content?.trim() || valueStr;
        };

        // Check for fault
        if (xml.includes("<fault>")) {
            const faultValue = getTagContent(xml, "fault") || "";
            const fault = parseValue(faultValue);
            throw new Error(fault.faultString || "XML-RPC Fault");
        }

        const params = getTagContent(xml, "params");
        if (!params) return null;

        const value = params.match(/<value>[\s\S]*<\/value>/);
        return value ? parseValue(value[0]) : null;
    }

    private async xmlRpcCall(endpoint: string, method: string, params: any[]): Promise<any> {
        const url = `${this.config.url}${endpoint}`;
        const body = this.buildXmlRpcRequest(method, params);

        console.log(`[Odoo] Calling ${method} at ${url}`);

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "text/xml",
            },
            body,
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const text = await response.text();
        return this.parseXmlRpcResponse(text);
    }

    /**
     * Authenticate with Odoo and get uid
     */
    async authenticate(): Promise<number> {
        if (this.uid) return this.uid;

        const result = await this.xmlRpcCall(
            "/xmlrpc/2/common",
            "authenticate",
            [this.config.db, this.config.username, this.config.apiKey, {}]
        );

        if (!result || result === false) {
            throw new Error("Authentication failed");
        }

        this.uid = result as number;
        console.log(`[Odoo] Authenticated as UID: ${this.uid}`);
        return this.uid as number;
    }

    /**
     * Execute a method on Odoo model
     */
    async execute(model: string, method: string, args: any[], kwargs: any = {}): Promise<any> {
        const uid = await this.authenticate();
        return this.xmlRpcCall(
            "/xmlrpc/2/object",
            "execute_kw",
            [this.config.db, uid, this.config.apiKey, model, method, args, kwargs]
        );
    }

    /**
     * Search and read records
     */
    async searchRead(model: string, domain: any[] = [], fields: string[] = [], limit?: number): Promise<any[]> {
        const kwargs: any = { fields };
        if (limit) kwargs.limit = limit;
        return this.execute(model, "search_read", [domain], kwargs);
    }

    /**
     * Create a new record
     */
    async create(model: string, values: any): Promise<number> {
        return this.execute(model, "create", [values]);
    }

    /**
     * Update existing records
     */
    async write(model: string, ids: number[], values: any): Promise<boolean> {
        return this.execute(model, "write", [ids, values]);
    }

    // ============ Business Methods ============

    /**
     * Get partners (customers/suppliers)
     */
    async getPartners(limit = 100): Promise<OdooPartner[]> {
        return this.searchRead(
            "res.partner",
            [],
            ["id", "name", "email", "phone", "company_type", "street", "city", "vat"],
            limit
        );
    }

    /**
     * Create or update partner from RNV client
     */
    async syncPartner(data: OdooPartner): Promise<number> {
        // Try to find existing partner by email
        if (data.email) {
            const existing = await this.searchRead("res.partner", [["email", "=", data.email]], ["id"], 1);
            if (existing.length > 0) {
                await this.write("res.partner", [existing[0].id], data);
                return existing[0].id;
            }
        }
        return this.create("res.partner", data);
    }

    /**
     * Get products
     */
    async getProducts(limit = 100): Promise<OdooProduct[]> {
        return this.searchRead(
            "product.product",
            [],
            ["id", "name", "list_price", "default_code", "type"],
            limit
        );
    }

    /**
     * Create invoice
     */
    async createInvoice(partnerId: number, lines: Array<{ name: string; quantity: number; price_unit: number }>): Promise<number> {
        const invoiceLines = lines.map(line => [0, 0, {
            name: line.name,
            quantity: line.quantity,
            price_unit: line.price_unit,
        }]);

        const invoiceId = await this.create("account.move", {
            partner_id: partnerId,
            move_type: "out_invoice",
            invoice_line_ids: invoiceLines,
        });

        console.log(`[Odoo] Created invoice ${invoiceId} for partner ${partnerId}`);
        return invoiceId;
    }

    /**
     * Get invoices
     */
    async getInvoices(limit = 50): Promise<any[]> {
        return this.searchRead(
            "account.move",
            [["move_type", "=", "out_invoice"]],
            ["id", "name", "partner_id", "invoice_date", "amount_total", "state"],
            limit
        );
    }

    /**
     * Test connection
     */
    async testConnection(): Promise<OdooResponse<{ uid: number; version: any }>> {
        try {
            const version = await this.xmlRpcCall("/xmlrpc/2/common", "version", []);
            const uid = await this.authenticate();
            return { success: true, data: { uid, version } };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
}

// Singleton instance
let odooClient: OdooClient | null = null;

export function getOdooClient(config?: Partial<OdooConfig>): OdooClient {
    if (!odooClient || config) {
        odooClient = new OdooClient(config);
    }
    return odooClient;
}

export { OdooClient };
export default getOdooClient;
