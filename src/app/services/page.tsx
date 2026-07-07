"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Database, Settings, Search, Play, Pause, RotateCw, Plus, Server, Globe, ExternalLink, Radar, Users } from "lucide-react";
import { motion } from "framer-motion";
import { services as servicesApi, type ServiceOverviewGroup } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

export default function ServicesPage() {
    const [services, setServices] = useState<any[]>([]);
    const [groups, setGroups] = useState<ServiceOverviewGroup[]>([]);
    const [vpsList, setVpsList] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [vpsFilter, setVpsFilter] = useState("all");
    const [isScanning, setIsScanning] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [controllingId, setControllingId] = useState<string | null>(null);
    const { addToast } = useToast();

    const handleServiceControl = async (serviceId: string, action: "start" | "stop" | "restart") => {
        setControllingId(serviceId);
        try {
            const res = await servicesApi.control(serviceId, action);
            if (res.success) {
                addToast(`Servicio ${action} OK`, "success");
                fetchServices();
            } else {
                addToast(res.error || res.output || `Error en ${action}`, "error");
            }
        } catch (e) {
            addToast(e instanceof Error ? e.message : "Error de control", "error");
        } finally {
            setControllingId(null);
        }
    };

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        type: "odoo",
        port: "",
        status: "running",
        vpsId: "",
        url: "",
    });

    const fetchServices = () => {
        setIsLoading(true);
        Promise.all([
            servicesApi.overview(),
            fetch("/api/vps").then((r) => r.json()),
        ])
            .then(([overviewRes, vpsRes]) => {
                const data = overviewRes.data || [];
                setGroups(Array.isArray(data) ? data : []);
                const flat = (Array.isArray(data) ? data : []).flatMap((g) => g.services || []);
                setServices(flat);
                const vpsData = vpsRes.data || vpsRes;
                setVpsList(Array.isArray(vpsData) ? vpsData : []);
            })
            .catch((err) => {
                console.error("Error fetching services:", err);
                addToast("Error al cargar servicios", "error");
            })
            .finally(() => setIsLoading(false));
    };

    const handleScan = async (vpsId?: string) => {
        setIsScanning(true);
        try {
            const res = await servicesApi.scan(vpsId);
            const t = res.totals;
            addToast(
                `Escaneo: ${t.found} encontrados, ${t.created} nuevos, ${t.updated} actualizados`,
                "success"
            );
            fetchServices();
        } catch (e) {
            addToast(e instanceof Error ? e.message : "Error en escaneo SSH", "error");
        } finally {
            setIsScanning(false);
        }
    };

    useEffect(() => {
        fetchServices();
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            addToast("El nombre es requerido", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch("/api/services", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    type: formData.type,
                    port: parseInt(formData.port) || null,
                    status: formData.status,
                    vpsId: formData.vpsId || null,
                    url: formData.url || null,
                }),
            });

            if (response.ok) {
                addToast("Servicio creado exitosamente", "success");
                setIsModalOpen(false);
                setFormData({ name: "", type: "odoo", port: "", status: "running", vpsId: "", url: "" });
                fetchServices();
            } else {
                const error = await response.json();
                addToast(error.error || "Error al crear servicio", "error");
            }
        } catch (error) {
            addToast("Error de conexión", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const matchesSearch = (s: { name: string; type: string; url?: string; client?: { name?: string }; vps?: { name?: string; ipAddress?: string } }) => {
        const q = searchTerm.toLowerCase();
        return (
            s.name.toLowerCase().includes(q) ||
            s.type.toLowerCase().includes(q) ||
            (s.url || "").toLowerCase().includes(q) ||
            (s.client?.name || "").toLowerCase().includes(q) ||
            (s.vps?.name || "").toLowerCase().includes(q) ||
            (s.vps?.ipAddress || "").includes(q)
        );
    };

    const filteredGroups = groups
        .filter((g) => vpsFilter === "all" || g.id === vpsFilter)
        .map((g) => ({
            ...g,
            services: (g.services || []).filter(matchesSearch),
        }))
        .filter((g) => g.services.length > 0 || (searchTerm === "" && vpsFilter === "all"));

    const totalVisible = filteredGroups.reduce((n, g) => n + g.services.length, 0);

    const serviceIcons: Record<string, any> = {
        odoo: "🟣",
        postgres: "🐘",
        nginx: "🟢",
        redis: "🔴",
        mysql: "🐬",
        docker: "🐳",
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Servicios</h2>
                    <p className="text-muted-foreground">Inventario por VPS, cliente y acciones de control</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        className="gap-2 rounded-xl border-2"
                        disabled={isScanning}
                        onClick={() => handleScan(vpsFilter !== "all" ? vpsFilter : undefined)}
                    >
                        <Radar size={16} className={isScanning ? "animate-spin" : ""} />
                        {isScanning ? "Escaneando..." : "Escanear VPS"}
                    </Button>
                    <Button
                        onClick={() => setIsModalOpen(true)}
                        className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg shadow-purple-200"
                    >
                        <Plus size={16} />
                        Agregar
                    </Button>
                </div>
            </div>

            {/* Search & Filters */}
            <div className="flex flex-wrap gap-4">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar servicio, cliente, IP..."
                        className="pl-9 rounded-xl border-2"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <select
                    className="rounded-xl border-2 px-3 py-2 text-sm bg-white min-w-[180px]"
                    value={vpsFilter}
                    onChange={(e) => setVpsFilter(e.target.value)}
                >
                    <option value="all">Todos los VPS</option>
                    {vpsList.map((v) => (
                        <option key={v.id} value={v.id}>{v.name} ({v.ipAddress})</option>
                    ))}
                </select>
            </div>

            {/* Services by VPS */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <RotateCw className="w-8 h-8 text-violet-500 animate-spin" />
                </div>
            ) : totalVisible === 0 ? (
                <Card className="bg-white/70 backdrop-blur rounded-2xl border-2 border-gray-100">
                    <CardContent className="py-12 text-center">
                        <Database className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        <p className="text-gray-500 font-medium">No hay servicios registrados</p>
                        <p className="text-sm text-gray-400 mb-4">Restaura el backup o escanea tus VPS para detectar contenedores Docker.</p>
                        <div className="flex gap-2 justify-center">
                            <Button variant="outline" onClick={() => handleScan()} disabled={isScanning} className="gap-2">
                                <Radar size={16} /> Escanear VPS
                            </Button>
                            <Button onClick={() => setIsModalOpen(true)} className="gap-2">
                                <Plus size={16} /> Agregar
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {filteredGroups.map((group) => (
                        <Card key={group.id} className="bg-white/70 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm overflow-hidden">
                            <CardHeader className="pb-2 bg-gradient-to-r from-violet-50/80 to-transparent">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Server className="w-4 h-4 text-violet-600" />
                                        {group.name}
                                        <Badge variant="outline" className="font-mono text-xs">{group.ipAddress}</Badge>
                                        {group.client && (
                                            <Badge className="bg-cyan-100 text-cyan-800 border-0 gap-1">
                                                <Users size={12} /> {group.client.name}
                                            </Badge>
                                        )}
                                    </CardTitle>
                                    <div className="flex items-center gap-2">
                                        <Badge variant={group.status === "online" ? "success" : "destructive"}>
                                            {group.status === "online" ? "Online" : group.status}
                                        </Badge>
                                        <span className="text-sm text-muted-foreground">{group.services.length} servicios</span>
                                        {group.id !== "unassigned" && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8"
                                                disabled={isScanning}
                                                onClick={() => handleScan(group.id)}
                                            >
                                                <Radar size={14} />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-gray-100">
                                    {group.services.map((service, index) => (
                                        <motion.div
                                            key={service.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: index * 0.02 }}
                                            className="flex items-center justify-between p-4 hover:bg-violet-50/50 group"
                                        >
                                            <div className="flex items-center gap-4 min-w-0">
                                                <span className="text-2xl shrink-0">{serviceIcons[service.type] || "⚙️"}</span>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-semibold text-gray-900">{service.name}</span>
                                                        <Badge variant="outline" className="text-[10px] uppercase">{service.type}</Badge>
                                                        {service.client && (
                                                            <span className="text-xs text-cyan-600 flex items-center gap-1">
                                                                <Users size={11} /> {service.client.name}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                                                        <span>Puerto {service.port || "—"}</span>
                                                        {service.url && (
                                                            <a href={service.url} target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:underline flex items-center gap-1">
                                                                <Globe size={12} /> {service.url.replace(/^https?:\/\//, "")}
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <Badge variant={service.status === "running" ? "success" : "destructive"} className="rounded-full">
                                                    {service.status === "running" ? "ON" : "OFF"}
                                                </Badge>
                                                <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100">
                                                    {service.status === "running" ? (
                                                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Stop"
                                                            disabled={controllingId === service.id}
                                                            onClick={() => handleServiceControl(service.id, "stop")}>
                                                            <Pause size={14} />
                                                        </Button>
                                                    ) : (
                                                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Start"
                                                            disabled={controllingId === service.id}
                                                            onClick={() => handleServiceControl(service.id, "start")}>
                                                            <Play size={14} />
                                                        </Button>
                                                    )}
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Restart"
                                                        disabled={controllingId === service.id}
                                                        onClick={() => handleServiceControl(service.id, "restart")}>
                                                        <RotateCw size={14} className={controllingId === service.id ? "animate-spin" : ""} />
                                                    </Button>
                                                    {service.url && (
                                                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Abrir" asChild>
                                                            <a href={service.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /></a>
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create Service Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Database className="w-5 h-5 text-violet-500" />
                            Nuevo Servicio
                        </DialogTitle>
                        <DialogDescription>
                            Registra un nuevo servicio para monitorear.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Nombre *</label>
                            <Input
                                name="name"
                                placeholder="Ej: Odoo Producción"
                                value={formData.name}
                                onChange={handleInputChange}
                                className="rounded-xl border-2"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-1">
                                    <Database size={14} /> Tipo
                                </label>
                                <select
                                    name="type"
                                    value={formData.type}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 focus:border-violet-300 focus:outline-none bg-white"
                                >
                                    <option value="odoo">🟣 Odoo</option>
                                    <option value="postgres">🐘 PostgreSQL</option>
                                    <option value="nginx">🟢 Nginx</option>
                                    <option value="redis">🔴 Redis</option>
                                    <option value="mysql">🐬 MySQL</option>
                                    <option value="docker">🐳 Docker</option>
                                    <option value="other">⚙️ Otro</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Puerto</label>
                                <Input
                                    name="port"
                                    type="number"
                                    placeholder="8069"
                                    value={formData.port}
                                    onChange={handleInputChange}
                                    className="rounded-xl border-2"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-1">
                                    <Server size={14} /> VPS Asociado
                                </label>
                                <select
                                    name="vpsId"
                                    value={formData.vpsId}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 focus:border-violet-300 focus:outline-none bg-white"
                                >
                                    <option value="">Sin VPS</option>
                                    {vpsList.map(vps => (
                                        <option key={vps.id} value={vps.id}>
                                            {vps.name} ({vps.ipAddress || "Sin IP"})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Estado Inicial</label>
                                <select
                                    name="status"
                                    value={formData.status}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 focus:border-violet-300 focus:outline-none bg-white"
                                >
                                    <option value="running">Ejecutando</option>
                                    <option value="stopped">Detenido</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-1">
                                <Globe size={14} /> URL de Acceso
                            </label>
                            <Input
                                name="url"
                                placeholder="https://app.ejemplo.com"
                                value={formData.url}
                                onChange={handleInputChange}
                                className="rounded-xl border-2"
                            />
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsModalOpen(false)}
                                className="rounded-xl"
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="rounded-xl bg-gradient-to-r from-violet-500 to-purple-600"
                            >
                                {isSubmitting ? (
                                    <RotateCw className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                    <Plus className="w-4 h-4 mr-2" />
                                )}
                                Crear Servicio
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
