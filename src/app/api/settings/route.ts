import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET - Get all settings or by category
export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const category = url.searchParams.get("category");
        const key = url.searchParams.get("key");

        if (key) {
            const setting = await prisma.appSettings.findUnique({
                where: { key },
            });
            return NextResponse.json({
                success: true,
                data: setting?.value || null
            });
        }

        const settings = await prisma.appSettings.findMany({
            where: category ? { category } : undefined,
            orderBy: { key: "asc" },
        });

        // Convert to key-value object
        const settingsMap = settings.reduce((acc, s) => {
            acc[s.key] = s.value;
            return acc;
        }, {} as Record<string, string>);

        return NextResponse.json({ success: true, data: settingsMap });
    } catch (error) {
        console.error("Settings GET Error:", error);
        return NextResponse.json(
            { success: false, error: "Error obteniendo configuración" },
            { status: 500 }
        );
    }
}

// POST - Save settings
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { settings } = body; // { key: value, key2: value2, ... }

        if (!settings || typeof settings !== "object") {
            return NextResponse.json(
                { success: false, error: "Settings object required" },
                { status: 400 }
            );
        }

        const results = [];
        for (const [key, value] of Object.entries(settings)) {
            const category = key.split("_")[0]; // e.g., smtp_host -> smtp

            const result = await prisma.appSettings.upsert({
                where: { key },
                create: {
                    key,
                    value: String(value),
                    category,
                },
                update: {
                    value: String(value),
                },
            });
            results.push(result);
        }

        return NextResponse.json({ success: true, data: results });
    } catch (error) {
        console.error("Settings POST Error:", error);
        return NextResponse.json(
            { success: false, error: "Error guardando configuración" },
            { status: 500 }
        );
    }
}

// DELETE - Delete a setting
export async function DELETE(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const key = url.searchParams.get("key");

        if (!key) {
            return NextResponse.json(
                { success: false, error: "Key required" },
                { status: 400 }
            );
        }

        await prisma.appSettings.delete({
            where: { key },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: "Error eliminando configuración" },
            { status: 500 }
        );
    }
}
