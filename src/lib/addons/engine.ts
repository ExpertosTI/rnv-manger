import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultConfiguredRoot, resolveAllowedRoot } from "./roots";
import {
    DESKTOP_ONLY_MESSAGE,
    GITIGNORE_LINES,
    type ActionResponse,
    type AddonsStats,
    type DetailResponse,
    type GitBadge,
    type GitInfo,
    type ManifestInfo,
    type MapaRow,
    type ModuleDetail,
    type ModuleSummary,
    type ModuleVersion,
    type ScanResponse,
    type StatBucket,
    type TreeNode,
} from "./types";

const VERSION_RE = /^\d+\.\d+$/;
const MAPA_HEADER = [
    "module",
    "area_or_client",
    "tipo_negocio",
    "versions",
    "clients_using",
    "ubicaciones_encontradas",
    "estado",
    "reemplazado_por",
    "clientes_a_migrar",
    "familia_duplicados",
    "instalado_en_clientes",
] as const;

const GITHUB_REMOTE =
    /^(?:git@github\.com:[\w.-]+\/[\w.-]+(?:\.git)?|ssh:\/\/git@github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?|https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?)$/;

type RunResult = { code: number; stdout: string; stderr: string };

type RepoSnap = {
    repoRoot: string;
    remoteUrl: string | null;
    hasUpstream: boolean;
    ahead: number;
    behind: number;
    dirtyPaths: string[];
    head: { hash: string; date: string; message: string } | null;
};

export function addonsLocalEnabled(): boolean {
    return process.env.RNV_ADDONS_LOCAL === "1";
}

export function unavailableScan(): ScanResponse {
    return { available: false, message: DESKTOP_ONLY_MESSAGE };
}

export function unavailableDetail(): DetailResponse {
    return { available: false, message: DESKTOP_ONLY_MESSAGE };
}

export function unavailableAction(): ActionResponse {
    return { available: false, ok: false, message: DESKTOP_ONLY_MESSAGE };
}

export function isGithubRemote(url: string): boolean {
    const trimmed = url.trim();
    if (!trimmed || /[\s]/.test(trimmed)) return false;
    if (/ghp_|github_pat_|:\/\/[^/]*:[^@/]+@/i.test(trimmed)) return false;
    return GITHUB_REMOTE.test(trimmed);
}

function run(cmd: string, args: string[], cwd: string, timeout = 20000, input?: string): RunResult {
    const res = spawnSync(cmd, args, {
        cwd,
        timeout,
        input,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        maxBuffer: 32 * 1024 * 1024,
    });
    return {
        code: res.status ?? 1,
        stdout: res.stdout?.toString("utf8") ?? "",
        stderr: (res.stderr?.toString("utf8") ?? "") || res.error?.message || "",
    };
}

function toPosix(value: string): string {
    return value.split(path.sep).join("/");
}

function assertAbsoluteRoot(root: string): string {
    return resolveAllowedRoot(root);
}

function insideRoot(rootReal: string, candidate: string): string {
    const resolved = path.resolve(candidate);
    const real = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
    const rel = path.relative(rootReal, real);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new Error("La ruta sale de la carpeta raíz");
    }
    return real;
}

function resolveExisting(rootReal: string, relativePath: string): string {
    if (relativePath.includes("\0")) throw new Error("La ruta no es válida");
    const cleaned = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (cleaned.split("/").includes("..") || (cleaned.length > 0 && path.posix.isAbsolute(cleaned))) {
        throw new Error("La ruta sale de la carpeta raíz");
    }
    if (!cleaned) return rootReal;
    return insideRoot(rootReal, path.resolve(rootReal, cleaned));
}

export function areaOrClientFor(relativeModuleRoot: string): string {
    const info = classify(relativeModuleRoot);
    if (info.category === "comunes") return `comunes/${info.area}`;
    if (info.category === "clientes") return `clientes/${info.tipoNegocio}/${info.cliente}`;
    if (info.category === "revisar") return "_revisar";
    if (info.category === "archivados") return `_archivados/${info.moduleName}`;
    return relativeModuleRoot.replace(/\\/g, "/").replace(/\/$/, "");
}

export function classify(relativePath: string): {
    category: ModuleSummary["category"];
    area: string;
    tipoNegocio: string;
    cliente: string;
    moduleName: string;
    version: string | null;
} {
    const parts = relativePath.split("/").filter(Boolean);
    let version: string | null = null;
    if (parts.length > 0 && VERSION_RE.test(parts[parts.length - 1])) {
        version = parts.pop() || null;
    }
    const moduleName = parts[parts.length - 1] || "";
    const top = parts[0] || "";
    if (top === "comunes") {
        return { category: "comunes", area: parts[1] || "", tipoNegocio: "", cliente: "", moduleName, version };
    }
    if (top === "clientes") {
        return {
            category: "clientes",
            area: "",
            tipoNegocio: parts[1] || "",
            cliente: parts[2] || "",
            moduleName,
            version,
        };
    }
    if (top === "_revisar") {
        return { category: "revisar", area: "", tipoNegocio: "", cliente: "", moduleName, version };
    }
    if (top === "_archivados") {
        return { category: "archivados", area: "", tipoNegocio: "", cliente: "", moduleName, version };
    }
    return { category: "otro", area: "", tipoNegocio: "", cliente: "", moduleName, version };
}

function odooVersionFromManifest(version: string, folderVersion: string | null): string {
    if (folderVersion && VERSION_RE.test(folderVersion)) return folderVersion;
    const match = version.match(/^(\d+\.\d+)/);
    return match?.[1] || "";
}

export function parseManifestSource(source: string): Omit<ManifestInfo, "odooVersion"> | null {
    const py = run(
        "python3",
        [
            "-c",
            [
                "import ast, json, sys",
                "src = sys.stdin.read()",
                "tree = ast.parse(src)",
                "found = None",
                "for node in tree.body:",
                "    if isinstance(node, ast.Expr) and isinstance(node.value, ast.Dict):",
                "        found = node.value",
                "        break",
                "    if isinstance(node, ast.Assign) and isinstance(node.value, ast.Dict):",
                "        found = node.value",
                "        break",
                "def lit(node):",
                "    if isinstance(node, ast.Constant):",
                "        return node.value if isinstance(node.value, (str, int, float, bool)) or node.value is None else str(node.value)",
                "    if isinstance(node, (ast.List, ast.Tuple)):",
                "        return [lit(x) for x in node.elts]",
                "    if isinstance(node, ast.Dict):",
                "        out = {}",
                "        for k, v in zip(node.keys, node.values):",
                "            key = lit(k)",
                "            if isinstance(key, str):",
                "                out[key] = lit(v)",
                "        return out",
                "    return None",
                "data = lit(found) if found is not None else None",
                "if not isinstance(data, dict):",
                "    json.dump({}, sys.stdout)",
                "else:",
                "    keys = ['name','version','summary','description','author','license','depends','data']",
                "    json.dump({k: data.get(k) for k in keys if k in data}, sys.stdout, ensure_ascii=False)",
            ].join("\n"),
        ],
        process.cwd(),
        8000,
        source
    );
    if (py.code === 0 && py.stdout.trim()) {
        try {
            const data = JSON.parse(py.stdout) as Record<string, unknown>;
            if (data && (data.name || data.version || data.depends)) {
                return normalizeManifest(data);
            }
        } catch {
            /* fallback below */
        }
    }
    return fallbackManifest(source);
}

function asStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string");
}

function normalizeManifest(data: Record<string, unknown>): Omit<ManifestInfo, "odooVersion"> {
    return {
        name: typeof data.name === "string" ? data.name : "",
        version: typeof data.version === "string" ? data.version : String(data.version ?? ""),
        summary: typeof data.summary === "string" ? data.summary.trim() : "",
        description: typeof data.description === "string" ? data.description.trim() : "",
        author: typeof data.author === "string" ? data.author : "",
        depends: asStringList(data.depends),
        data: asStringList(data.data),
        license: typeof data.license === "string" ? data.license : "",
    };
}

function fallbackManifest(source: string): Omit<ManifestInfo, "odooVersion"> | null {
    const grab = (key: string): string => {
        const re = new RegExp(`['"]${key}['"]\\s*:\\s*(?:'{3}|"{3}|['"])([\\s\\S]*?)(?:'{3}|"{3}|['"])`);
        const match = source.match(re);
        return match?.[1]?.trim() || "";
    };
    const list = (key: string): string[] => {
        const re = new RegExp(`['"]${key}['"]\\s*:\\s*\\[([\\s\\S]*?)\\]`);
        const match = source.match(re);
        if (!match) return [];
        return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((item) => item[1]);
    };
    const name = grab("name");
    const version = grab("version");
    if (!name && !version) return null;
    return {
        name,
        version,
        summary: grab("summary"),
        description: grab("description"),
        author: grab("author"),
        depends: list("depends"),
        data: list("data"),
        license: grab("license"),
    };
}

function readManifestFile(filePath: string, folderVersion: string | null): ManifestInfo | null {
    try {
        const source = fs.readFileSync(filePath, "utf8");
        const parsed = parseManifestSource(source);
        if (!parsed) return null;
        return {
            ...parsed,
            odooVersion: odooVersionFromManifest(parsed.version, folderVersion),
        };
    } catch {
        return null;
    }
}

export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (quoted) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    cell += '"';
                    i += 1;
                } else {
                    quoted = false;
                }
            } else {
                cell += char;
            }
            continue;
        }
        if (char === '"') {
            quoted = true;
            continue;
        }
        if (char === ",") {
            row.push(cell);
            cell = "";
            continue;
        }
        if (char === "\n") {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
            continue;
        }
        if (char === "\r") continue;
        cell += char;
    }
    if (cell.length > 0 || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }
    return rows.filter((item) => item.some((value) => value.trim() !== ""));
}

function csvEscape(value: string): string {
    if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
}

function stringifyCsv(rows: string[][]): string {
    return `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

function loadMapa(root: string): { rows: MapaRow[]; warnings: string[] } {
    const file = path.join(root, "mapa.csv");
    if (!fs.existsSync(file)) {
        return { rows: [], warnings: ["No se encontró mapa.csv en la raíz"] };
    }
    const table = parseCsv(fs.readFileSync(file, "utf8"));
    if (table.length === 0) return { rows: [], warnings: ["mapa.csv está vacío"] };
    const header = table[0].map((cell) => cell.trim());
    const index = new Map(header.map((name, i) => [name, i]));
    const cell = (row: string[], key: string) => {
        const at = index.get(key);
        return at === undefined ? "" : (row[at] || "").trim();
    };
    const rows = table.slice(1).map((row) => ({
        module: cell(row, "module"),
        areaOrClient: cell(row, "area_or_client"),
        tipoNegocio: cell(row, "tipo_negocio"),
        versions: cell(row, "versions"),
        clientsUsing: cell(row, "clients_using"),
        ubicaciones: cell(row, "ubicaciones_encontradas"),
        estado: cell(row, "estado"),
        reemplazadoPor: cell(row, "reemplazado_por"),
        clientesAMigrar: cell(row, "clientes_a_migrar"),
        familia: cell(row, "familia_duplicados"),
        instaladoEnClientes: cell(row, "instalado_en_clientes"),
    }));
    return { rows: rows.filter((row) => row.module), warnings: [] };
}

function mapaToTable(rows: MapaRow[]): string[][] {
    const body = rows.map((row) => [
        row.module,
        row.areaOrClient,
        row.tipoNegocio,
        row.versions,
        row.clientsUsing,
        row.ubicaciones,
        row.estado,
        row.reemplazadoPor,
        row.clientesAMigrar,
        row.familia,
        row.instaladoEnClientes,
    ]);
    return [[...MAPA_HEADER], ...body];
}

function writeMapa(root: string, rows: MapaRow[]): void {
    fs.writeFileSync(path.join(root, "mapa.csv"), stringifyCsv(mapaToTable(rows)), "utf8");
}

function splitList(value: string): string[] {
    return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function pickMapa(rows: MapaRow[], moduleName: string, moduleRoot: string, version: string | null): MapaRow | null {
    const key = areaOrClientFor(moduleRoot);
    const candidates = rows.filter(
        (row) => row.module === moduleName && (row.areaOrClient === key || row.areaOrClient === `${key}/${moduleName}`)
    );
    if (candidates.length === 0) return null;
    if (version) {
        const exact = candidates.find((row) => splitList(row.versions).includes(version));
        if (exact) return exact;
    }
    return candidates.find((row) => row.estado === "keeper") || candidates[0];
}

function emptyGit(): GitInfo {
    return {
        inRepo: false,
        repoRoot: null,
        hasRemote: false,
        remoteUrl: null,
        hasUpstream: false,
        dirty: false,
        ahead: 0,
        behind: 0,
        lastCommit: null,
        badge: "no_subido",
        badgeLabel: "No subido",
    };
}

export function decideBadge(input: {
    inRepo: boolean;
    hasRemote: boolean;
    hasUpstream: boolean;
    dirty: boolean;
    ahead: number;
}): { badge: GitBadge; badgeLabel: string } {
    if (!input.inRepo) return { badge: "no_subido", badgeLabel: "No subido" };
    if (input.dirty || input.ahead > 0) return { badge: "cambios_pendientes", badgeLabel: "Cambios pendientes" };
    if (!input.hasRemote || !input.hasUpstream) return { badge: "no_subido", badgeLabel: "No subido" };
    return { badge: "subido", badgeLabel: "Subido a Git" };
}

function parseDirty(stdout: string): string[] {
    const parts = stdout.split("\0").filter((part) => part.length > 0);
    const paths: string[] = [];
    for (let i = 0; i < parts.length; i += 1) {
        const entry = parts[i];
        if (entry.length < 4) continue;
        const code = entry.slice(0, 2);
        const first = entry.slice(3).replace(/\\/g, "/");
        if (first) paths.push(first);
        if (code.includes("R") || code.includes("C")) {
            const second = parts[i + 1];
            if (second && !second.slice(0, 2).match(/^[ MADRCU?!]{2}$/)) {
                paths.push(second.replace(/\\/g, "/"));
                i += 1;
            }
        }
    }
    return paths;
}

function repoSnapshot(repoRoot: string, cache: Map<string, RepoSnap>): RepoSnap {
    const cached = cache.get(repoRoot);
    if (cached) return cached;
    const remote = run("git", ["remote", "get-url", "origin"], repoRoot);
    const remoteUrl = remote.code === 0 ? remote.stdout.trim() || null : null;
    const upstream = run("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], repoRoot);
    const hasUpstream = upstream.code === 0 && upstream.stdout.trim().length > 0;
    let ahead = 0;
    let behind = 0;
    if (hasUpstream) {
        const counts = run("git", ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], repoRoot);
        if (counts.code === 0) {
            const [left, right] = counts.stdout.trim().split(/\s+/);
            ahead = Number(left) || 0;
            behind = Number(right) || 0;
        }
    }
    const status = run("git", ["status", "--porcelain", "-z", "-uall"], repoRoot);
    const headRun = run("git", ["log", "-1", "--format=%H%x1f%cI%x1f%s"], repoRoot);
    let head: RepoSnap["head"] = null;
    if (headRun.code === 0 && headRun.stdout.trim()) {
        const [hash, date, message] = headRun.stdout.trim().split("\x1f");
        if (hash) head = { hash, date: date || "", message: message || "" };
    }
    const snap: RepoSnap = {
        repoRoot,
        remoteUrl,
        hasUpstream,
        ahead,
        behind,
        dirtyPaths: status.code === 0 ? parseDirty(status.stdout) : [],
        head,
    };
    cache.set(repoRoot, snap);
    return snap;
}

function findRepo(dir: string, root: string, repoCache: Map<string, string | null>, snaps: Map<string, RepoSnap>): string | null {
    const cached = repoCache.get(dir);
    if (cached !== undefined) return cached;
    const gitPath = path.join(dir, ".git");
    if (fs.existsSync(gitPath)) {
        const top = run("git", ["rev-parse", "--show-toplevel"], dir);
        const repo = top.code === 0 ? path.resolve(top.stdout.trim()) : dir;
        repoCache.set(dir, repo);
        return repo;
    }
    if (dir === root) {
        repoCache.set(dir, null);
        return null;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
        repoCache.set(dir, null);
        return null;
    }
    const found = findRepo(parent, root, repoCache, snaps);
    repoCache.set(dir, found);
    return found;
}

function pathDirty(repoRoot: string, absPath: string, dirtyPaths: string[]): boolean {
    const rel = toPosix(path.relative(repoRoot, absPath));
    if (!rel || rel === ".") return dirtyPaths.length > 0;
    return dirtyPaths.some((item) => item === rel || item.startsWith(`${rel}/`));
}

function lastCommitFor(repoRoot: string, absPath: string, head: RepoSnap["head"]): GitInfo["lastCommit"] {
    const rel = toPosix(path.relative(repoRoot, absPath));
    const spec = !rel || rel === "." ? [] : ["--", rel];
    const log = run("git", ["log", "-1", "--format=%H%x1f%cI%x1f%s", ...spec], repoRoot);
    if (log.code === 0 && log.stdout.trim()) {
        const [hash, date, message] = log.stdout.replace(/\n$/, "").split("\x1f");
        if (hash) return { hash, date: date || "", message: message || "" };
    }
    return !rel || rel === "." ? head : null;
}

function gitInfoFor(absPath: string, root: string, repoCache: Map<string, string | null>, snaps: Map<string, RepoSnap>, withLog: boolean): GitInfo {
    const repo = findRepo(absPath, root, repoCache, snaps);
    if (!repo) return emptyGit();
    const snap = repoSnapshot(repo, snaps);
    const dirty = pathDirty(repo, absPath, snap.dirtyPaths);
    const decision = decideBadge({
        inRepo: true,
        hasRemote: Boolean(snap.remoteUrl),
        hasUpstream: snap.hasUpstream,
        dirty,
        ahead: snap.ahead,
    });
    return {
        inRepo: true,
        repoRoot: repo,
        hasRemote: Boolean(snap.remoteUrl),
        remoteUrl: snap.remoteUrl,
        hasUpstream: snap.hasUpstream,
        dirty,
        ahead: snap.ahead,
        behind: snap.behind,
        lastCommit: withLog ? lastCommitFor(repo, absPath, snap.head) : snap.head,
        badge: decision.badge,
        badgeLabel: decision.badgeLabel,
    };
}

function listDirs(dir: string): fs.Dirent[] {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => {
        if (!entry.isDirectory() || entry.isSymbolicLink()) return false;
        if (entry.name.startsWith(".") || entry.name === "__pycache__" || entry.name === "node_modules") return false;
        return true;
    });
}

function hasManifest(dir: string): boolean {
    return fs.existsSync(path.join(dir, "__manifest__.py"));
}

function discoverVersions(dir: string, rel: string): ModuleVersion[] {
    const versions: ModuleVersion[] = [];
    if (hasManifest(dir)) {
        const folderVersion = VERSION_RE.test(path.basename(dir)) ? path.basename(dir) : null;
        const manifest = readManifestFile(path.join(dir, "__manifest__.py"), folderVersion);
        versions.push({
            version: manifest?.odooVersion || folderVersion || "",
            relativePath: rel,
            manifest,
        });
    }
    for (const entry of listDirs(dir)) {
        if (!VERSION_RE.test(entry.name)) continue;
        const child = path.join(dir, entry.name);
        if (!hasManifest(child)) continue;
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        versions.push({
            version: entry.name,
            relativePath: childRel,
            manifest: readManifestFile(path.join(child, "__manifest__.py"), entry.name),
        });
    }
    return versions;
}

function isVersionDir(dir: string, name: string): boolean {
    return VERSION_RE.test(name) && hasManifest(dir);
}

function isModuleDir(dir: string): boolean {
    if (hasManifest(dir) && !VERSION_RE.test(path.basename(dir))) return true;
    const dirs = listDirs(dir);
    return dirs.some((entry) => isVersionDir(path.join(dir, entry.name), entry.name));
}

type WalkState = {
    root: string;
    mapa: MapaRow[];
    modules: ModuleSummary[];
    repoCache: Map<string, string | null>;
    snaps: Map<string, RepoSnap>;
};

function buildModule(abs: string, rel: string, state: WalkState): ModuleSummary {
    const meta = classify(rel);
    const versions = discoverVersions(abs, rel);
    const versionNames = [...new Set(versions.map((item) => item.version).filter(Boolean))];
    const primary = [...versions].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
    const mapa = pickMapa(state.mapa, meta.moduleName, rel, null);
    const estado = mapa?.estado || (meta.category === "archivados" ? "archivado" : "");
    return {
        name: meta.moduleName || path.basename(abs),
        relativePath: rel,
        category: meta.category,
        area: meta.area,
        tipoNegocio: mapa?.tipoNegocio || meta.tipoNegocio,
        cliente: meta.cliente,
        versions: versionNames,
        estado,
        manifestName: primary?.manifest?.name || meta.moduleName,
        summary: primary?.manifest?.summary || primary?.manifest?.description.slice(0, 180) || "",
        mapa,
        git: gitInfoFor(abs, state.root, state.repoCache, state.snaps, true),
    };
}

function walk(abs: string, rel: string, state: WalkState, depth: number): TreeNode {
    const name = path.basename(abs);
    const versionHere = isVersionDir(abs, name);
    const moduleHere = !versionHere && isModuleDir(abs);
    const kind: TreeNode["kind"] = versionHere ? "version" : moduleHere ? "module" : "folder";
    const moduleRoot = kind === "module" ? rel : kind === "version" ? toPosix(path.dirname(rel)) : null;
    const withLog = kind !== "folder" || depth <= 2;
    const children: TreeNode[] = [];
    if (depth < 12 && kind !== "version") {
        const entries = listDirs(abs).sort((a, b) => a.name.localeCompare(b.name, "es"));
        for (const entry of entries) {
            const childAbs = path.join(abs, entry.name);
            const childRel = rel ? `${rel}/${entry.name}` : entry.name;
            children.push(walk(childAbs, childRel, state, depth + 1));
        }
    }
    if (kind === "module") {
        state.modules.push(buildModule(abs, rel, state));
    }
    return {
        name: rel ? name : path.basename(state.root),
        relativePath: rel,
        kind,
        moduleRoot,
        git: gitInfoFor(abs, state.root, state.repoCache, state.snaps, withLog),
        children,
    };
}

function buckets(map: Map<string, number>): StatBucket[] {
    return [...map.entries()]
        .filter(([key]) => key.trim() !== "")
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "es"));
}

function buildStats(modules: ModuleSummary[]): AddonsStats {
    const byArea = new Map<string, number>();
    const byTipo = new Map<string, number>();
    const byVersion = new Map<string, number>();
    let gitSubido = 0;
    let gitNoSubido = 0;
    let gitCambios = 0;
    for (const addon of modules) {
        if (addon.area) byArea.set(addon.area, (byArea.get(addon.area) || 0) + 1);
        if (addon.tipoNegocio) byTipo.set(addon.tipoNegocio, (byTipo.get(addon.tipoNegocio) || 0) + 1);
        const versions = addon.versions.length > 0 ? addon.versions : [""];
        for (const version of versions) {
            if (!version) continue;
            byVersion.set(version, (byVersion.get(version) || 0) + 1);
        }
        if (addon.git.badge === "subido") gitSubido += 1;
        else if (addon.git.badge === "cambios_pendientes") gitCambios += 1;
        else gitNoSubido += 1;
    }
    return {
        totalModules: modules.length,
        byArea: buckets(byArea),
        byTipo: buckets(byTipo),
        byVersion: buckets(byVersion),
        gitSubido,
        gitNoSubido,
        gitCambios,
    };
}

export function scanAddons(rootInput: string): ScanResponse {
    const root = assertAbsoluteRoot(rootInput);
    const { rows, warnings } = loadMapa(root);
    const state: WalkState = {
        root,
        mapa: rows,
        modules: [],
        repoCache: new Map(),
        snaps: new Map(),
    };
    const tree = walk(root, "", state, 0);
    tree.name = path.basename(root);
    const modules = state.modules.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "es"));
    const areas = [...new Set(modules.map((item) => item.area).filter(Boolean))].sort();
    const tipos = [...new Set(modules.map((item) => item.tipoNegocio).filter(Boolean))].sort();
    const clientes = [...new Set(modules.map((item) => item.cliente).filter(Boolean))].sort();
    return {
        available: true,
        root,
        tree,
        modules,
        stats: buildStats(modules),
        areas,
        tipos,
        clientes,
        warnings,
        defaultRoot: defaultConfiguredRoot(),
    };
}

function readTextLimited(filePath: string): string {
    const stat = fs.statSync(filePath);
    const handle = fs.openSync(filePath, "r");
    try {
        const length = Math.min(stat.size, 20000);
        const buffer = Buffer.alloc(length);
        fs.readSync(handle, buffer, 0, length, 0);
        return buffer.toString("utf8");
    } finally {
        fs.closeSync(handle);
    }
}

function findReadme(dir: string): { name: string; text: string } | null {
    const names = ["README.md", "README.rst", "README.txt"];
    const direct = findNamedFile(dir, names);
    if (direct) return direct;
    for (const entry of listDirs(dir)) {
        if (!VERSION_RE.test(entry.name)) continue;
        const nested = findNamedFile(path.join(dir, entry.name), names);
        if (nested) return nested;
    }
    return null;
}

function findNamedFile(dir: string, names: string[]): { name: string; text: string } | null {
    for (const name of names) {
        const file = path.join(dir, name);
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            return { name, text: readTextLimited(file) };
        }
    }
    return null;
}

function findMotivo(dir: string): { name: string; text: string } | null {
    const entries = fs.readdirSync(dir);
    const match = entries.find((name) => /^MOTIVO.*\.txt$/i.test(name));
    if (!match) return null;
    return { name: match, text: readTextLimited(path.join(dir, match)) };
}

function fileStats(dir: string): { fileCount: number; totalBytes: number } {
    let fileCount = 0;
    let totalBytes = 0;
    const stack = [dir];
    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) break;
        let entries: fs.Dirent[] = [];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (entry.name === ".git" || entry.name === "__pycache__") continue;
            const full = path.join(current, entry.name);
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) {
                stack.push(full);
                continue;
            }
            if (!entry.isFile()) continue;
            fileCount += 1;
            try {
                totalBytes += fs.statSync(full).size;
            } catch {
                /* archivo desaparecido */
            }
        }
    }
    return { fileCount, totalBytes };
}

export function detailAddons(rootInput: string, relativePath: string): DetailResponse {
    const root = assertAbsoluteRoot(rootInput);
    const abs = resolveExisting(root, relativePath);
    const stat = fs.statSync(abs);
    if (!stat.isDirectory()) throw new Error("El módulo tiene que ser una carpeta");
    const rel = toPosix(path.relative(root, abs));
    const moduleAbs = isVersionDir(abs, path.basename(abs)) ? path.dirname(abs) : abs;
    const moduleRel = toPosix(path.relative(root, moduleAbs));
    const { rows } = loadMapa(root);
    const state: WalkState = {
        root,
        mapa: rows,
        modules: [],
        repoCache: new Map(),
        snaps: new Map(),
    };
    const addon = isModuleDir(moduleAbs)
        ? buildModule(moduleAbs, moduleRel, state)
        : buildModule(abs, rel, state);
    if (isVersionDir(abs, path.basename(abs))) {
        addon.git = gitInfoFor(abs, root, state.repoCache, state.snaps, true);
        addon.relativePath = rel;
    }
    const manifests = discoverVersions(moduleAbs, moduleRel);
    const readme = findReadme(abs) || (abs === moduleAbs ? null : findReadme(moduleAbs));
    const motivo = findMotivo(abs) || findMotivo(moduleAbs);
    const files = fileStats(abs);
    const detail: ModuleDetail = {
        module: addon,
        manifests,
        fileCount: files.fileCount,
        totalBytes: files.totalBytes,
        readme,
        motivo,
        git: addon.git,
    };
    return { available: true, detail };
}

function requireConfirm(flag: boolean | undefined): void {
    if (flag !== true) throw new Error("Esta acción necesita confirmación");
}

function ensureGitignore(dir: string): void {
    const file = path.join(dir, ".gitignore");
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    const missing = GITIGNORE_LINES.filter((line) => !current.split(/\r?\n/).includes(line));
    if (missing.length === 0 && current) return;
    const prefix = current && !current.endsWith("\n") ? `${current}\n` : current;
    const header = current.includes("RNV Manager") ? "" : `${prefix ? "" : "# Generado por RNV Manager\n"}`;
    const block = missing.length > 0 ? `${header}${missing.join("\n")}\n` : "";
    if (!current) {
        fs.writeFileSync(file, `# Generado por RNV Manager\n${GITIGNORE_LINES.join("\n")}\n`, "utf8");
        return;
    }
    if (block.trim()) fs.writeFileSync(file, `${prefix}${block}`, "utf8");
}

function gitIdentityArgs(cwd: string): string[] {
    const name = run("git", ["config", "user.name"], cwd);
    if (name.code === 0 && name.stdout.trim()) return [];
    return ["-c", "user.name=RNV Manager", "-c", "user.email=addons@renace.tech"];
}

function repoRootOf(abs: string): string | null {
    const top = run("git", ["rev-parse", "--show-toplevel"], abs);
    if (top.code !== 0) return null;
    return path.resolve(top.stdout.trim());
}

function openInFinder(abs: string): string {
    const platform = process.platform;
    if (platform === "darwin") {
        const result = run("open", [abs], abs);
        if (result.code !== 0) throw new Error(result.stderr || "No se pudo abrir Finder");
        return "Carpeta abierta en Finder";
    }
    if (platform === "win32") {
        const result = run("explorer", [abs], abs);
        if (result.code !== 0) throw new Error(result.stderr || "No se pudo abrir el explorador");
        return "Carpeta abierta";
    }
    const result = run("xdg-open", [abs], abs);
    if (result.code !== 0) throw new Error(result.stderr || "No se pudo abrir la carpeta");
    return "Carpeta abierta";
}

function openInEditor(abs: string): string {
    if (process.platform === "darwin") {
        for (const app of ["Cursor", "Visual Studio Code"]) {
            const result = run("open", ["-a", app, abs], abs);
            if (result.code === 0) return `Abierto en ${app}`;
        }
    }
    for (const bin of ["cursor", "code"]) {
        const result = run(bin, [abs], abs);
        if (result.code === 0) return `Abierto en ${bin}`;
    }
    return openInFinder(abs);
}

function gitInit(abs: string): string {
    if (fs.existsSync(path.join(abs, ".git"))) {
        throw new Error("Esta carpeta ya es un repositorio Git");
    }
    const result = run("git", ["init"], abs);
    if (result.code !== 0) throw new Error(result.stderr || "git init falló");
    ensureGitignore(abs);
    return "Repositorio Git creado y .gitignore aplicado";
}

function gitCommit(abs: string, message: string): string {
    const repo = repoRootOf(abs);
    if (!repo) throw new Error("Esta carpeta no está dentro de un repositorio Git");
    const text = message.trim();
    if (!text) throw new Error("Escribe un mensaje de commit");
    if (text.length > 500) throw new Error("El mensaje es demasiado largo");
    const rel = toPosix(path.relative(repo, abs)) || ".";
    const add = run("git", ["add", "-A", "--", rel], repo);
    if (add.code !== 0) throw new Error(add.stderr || "No se pudieron preparar los archivos");
    const staged = run("git", ["diff", "--cached", "--quiet", "--", rel], repo);
    if (staged.code === 0) throw new Error("No hay cambios para confirmar");
    const commit = run("git", [...gitIdentityArgs(repo), "commit", "-m", text, "--", rel], repo);
    if (commit.code !== 0) throw new Error(commit.stderr || commit.stdout || "El commit falló");
    return "Commit creado";
}

function gitPush(abs: string, remote: string): string {
    const repo = repoRootOf(abs);
    if (!repo) throw new Error("Esta carpeta no está dentro de un repositorio Git");
    const url = remote.trim();
    if (!isGithubRemote(url)) {
        throw new Error("El remoto tiene que ser un repositorio de GitHub por SSH o HTTPS, sin token");
    }
    const current = run("git", ["remote", "get-url", "origin"], repo);
    if (current.code !== 0) {
        const added = run("git", ["remote", "add", "origin", url], repo);
        if (added.code !== 0) throw new Error(added.stderr || "No se pudo agregar el remoto");
    } else if (current.stdout.trim() !== url) {
        const updated = run("git", ["remote", "set-url", "origin", url], repo);
        if (updated.code !== 0) throw new Error(updated.stderr || "No se pudo actualizar el remoto");
    }
    const pushed = run("git", ["push", "-u", "origin", "HEAD"], repo, 60000);
    if (pushed.code !== 0) {
        throw new Error(pushed.stderr || pushed.stdout || "git push falló. Revisa la clave SSH y que el repo exista en GitHub.");
    }
    return "Cambios subidos a GitHub";
}

function moveDirectory(from: string, to: string): void {
    if (fs.existsSync(to)) throw new Error("Ya existe una carpeta en el destino");
    fs.mkdirSync(path.dirname(to), { recursive: true });
    try {
        fs.renameSync(from, to);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EXDEV") throw error;
        fs.cpSync(from, to, { recursive: true });
        fs.rmSync(from, { recursive: true, force: true });
    }
}

function updateMapaLocation(
    root: string,
    moduleName: string,
    fromRel: string,
    toRel: string,
    estado?: string,
    reemplazadoPor?: string
): void {
    const { rows } = loadMapa(root);
    const fromKey = areaOrClientFor(fromRel);
    const toKey = areaOrClientFor(toRel);
    const toMeta = classify(toRel);
    let touched = 0;
    const next = rows.map((row) => {
        const matches =
            row.module === moduleName &&
            (row.areaOrClient === fromKey || row.areaOrClient === `${fromKey}/${moduleName}`);
        if (!matches) return row;
        touched += 1;
        return {
            ...row,
            areaOrClient: toKey,
            tipoNegocio:
                toMeta.category === "clientes"
                    ? toMeta.tipoNegocio
                    : toMeta.category === "comunes"
                      ? ""
                      : row.tipoNegocio,
            estado: estado || (toMeta.category === "archivados" ? "archivado" : row.estado === "archivado" ? "keeper" : row.estado),
            reemplazadoPor: reemplazadoPor ?? row.reemplazadoPor,
        };
    });
    if (touched === 0) {
        next.push({
            module: moduleName,
            areaOrClient: toKey,
            tipoNegocio: toMeta.tipoNegocio,
            versions: toMeta.version || "",
            clientsUsing: "",
            ubicaciones: "",
            estado: estado || (toMeta.category === "archivados" ? "archivado" : "keeper"),
            reemplazadoPor: reemplazadoPor || "",
            clientesAMigrar: "",
            familia: "",
            instaladoEnClientes: "",
        });
    }
    writeMapa(root, next);
}

function destinationFor(root: string, moduleName: string, categoryPath: string): string {
    if (categoryPath.includes("\0")) throw new Error("Destino inválido");
    const cleaned = categoryPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!cleaned || cleaned.split("/").includes("..") || path.posix.isAbsolute(cleaned)) {
        throw new Error("Destino inválido");
    }
    const allowed =
        cleaned === "_revisar" ||
        cleaned === "_archivados" ||
        /^comunes\/[^/]+$/.test(cleaned) ||
        /^clientes\/[^/]+\/[^/]+$/.test(cleaned);
    if (!allowed) throw new Error("El destino tiene que ser comunes/<área>, clientes/<tipo>/<cliente>, _revisar o _archivados");
    const folder = cleaned === "_archivados" ? `_archivados/${moduleName}` : `${cleaned}/${moduleName}`;
    return insideRoot(root, path.resolve(root, folder));
}

function moveModule(root: string, relativePath: string, categoryPath: string, estado?: string, reemplazadoPor?: string): string {
    const abs = resolveExisting(root, relativePath);
    const moduleAbs = isVersionDir(abs, path.basename(abs)) ? path.dirname(abs) : abs;
    const fromRel = toPosix(path.relative(root, moduleAbs));
    const moduleName = path.basename(moduleAbs);
    const target = destinationFor(root, moduleName, categoryPath);
    if (path.resolve(target) === path.resolve(moduleAbs)) throw new Error("El módulo ya está en ese lugar");
    moveDirectory(moduleAbs, target);
    const toRel = toPosix(path.relative(root, target));
    updateMapaLocation(root, moduleName, fromRel, toRel, estado, reemplazadoPor);
    return toRel;
}

function writeMotivo(dir: string, motivo: string, reemplazadoPor: string, previous: string): void {
    const lines = [
        `Motivo: ${motivo.trim() || "Archivado desde RNV Manager"}`,
        `Reemplazado por: ${reemplazadoPor.trim() || "—"}`,
        `Ubicación anterior: ${previous}`,
        `Archivado: ${new Date().toISOString()}`,
        "Restaurar: mover esta carpeta de vuelta a la ubicación anterior.",
        "",
    ];
    fs.writeFileSync(path.join(dir, "MOTIVO.txt"), lines.join("\n"), "utf8");
}

function shouldSkipZip(relativeName: string): boolean {
    const base = path.posix.basename(relativeName);
    if (base.endsWith(".pyc")) return true;
    if (relativeName.split("/").includes("__pycache__")) return true;
    return /RNC_Contribuyentes.*\.csv$/i.test(base);
}

function exportZip(abs: string, moduleName: string): { filePath: string; filename: string } {
    const filename = `${moduleName}.zip`;
    const dest = path.join(os.tmpdir(), `rnv-addons-${Date.now()}-${filename}`);
    const py = run(
        "python3",
        [
            "-c",
            [
                "import os, sys, zipfile, fnmatch",
                "root, dest = sys.argv[1], sys.argv[2]",
                "def skip(rel):",
                "    base = os.path.basename(rel)",
                "    if base.endswith('.pyc') or '__pycache__' in rel.split(os.sep):",
                "        return True",
                "    return fnmatch.fnmatch(base, '*RNC_Contribuyentes*.csv')",
                "with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as zf:",
                "    for dirpath, dirnames, filenames in os.walk(root):",
                "        dirnames[:] = [d for d in dirnames if d not in ('.git', '__pycache__')]",
                "        for name in filenames:",
                "            full = os.path.join(dirpath, name)",
                "            rel = os.path.relpath(full, os.path.dirname(root))",
                "            if skip(os.path.relpath(full, root)):",
                "                continue",
                "            zf.write(full, rel)",
            ].join("\n"),
            abs,
            dest,
        ],
        path.dirname(abs),
        60000
    );
    if (py.code !== 0 || !fs.existsSync(dest)) {
        throw new Error(py.stderr || "No se pudo crear el ZIP");
    }
    return { filePath: dest, filename };
}

export type ActionInput = {
    root: string;
    action: string;
    relativePath?: string;
    message?: string;
    remote?: string;
    destination?: string;
    motivo?: string;
    reemplazadoPor?: string;
    confirm?: boolean;
};

export function runAction(input: ActionInput): ActionResponse | { zipPath: string; filename: string } {
    const root = assertAbsoluteRoot(input.root);
    const action = input.action;
    if (action === "open" || action === "editor") {
        const abs = resolveExisting(root, input.relativePath || "");
        const message = action === "editor" ? openInEditor(abs) : openInFinder(abs);
        return { available: true, ok: true, message };
    }
    requireConfirm(input.confirm);
    const abs = resolveExisting(root, input.relativePath || "");
    if (action === "git_init") {
        return { available: true, ok: true, message: gitInit(abs) };
    }
    if (action === "commit") {
        return { available: true, ok: true, message: gitCommit(abs, input.message || "") };
    }
    if (action === "push") {
        return { available: true, ok: true, message: gitPush(abs, input.remote || "") };
    }
    if (action === "move" || action === "archive" || action === "restore") {
        const destination =
            action === "archive" ? "_archivados" : (input.destination || "").trim();
        if (!destination) throw new Error("Falta el destino");
        const estado = action === "archive" ? "archivado" : action === "restore" ? "keeper" : undefined;
        const fromRel = toPosix(path.relative(root, isVersionDir(abs, path.basename(abs)) ? path.dirname(abs) : abs));
        const toRel = moveModule(root, input.relativePath || "", destination, estado, input.reemplazadoPor);
        if (action === "archive") {
            writeMotivo(path.join(root, toRel), input.motivo || "", input.reemplazadoPor || "", fromRel);
        }
        const verb = action === "archive" ? "archivado" : action === "restore" ? "restaurado" : "movido";
        return { available: true, ok: true, message: `Módulo ${verb} a ${toRel}. mapa.csv actualizado.` };
    }
    if (action === "export") {
        const moduleAbs = isVersionDir(abs, path.basename(abs)) ? path.dirname(abs) : abs;
        const zip = exportZip(moduleAbs, path.basename(moduleAbs));
        return { zipPath: zip.filePath, filename: zip.filename };
    }
    throw new Error("Acción desconocida");
}

export function zipShouldSkip(relativeName: string): boolean {
    return shouldSkipZip(relativeName);
}
