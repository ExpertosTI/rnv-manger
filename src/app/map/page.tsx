"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Network, Server, Users, Database, RefreshCw, DollarSign,
    ExternalLink, Circle
} from "lucide-react";
import { topology as topologyApi, type TopologyCluster } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

function statusColor(status: string) {
    const s = (status || "").toLowerCase();
    if (["running", "online", "active"].includes(s)) return "bg-emerald-100 text-emerald-800 border-emerald-200";
    if (["stopped", "offline", "inactive"].includes(s)) return "bg-red-100 text-red-800 border-red-200";
    return "bg-gray-100 text-gray-700 border-gray-200";
}

function isOnline(status: string) {
    return ["running", "online", "active"].includes((status || "").toLowerCase());
}

export default function MapPage() {
    const [clusters, setClusters] = useState<TopologyCluster[]>([]);
    const [totals, setTotals] = useState({ clients: 0, vps: 0, services: 0, monthlyRevenue: 0 });
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<TopologyCluster | null>(null);
    const { addToast } = useToast();

    const load = async () => {
        setLoading(true);
        try {
            const res = await topologyApi.map();
            setClusters(res.clusters || []);
            setTotals(res.totals || { clients: 0, vps: 0, services: 0, monthlyRevenue: 0 });
        } catch {
            addToast("Error al cargar mapa", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Network className="w-8 h-8 text-violet-600" />
                        Mapa de Infraestructura
                    </h2>
                    <p className="text-muted-foreground">
                        Nodos: Cliente → VPS → Servicios · costos, estado y cobros
                    </p>
                </div>
                <Button variant="outline" onClick={load} disabled={loading} className="gap-2 rounded-xl border-2">
                    <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Actualizar
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card className="rounded-2xl border-2"><CardContent className="pt-5 flex gap-3">
                    <Users className="w-5 h-5 text-violet-600" />
                    <div><p className="text-xs text-muted-foreground">Clientes</p><p className="text-2xl font-bold">{totals.clients}</p></div>
                </CardContent></Card>
                <Card className="rounded-2xl border-2"><CardContent className="pt-5 flex gap-3">
                    <Server className="w-5 h-5 text-blue-600" />
                    <div><p className="text-xs text-muted-foreground">VPS</p><p className="text-2xl font-bold">{totals.vps}</p></div>
                </CardContent></Card>
                <Card className="rounded-2xl border-2"><CardContent className="pt-5 flex gap-3">
                    <Database className="w-5 h-5 text-cyan-600" />
                    <div><p className="text-xs text-muted-foreground">Servicios</p><p className="text-2xl font-bold">{totals.services}</p></div>
                </CardContent></Card>
                <Card className="rounded-2xl border-2 bg-gradient-to-br from-violet-50 to-purple-50"><CardContent className="pt-5 flex gap-3">
                    <DollarSign className="w-5 h-5 text-violet-600" />
                    <div><p className="text-xs text-muted-foreground">Ingresos/mes</p><p className="text-2xl font-bold">${totals.monthlyRevenue.toFixed(0)}</p></div>
                </CardContent></Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                    {loading ? (
                        <div className="flex justify-center py-16"><RefreshCw className="w-8 h-8 text-violet-500 animate-spin" /></div>
                    ) : clusters.length === 0 ? (
                        <Card className="rounded-2xl border-2 p-12 text-center text-muted-foreground">
                            Sin datos. Restaura el backup o escanea VPS en Servicios.
                        </Card>
                    ) : (
                        clusters.map((cluster) => (
                            <Card
                                key={cluster.vpsId}
                                className={`rounded-2xl border-2 cursor-pointer transition-all hover:border-violet-300 hover:shadow-md ${
                                    selected?.vpsId === cluster.vpsId ? "border-violet-500 ring-2 ring-violet-100" : ""
                                }`}
                                onClick={() => setSelected(cluster)}
                            >
                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <div className="p-2 rounded-lg bg-blue-100">
                                                <Server className="w-5 h-5 text-blue-600" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-base">{cluster.vpsName}</CardTitle>
                                                <p className="text-sm text-muted-foreground font-mono">{cluster.ip}</p>
                                            </div>
                                        </div>
                                        <Badge className={statusColor(cluster.status)}>{cluster.status || "unknown"}</Badge>
                                    </div>
                                    {cluster.clientName && (
                                        <div className="flex items-center gap-2 mt-2 text-sm">
                                            <Users size={14} className="text-cyan-600" />
                                            <span className="font-medium text-cyan-800">{cluster.clientName}</span>
                                            <span className="text-muted-foreground">· dueño del VPS</span>
                                        </div>
                                    )}
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-wrap gap-2 mb-3 text-xs text-muted-foreground">
                                        <span>{cluster.serviceCount} servicios</span>
                                        {cluster.monthlyCost != null && <span>· VPS ${cluster.monthlyCost}/mes</span>}
                                        {cluster.totalClusterCost != null && (
                                            <span className="font-semibold text-violet-700">· Total cluster ${cluster.totalClusterCost.toFixed(2)}/mes</span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {(cluster.services || []).map((svc, i) => (
                                            <div
                                                key={svc.id || i}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-white text-xs"
                                            >
                                                <Circle size={8} className={isOnline(svc.status) ? "fill-emerald-500 text-emerald-500" : "fill-gray-400 text-gray-400"} />
                                                <span className="font-medium">{svc.name}</span>
                                                {svc.charge != null && svc.charge > 0 && (
                                                    <span className="text-violet-600">${svc.charge}{svc.chargeCycle === "annual" ? "/año" : "/mes"}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    {cluster.vpsId !== "unassigned" && (
                                        <Link href={`/vps/${cluster.vpsId}`} className="inline-block mt-3 text-xs text-violet-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                                            Gestionar VPS →
                                        </Link>
                                    )}
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>

                <Card className="rounded-2xl border-2 h-fit sticky top-4">
                    <CardHeader>
                        <CardTitle className="text-base">Detalle del nodo</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!selected ? (
                            <p className="text-sm text-muted-foreground">Selecciona un VPS para ver servicios, costos y cliente.</p>
                        ) : (
                            <div className="space-y-4 text-sm">
                                <div>
                                    <p className="font-bold text-lg">{selected.vpsName}</p>
                                    <p className="text-muted-foreground font-mono">{selected.ip}</p>
                                </div>
                                {selected.clientName && (
                                    <div className="p-3 rounded-xl bg-cyan-50 border border-cyan-100">
                                        <p className="text-xs text-cyan-600 uppercase font-bold">Cliente</p>
                                        <p className="font-semibold">{selected.clientName}</p>
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <p className="text-xs font-bold text-muted-foreground uppercase">Servicios ({selected.serviceCount})</p>
                                    {(selected.services || []).map((s, i) => (
                                        <div key={s.id || i} className="p-2 rounded-lg border flex justify-between items-center gap-2">
                                            <div>
                                                <p className="font-medium">{s.name}</p>
                                                <p className="text-xs text-muted-foreground">{s.type} · {s.status}</p>
                                                {s.clientName && <p className="text-xs text-cyan-600">{s.clientName}</p>}
                                            </div>
                                            <div className="text-right shrink-0">
                                                {s.charge != null && s.charge > 0 && (
                                                    <p className="font-bold text-violet-700">${s.charge}</p>
                                                )}
                                                {s.url && (
                                                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-cyan-600">
                                                        <ExternalLink size={12} />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    El asistente puede consultar este mapa con: &quot;muéstrame la topología&quot; o &quot;qué servicios tiene el VPS X&quot;.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Legend */}
            <Card className="rounded-2xl border-2 bg-violet-50/50">
                <CardContent className="pt-5">
                    <p className="text-sm font-medium mb-2">Leyenda del mapa conceptual</p>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users size={14} className="text-cyan-600" /> Cliente (cobro mensual/anual)</span>
                        <span className="flex items-center gap-1"><Server size={14} className="text-blue-600" /> VPS (servidor físico)</span>
                        <span className="flex items-center gap-1"><Database size={14} className="text-violet-600" /> Servicio (app/contenedor)</span>
                        <span className="flex items-center gap-1"><Circle size={10} className="fill-emerald-500 text-emerald-500" /> En línea</span>
                        <span className="flex items-center gap-1"><Circle size={10} className="fill-gray-400" /> Detenido</span>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
