"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    Box, CircleDollarSign, ExternalLink, FolderGit2, Globe2,
    PackageSearch, RefreshCw, Server, TerminalSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

type InventoryService = {
    id: string;
    name: string;
    type: string;
    runtime?: string;
    image?: string;
    status: string;
    port?: number;
    url?: string;
    domains?: string[];
    projectPath?: string;
    purpose?: string;
    clientName?: string;
    monthlyRevenue: number;
    generatesRevenue: boolean;
};

type Discovery = {
    hostname?: string;
    addresses?: string[];
    containers?: unknown[];
    projects?: Array<{ name: string; path: string; kind: string }>;
    systemServices?: unknown[];
    listeningPorts?: string[];
    proxyDomains?: string[];
};

type InventoryServer = {
    vpsId: string;
    vpsName: string;
    ip: string;
    provider: string;
    status: string;
    client?: { id: string; name: string };
    services: InventoryService[];
    inventory?: Discovery;
    scannedAt?: string;
    economics: {
        monthlyRevenue: number;
        monthlyExpense: number;
        netProfit: number;
        profitable: boolean;
        serviceRevenue: number;
    };
};

type InventoryResponse = {
    success: boolean;
    data: InventoryServer[];
    totals: {
        servers: number;
        services: number;
        monthlyRevenue: number;
        monthlyExpense: number;
        netProfit: number;
        unassignedServices: number;
    };
};

const money = (value?: number) => `$${(value || 0).toFixed(2)}`;

export default function InventoryPage() {
    const { addToast } = useToast();
    const [report, setReport] = useState<InventoryResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState<string | null>(null);

    const loadInventory = useCallback(async () => {
        try {
            const res = await fetch("/api/inventory");
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar");
            setReport(data);
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error cargando inventario", "error");
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        void loadInventory();
    }, [loadInventory]);

    const scan = async (vpsId?: string) => {
        setScanning(vpsId || "all");
        try {
            const suffix = vpsId ? `?vpsId=${encodeURIComponent(vpsId)}` : "";
            const res = await fetch(`/api/inventory/scan${suffix}`, { method: "POST" });
            const data = await res.json();
            const failed = data?.totals?.failed || 0;
            if (!res.ok) throw new Error(data.error || "Falló el escaneo");
            if (failed > 0) {
                addToast(`Escaneo completado con ${failed} servidor(es) fallido(s)`, "warning");
            } else {
                addToast("Inventario actualizado", "success");
            }
            await loadInventory();
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error escaneando", "error");
        } finally {
            setScanning(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-[60vh] grid place-items-center">
                <RefreshCw className="w-8 h-8 animate-spin text-violet-600" />
            </div>
        );
    }

    const totals = report?.totals;
    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <PackageSearch className="w-8 h-8 text-violet-600" />
                        Inventario Real
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        IP, proyectos, Docker, systemd, puertos, dominios, responsable y rentabilidad.
                    </p>
                </div>
                <Button
                    onClick={() => scan()}
                    disabled={scanning !== null}
                    className="rounded-xl gap-2 bg-violet-600 hover:bg-violet-700"
                >
                    <RefreshCw className={`w-4 h-4 ${scanning === "all" ? "animate-spin" : ""}`} />
                    Escanear todos
                </Button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                    ["Servidores", totals?.servers || 0],
                    ["Servicios", totals?.services || 0],
                    ["Ingreso/mes", money(totals?.monthlyRevenue)],
                    ["Costo/mes", money(totals?.monthlyExpense)],
                    ["Beneficio neto", money(totals?.netProfit)],
                ].map(([label, value]) => (
                    <Card key={String(label)} className="rounded-2xl border-2">
                        <CardContent className="p-4">
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <p className="text-xl font-bold mt-1">{value}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {(totals?.unassignedServices || 0) > 0 && (
                <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 text-amber-900">
                    <strong>{totals?.unassignedServices} servicio(s) sin responsable.</strong>{" "}
                    Asígnales cliente y finalidad para conocer su valor real.
                </div>
            )}

            <div className="space-y-5">
                {report?.data.map((server) => (
                    <Card key={server.vpsId} className="rounded-2xl border-2 overflow-hidden">
                        <CardHeader className="border-b bg-gradient-to-r from-violet-50/80 to-transparent">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <Server className="w-5 h-5 text-violet-600" />
                                        {server.vpsName}
                                        <Badge variant="outline">{server.status}</Badge>
                                    </CardTitle>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        {server.ip} · {server.provider} ·{" "}
                                        {server.client?.name || "sin cliente principal"}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-right text-sm">
                                        <p>Ingreso {money(server.economics.monthlyRevenue)}</p>
                                        <p className={server.economics.profitable ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
                                            Neto {money(server.economics.netProfit)}
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={scanning !== null}
                                        onClick={() => scan(server.vpsId)}
                                        className="gap-2"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${scanning === server.vpsId ? "animate-spin" : ""}`} />
                                        Escanear
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-5 space-y-5">
                            <div className="grid md:grid-cols-4 gap-3 text-sm">
                                <div className="rounded-xl bg-gray-50 p-3">
                                    <Box className="w-4 h-4 mb-1 text-violet-600" />
                                    <strong>{server.inventory?.containers?.length || 0}</strong> contenedores
                                </div>
                                <div className="rounded-xl bg-gray-50 p-3">
                                    <FolderGit2 className="w-4 h-4 mb-1 text-violet-600" />
                                    <strong>{server.inventory?.projects?.length || 0}</strong> proyectos
                                </div>
                                <div className="rounded-xl bg-gray-50 p-3">
                                    <TerminalSquare className="w-4 h-4 mb-1 text-violet-600" />
                                    <strong>{server.inventory?.listeningPorts?.length || 0}</strong> puertos
                                </div>
                                <div className="rounded-xl bg-gray-50 p-3">
                                    <Globe2 className="w-4 h-4 mb-1 text-violet-600" />
                                    <strong>{server.inventory?.proxyDomains?.length || 0}</strong> dominios
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-muted-foreground">
                                            <th className="py-2 pr-3">Servicio</th>
                                            <th className="py-2 pr-3">Dominio / carpeta</th>
                                            <th className="py-2 pr-3">Finalidad / cliente</th>
                                            <th className="py-2 text-right">Ingreso</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {server.services.map((service) => (
                                            <tr key={service.id} className="border-b last:border-0 align-top">
                                                <td className="py-3 pr-3">
                                                    <Link href={`/services/${service.id}`} className="font-semibold hover:text-violet-600">
                                                        {service.name}
                                                    </Link>
                                                    <p className="text-xs text-muted-foreground">
                                                        {service.runtime || service.type} · {service.status}
                                                    </p>
                                                </td>
                                                <td className="py-3 pr-3 max-w-xs">
                                                    {service.url ? (
                                                        <a href={service.url} target="_blank" rel="noreferrer" className="text-violet-600 inline-flex gap-1 items-center">
                                                            {service.domains?.[0] || service.url}
                                                            <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                    ) : (
                                                        <span className="text-muted-foreground">sin dominio</span>
                                                    )}
                                                    <p className="text-xs text-muted-foreground truncate" title={service.projectPath}>
                                                        {service.projectPath || "carpeta no detectada"}
                                                    </p>
                                                </td>
                                                <td className="py-3 pr-3">
                                                    <p>{service.purpose || "finalidad no definida"}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {service.clientName || "sin cliente/responsable"}
                                                    </p>
                                                </td>
                                                <td className="py-3 text-right">
                                                    <span className={service.generatesRevenue ? "text-emerald-600 font-semibold" : "text-amber-600"}>
                                                        {money(service.monthlyRevenue)}
                                                    </span>
                                                    {!service.generatesRevenue && (
                                                        <p className="text-xs">sin ingreso</p>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {server.inventory?.projects && server.inventory.projects.length > 0 && (
                                <details className="rounded-xl border p-3">
                                    <summary className="cursor-pointer font-medium flex items-center gap-2">
                                        <FolderGit2 className="w-4 h-4" /> Carpetas/proyectos detectados
                                    </summary>
                                    <div className="mt-3 grid md:grid-cols-2 gap-2 text-xs">
                                        {server.inventory.projects.map((project, index) => (
                                            <code key={`${project.path}-${index}`} className="rounded bg-gray-50 p-2 break-all">
                                                {project.path} <span className="text-violet-600">({project.kind})</span>
                                            </code>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
