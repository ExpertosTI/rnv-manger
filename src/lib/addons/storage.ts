"use client";

import { ADDONS_ROOT_STORAGE_KEY, DEFAULT_ADDONS_ROOT } from "./types";

export function readAddonsRoot(): string {
    if (typeof window === "undefined") return DEFAULT_ADDONS_ROOT;
    try {
        return localStorage.getItem(ADDONS_ROOT_STORAGE_KEY)?.trim() || DEFAULT_ADDONS_ROOT;
    } catch {
        return DEFAULT_ADDONS_ROOT;
    }
}

export function writeAddonsRoot(value: string): string {
    const next = value.trim() || DEFAULT_ADDONS_ROOT;
    try {
        localStorage.setItem(ADDONS_ROOT_STORAGE_KEY, next);
    } catch {
        /* modo privado o almacenamiento deshabilitado */
    }
    return next;
}
