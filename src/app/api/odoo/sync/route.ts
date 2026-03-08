import { NextResponse } from "next/server";
import { syncOdooPartners, backgroundSync } from "@/lib/odoo/sync";

// GET: Trigger sync from Odoo to local
export async function GET() {
    try {
        const result = await syncOdooPartners();
        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

// POST: Trigger background sync (lightweight, respects interval)
export async function POST() {
    try {
        await backgroundSync();
        return NextResponse.json({ success: true, message: "Background sync triggered" });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
