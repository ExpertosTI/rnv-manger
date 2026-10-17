"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Blocks, MonitorSmartphone, RefreshCw, Search } from "lucide-react";
import { AddonDetail } from "@/components/addons/AddonDetail";
import { AddonTree } from "@/components/addons/AddonTree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchAddonsScan } from "@/lib/addons/client";
import { readAddonsRoot, writeAddonsRoot } from "@/lib/addons/storage";
import {
    DEFAULT_ADDONS_ROOT,
    DESKTOP_ONLY_MESSAGE,
    type ModuleSummary,
    type ScanResponse,
    type TreeNode,
} from "@/lib/addons/types";

type Filters = {
    query: string;
    area: string;
    tipo: string;
    cliente: string;
    version: string;
    estado: string;
};

const EMPTY_FILTERS: Filters = { query: "", area: "", tipo: "", cliente: "", version: "", estado: "" };

function treeHas(node: TreeNode | undefined, path: string): boolean {
    if (!node) return false;
    if (node.relativePath === path) return true;
    return node.children.some((child) => treeHas(child, path));
}

function filtersActive(filters: Filters): boolean {
    return Object.values(filters).some((value) => value.trim() !== "");
}

function moduleMatches(module: ModuleSummary, filters: Filters): boolean {
    if (filters.area && module.area !== filters.area) return false;
    if (filters.tipo && module.tipoNegocio !== filters.tipo) return false;
    if (filters.cliente && module.cliente !== filters.cliente) return false;
    if (filters.version && !module.versions.includes(filters.version)) return false;
    if (filters.estado && module.estado !== filters.estado) return false;
    const query = filters.query.trim().toLowerCase();
    if (!query) return true;
    const blob = [module.name, module.manifestName, module.summary, module.area, module.cliente, module.tipoNegocio, module.relativePath, module.estado]
        .join(" ")
        .toLowerCase();
    return blob.includes(query);
}

function filterTree(node: TreeNode, modules: Map<string, ModuleSummary>, filters: Filters, active: boolean): TreeNode | null {
    if (!active) return node;
    const children = node.children
        .map((child) => filterTree(child, modules, filters, true))
        .filter((child): child is TreeNode => child !== null);
    if (node.kind === "version") {
        const owner = node.moduleRoot ? modules.get(node.moduleRoot) : undefined;
        if (!owner || !moduleMatches(owner, filters)) return null;
        if (filters.version && node.name !== filters.version) return null;
        return { ...node, children };
    }
    if (node.kind === "module") {
        const addon = modules.get(node.relativePath);
        if (!addon || !moduleMatches(addon, filters)) {
            return children.length > 0 ? { ...node, children } : null;
        }
        return { ...node, children };
    }
    if (children.length > 0 || node.relativePath === "") return { ...node, children };
    return null;
}

function AddonsScreen() {
    const searchParams = useSearchParams();
    const [root, setRoot] = useState(DEFAULT_ADDONS_ROOT);
    const [draft, setDraft] = useState(DEFAULT_ADDONS_ROOT);
    const [ready, setReady] = useState(false);
    const [scan, setScan] = useState<ScanResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshToken, setRefreshToken] = useState(0);
    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
    const [selected, setSelected] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set([""]));

    useEffect(() => {
        const fromQuery = searchParams.get("root");
        const next = (fromQuery || readAddonsRoot()).trim() || DEFAULT_ADDONS_ROOT;
        setRoot(next);
        setDraft(next);
        if (fromQuery) writeAddonsRoot(next);
        setReady(true);
    }, [searchParams]);

    useEffect(() => {
        if (!ready) return;
        let cancelled = false;
        setLoading(true);
        fetchAddonsScan(root)
            .then((data) => {
                if (!cancelled) setScan(data);
            })
            .catch(() => {
                if (!cancelled) setScan({ available: false, message: DESKTOP_ONLY_MESSAGE });
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [ready, root, refreshToken]);

    useEffect(() => {
        if (!scan?.tree) return;
        const next = new Set<string>([""]);
        for (const child of scan.tree.children) next.add(child.relativePath);
        setExpanded(next);
        const first = scan.modules?.[0]?.relativePath || null;
        setSelected((current) => (current && treeHas(scan.tree, current) ? current : first));
    }, [scan]);

    const modules = scan?.modules || [];
    const moduleMap = new Map(modules.map((module) => [module.relativePath, module]));
    const active = filtersActive(filters);
    const tree = scan?.tree ? filterTree(scan.tree, moduleMap, filters, active) : null;
    const stats = scan?.stats;
    const versions = [...new Set(modules.flatMap((module) => module.versions))].sort();
    const estados = [...new Set(modules.map((module) => module.estado).filter(Boolean))].sort();
    const selectedSummary = selected ? moduleMap.get(selected) || (selected.includes("/") ? moduleMap.get(selected.split("/").slice(0, -1).join("/")) || null : null) : null;

    const saveRoot = () => {
        const next = writeAddonsRoot(draft);
        setRoot(next);
        setDraft(next);
        setSelected(null);
    };

    if (!ready || (loading && !scan)) {
        return (
            <div className="min-h-[50vh] grid place-items-center text-violet-600">
                <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
        );
    }

    if (scan && !scan.available) {
        return (
            <div className="space-y-6">
                <header>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Blocks className="w-8 h-8 text-violet-600" />
                        Addons
                    </h1>
                    <p className="text-muted-foreground mt-1">Módulos Odoo propios de RENACE</p>
                </header>
                <div className="rounded-2xl border-2 border-violet-200 bg-white p-8 shadow-sm max-w-2xl">
                    <MonitorSmartphone className="w-10 h-10 text-violet-600 mb-3" />
                    <h2 className="text-xl font-semibold">Disponible solo en escritorio</h2>
                    <p className="text-sm text-muted-foreground mt-2">{scan.message || DESKTOP_ONLY_MESSAGE}</p>
                    <p className="text-sm mt-4">
                        Abre la app de escritorio de RNV Manager. La raíz por defecto es{" "}
                        <code className="text-violet-700">{DEFAULT_ADDONS_ROOT}</code> y se puede cambiar en Configuración.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Blocks className="w-8 h-8 text-violet-600" />
                        Addons
                    </h1>
                    <p className="text-muted-foreground mt-1">Árbol de la raíz, manifests, mapa.csv y estado Git.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-1 lg:max-w-xl lg:justify-end">
                    <Input value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} aria-label="Ruta raíz de addons" />
                    <Button type="button" variant="outline" onClick={saveRoot}>Guardar</Button>
                    <Button type="button" onClick={() => setRefreshToken((value) => value + 1)} disabled={loading} className="bg-violet-600 hover:bg-violet-700">
                        <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                        Escanear
                    </Button>
                </div>
            </div>

            {scan?.message && !scan.tree && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{scan.message}</div>
            )}
            {scan?.warnings?.map((warning) => (
                <div key={warning} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{warning}</div>
            ))}

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Counter label="Módulos" value={stats?.totalModules ?? 0} />
                <Counter label="Subidos a Git" value={stats?.gitSubido ?? 0} />
                <Counter label="No subidos" value={stats?.gitNoSubido ?? 0} />
                <Counter label="Cambios pendientes" value={stats?.gitCambios ?? 0} />
                <Counter label="Versiones Odoo" value={stats?.byVersion.length ?? 0} />
            </div>

            <div className="grid md:grid-cols-3 gap-3 text-sm">
                <Bucket title="Por área" items={stats?.byArea || []} />
                <Bucket title="Por tipo de negocio" items={stats?.byTipo || []} />
                <Bucket title="Por versión Odoo" items={stats?.byVersion || []} />
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-6 gap-2">
                <div className="xl:col-span-2 relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input className="pl-9" placeholder="Buscar por nombre" value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} />
                </div>
                <FilterSelect label="Área" value={filters.area} onChange={(area) => setFilters((current) => ({ ...current, area }))} options={scan?.areas || []} />
                <FilterSelect label="Tipo de negocio" value={filters.tipo} onChange={(tipo) => setFilters((current) => ({ ...current, tipo }))} options={scan?.tipos || []} />
                <FilterSelect label="Cliente" value={filters.cliente} onChange={(cliente) => setFilters((current) => ({ ...current, cliente }))} options={scan?.clientes || []} />
                <FilterSelect label="Versión" value={filters.version} onChange={(version) => setFilters((current) => ({ ...current, version }))} options={versions} />
                <FilterSelect label="Estado" value={filters.estado} onChange={(estado) => setFilters((current) => ({ ...current, estado }))} options={estados} />
            </div>

            <div className="grid lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)] gap-4 items-start">
                <div className="rounded-2xl border-2 border-gray-100 bg-white p-3 max-h-[72vh] overflow-auto">
                    <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Raíz</p>
                    {tree ? (
                        <AddonTree
                            node={tree}
                            selected={selected}
                            expanded={expanded}
                            onToggle={(path) => {
                                setExpanded((current) => {
                                    const next = new Set(current);
                                    if (next.has(path)) next.delete(path);
                                    else next.add(path);
                                    return next;
                                });
                            }}
                            onSelect={(node) => setSelected(node.relativePath)}
                        />
                    ) : (
                        <p className="text-sm text-muted-foreground px-2 py-6">Ninguna carpeta coincide con el filtro.</p>
                    )}
                </div>
                {selected ? (
                    <AddonDetail
                        root={root}
                        relativePath={selected}
                        summary={selectedSummary}
                        areas={scan?.areas || []}
                        tipos={scan?.tipos || []}
                        clientes={scan?.clientes || []}
                        onChanged={() => setRefreshToken((value) => value + 1)}
                    />
                ) : (
                    <div className="rounded-2xl border-2 border-dashed border-gray-200 p-8 text-sm text-muted-foreground">
                        Elige un módulo del árbol para ver el manifest, los clientes y el estado Git.
                    </div>
                )}
            </div>
        </div>
    );
}

function Counter({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-2xl border-2 border-gray-100 bg-white p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
    );
}

function Bucket({ title, items }: { title: string; items: { key: string; count: number }[] }) {
    return (
        <div className="rounded-2xl border border-gray-100 bg-white p-3">
            <p className="text-xs font-semibold text-gray-500 mb-2">{title}</p>
            {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin datos</p>
            ) : (
                <div className="flex flex-wrap gap-1.5">
                    {items.map((item) => (
                        <span key={item.key} className="rounded-full bg-gray-50 border border-gray-200 px-2 py-0.5 text-xs">
                            {item.key} <strong>{item.count}</strong>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

function FilterSelect({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
}) {
    return (
        <select
            aria-label={label}
            className="h-10 rounded-xl border-2 border-gray-200 bg-white px-3 text-sm"
            value={value}
            onChange={(event) => onChange(event.target.value)}
        >
            <option value="">{label}</option>
            {options.map((option) => (
                <option key={option} value={option}>{option}</option>
            ))}
        </select>
    );
}

export default function AddonsPage() {
    return (
        <Suspense fallback={<div className="min-h-[50vh] grid place-items-center text-violet-600"><RefreshCw className="w-8 h-8 animate-spin" /></div>}>
            <AddonsScreen />
        </Suspense>
    );
}
