import fs from "node:fs";
import path from "node:path";

/** Split RNV_ADDONS_ROOTS on colon or comma. Paths themselves must not contain those characters. */
export function parseAddonsRoots(raw: string | undefined | null): string[] {
    if (!raw) return [];
    return raw
        .split(/[,:]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}

export function configuredAddonsRoots(): string[] {
    return parseAddonsRoots(process.env.RNV_ADDONS_ROOTS);
}

export function defaultConfiguredRoot(): string {
    return configuredAddonsRoots()[0] || "";
}

function realDirectory(candidate: string): string | null {
    if (!candidate || candidate.includes("\0") || !path.isAbsolute(candidate)) return null;
    try {
        const real = fs.realpathSync(path.resolve(candidate));
        return fs.statSync(real).isDirectory() ? real : null;
    } catch {
        return null;
    }
}

/**
 * Resolve `requested` to a real directory that is exactly one of RNV_ADDONS_ROOTS.
 * An empty request uses the first allowed root. Symlinks are resolved on both sides,
 * so a link that points elsewhere does not match.
 */
export function resolveAllowedRoot(requested: string | undefined | null): string {
    const allowed = configuredAddonsRoots();
    if (allowed.length === 0) {
        throw new Error("No hay raíces permitidas. Define RNV_ADDONS_ROOTS.");
    }
    const raw = (requested || "").trim() || allowed[0];
    const requestedReal = realDirectory(raw);
    if (!requestedReal) {
        throw new Error("No existe la carpeta raíz o no está permitida");
    }
    for (const entry of allowed) {
        const allowedReal = realDirectory(entry);
        if (allowedReal && allowedReal === requestedReal) return requestedReal;
    }
    throw new Error("La carpeta raíz no está permitida");
}
