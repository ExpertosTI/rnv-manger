import { NextResponse } from "next/server";
import { getOdooClient } from "@/lib/odoo";

// GET - Test Odoo connection
export async function GET() {
    try {
        const odoo = getOdooClient();
        const result = await odoo.testConnection();

        return NextResponse.json(result);
    } catch (error: any) {
        console.error("[Odoo API] Connection test failed:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Connection failed",
        }, { status: 500 });
    }
}

// POST - Execute generic Odoo operation
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { model, method, args = [], kwargs = {} } = body;

        if (!model || !method) {
            return NextResponse.json({
                success: false,
                error: "Missing required fields: model, method",
            }, { status: 400 });
        }

        const odoo = getOdooClient();
        const result = await odoo.execute(model, method, args, kwargs);

        return NextResponse.json({
            success: true,
            data: result,
        });
    } catch (error: any) {
        console.error("[Odoo API] Execute failed:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Operation failed",
        }, { status: 500 });
    }
}
