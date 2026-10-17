"use client";

import type { ActionResponse, DetailResponse, ScanResponse } from "./types";

type ActionPayload = Record<string, string | boolean | undefined>;

export function isTauriRuntime(): boolean {
    if (typeof window === "undefined") return false;
    const w = window as Window & { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown };
    return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__);
}

async function tauriInvoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
}

export async function fetchAddonsScan(root: string): Promise<ScanResponse> {
    if (isTauriRuntime()) {
        return tauriInvoke<ScanResponse>("addons_scan", { root });
    }
    const res = await fetch(`/api/addons?root=${encodeURIComponent(root)}`, { cache: "no-store", credentials: "include" });
    return res.json() as Promise<ScanResponse>;
}

export async function fetchAddonsDetail(root: string, relativePath: string): Promise<DetailResponse> {
    if (isTauriRuntime()) {
        return tauriInvoke<DetailResponse>("addons_detail", { root, relativePath });
    }
    const params = new URLSearchParams({ root, path: relativePath });
    const res = await fetch(`/api/addons?${params.toString()}`, { cache: "no-store", credentials: "include" });
    return res.json() as Promise<DetailResponse>;
}

export async function runAddonsAction(
    root: string,
    action: string,
    payload: ActionPayload
): Promise<ActionResponse> {
    if (isTauriRuntime()) {
        return tauriInvoke<ActionResponse>("addons_action", { root, action, payload });
    }
    const res = await fetch("/api/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ root, action, ...payload }),
    });
    return res.json() as Promise<ActionResponse>;
}

export async function downloadAddonsZip(root: string, relativePath: string): Promise<ActionResponse> {
    if (isTauriRuntime()) {
        return tauriInvoke<ActionResponse>("addons_action", {
            root,
            action: "export",
            payload: { relativePath, confirm: true },
        });
    }
    const res = await fetch("/api/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ root, action: "export", relativePath, confirm: true }),
    });
    if (!res.ok || (res.headers.get("content-type") || "").includes("application/json")) {
        const data = (await res.json().catch(() => null)) as ActionResponse | null;
        return data || { available: true, ok: false, message: "No se pudo exportar el ZIP" };
    }
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] || "modulo.zip";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return { available: true, ok: true, message: `ZIP descargado: ${filename}` };
}
