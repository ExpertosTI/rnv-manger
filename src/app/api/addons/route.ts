import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { hasValidSession } from "@/lib/addons/auth";
import {
    addonsLocalEnabled,
    detailAddons,
    runAction,
    scanAddons,
    unavailableAction,
    unavailableDetail,
    unavailableScan,
} from "@/lib/addons/engine";
import { defaultConfiguredRoot } from "@/lib/addons/roots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "No se pudo completar la operación";
}

async function requireSession(request: NextRequest): Promise<NextResponse | null> {
    const ok = await hasValidSession({
        cookie: request.cookies.get("rnv_session")?.value,
        authorization: request.headers.get("authorization"),
    });
    if (ok) return null;
    return NextResponse.json(
        { available: false, ok: false, message: "No autorizado" },
        { status: 401 }
    );
}

export async function GET(request: NextRequest) {
    const denied = await requireSession(request);
    if (denied) return denied;
    const modulePath = request.nextUrl.searchParams.get("path");
    if (!addonsLocalEnabled()) {
        return NextResponse.json(modulePath ? unavailableDetail() : unavailableScan());
    }
    const root = request.nextUrl.searchParams.get("root") || "";
    try {
        if (modulePath) return NextResponse.json(detailAddons(root, modulePath));
        return NextResponse.json(scanAddons(root));
    } catch (error) {
        return NextResponse.json(
            { available: true, ok: false, message: errorMessage(error), defaultRoot: defaultConfiguredRoot() },
            { status: 400 }
        );
    }
}

export async function POST(request: NextRequest) {
    const denied = await requireSession(request);
    if (denied) return denied;
    if (!addonsLocalEnabled()) {
        return NextResponse.json(unavailableAction());
    }
    try {
        const body = (await request.json()) as {
            root?: string;
            action?: string;
            relativePath?: string;
            message?: string;
            remote?: string;
            destination?: string;
            motivo?: string;
            reemplazadoPor?: string;
            confirm?: boolean;
        };
        const result = runAction({
            root: body.root || "",
            action: body.action || "",
            relativePath: body.relativePath,
            message: body.message,
            remote: body.remote,
            destination: body.destination,
            motivo: body.motivo,
            reemplazadoPor: body.reemplazadoPor,
            confirm: body.confirm,
        });
        if ("zipPath" in result) {
            const data = fs.readFileSync(result.zipPath);
            fs.rmSync(result.zipPath, { force: true });
            return new NextResponse(new Uint8Array(data), {
                headers: {
                    "Content-Type": "application/zip",
                    "Content-Disposition": `attachment; filename="${result.filename.replace(/"/g, "")}"`,
                    "Cache-Control": "no-store",
                },
            });
        }
        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json(
            { available: true, ok: false, message: errorMessage(error), defaultRoot: defaultConfiguredRoot() },
            { status: 400 }
        );
    }
}
