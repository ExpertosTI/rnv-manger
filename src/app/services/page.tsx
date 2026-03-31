"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Database, Settings, Search, Play, Pause, RotateCw, FileCode, Plus, Server, Globe, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/toast";

export default function ServicesPage() {
    const [services, setServices] = useState<any[]>([]);
    const [vpsList, setVpsList] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { addToast } = useToast();

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
        fetch("/api/services")
            .then(res => res.json())
            .then(response => {
                // Handle both old { data: [...] } and new array format
                const data = response.data || response;
                setServices(Array.isArray(data) ? data : []);
                setIsLoading(false);
            })
            .catch(err => {
                console.error("Error fetching services:", err);
                setIsLoading(false);
            });
    };

    const fetchVps = () => {
        fetch("/api/vps")
            .then(res => res.json())
            .then(response => {
                // Handle both old { data: [...] } and new array format
                const data = response.data || response;
                setVpsList(Array.isArray(data) ? data : []);
            })
            .catch(err => console.error("Error fetching VPS:", err));
    };

    useEffect(() => {
        fetchServices();
        fetchVps();
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

    const filteredServices = services.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.type.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
                    <p className="text-muted-foreground">Monitorea y gestiona tus servicios en ejecución</p>
                </div>
                <Button
                    onClick={() => setIsModalOpen(true)}
                    className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg shadow-purple-200"
                >
                    <Plus size={16} />
                    Agregar Servicio
                </Button>
            </div>

            {/* Search & Filters */}
            <div className="flex gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar servicios..."
                        className="pl-9 rounded-xl border-2"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button variant="outline" className="rounded-xl border-2">Filtrar</Button>
            </div>

            {/* Services Table */}
            <Card className="bg-white/70 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-lg">Servicios Activos ({services.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {isLoading ? (
                            <div className="flex justify-center py-12">
                                <RotateCw className="w-8 h-8 text-violet-500 animate-spin" />
                            </div>
                        ) : filteredServices.length === 0 ? (
                            <div className="py-12 text-center">
                                <Database className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                                <p className="text-gray-500 font-medium">No hay servicios registrados</p>
                                <p className="text-sm text-gray-400 mb-4">Agrega tus servicios para comenzar el monitoreo.</p>
                                <Button
                                    onClick={() => setIsModalOpen(true)}
                                    className="gap-2"
                                >
                                    <Plus size={16} />
                                    Agregar Servicio
                                </Button>
                            </div>
                        ) : (
                            filteredServices.map((service, index) => (
                                <motion.div
                                    key={service.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className="flex items-center justify-between p-4 rounded-xl bg-gray-50 hover:bg-violet-50 transition-colors group border border-transparent hover:border-violet-100"
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="text-2xl">{serviceIcons[service.type] || "⚙️"}</span>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <Link
                                                    href={`/services/${service.id}`}
                                                    className="font-bold text-gray-900 hover:text-violet-600 transition-colors"
                                                >
                                                    {service.name}
                                                </Link>
                                                <Badge variant="outline" className="text-[10px] uppercase font-bold text-violet-600 bg-violet-50 border-violet-100">{service.type}</Badge>
                                            </div>
                                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                                <span>{service.vps?.name || "Sin VPS"} • Puerto {service.port || "N/A"}</span>
                                                {service.url && (
                                                    <a
                                                        href={service.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-1 text-cyan-500 hover:text-cyan-600"
                                                    >
                                                        <ExternalLink size={12} />
                                                        Abrir
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <Badge variant={service.status === "running" ? "success" : "destructive"} className="rounded-full px-3">
                                            {service.status === "running" ? "Ejecutando" : "Detenido"}
                                        </Badge>

                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {service.status === "running" ? (
                                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-50 hover:text-red-500" title="Stop">
                                                    <Pause size={14} />
                                                </Button>
                                            ) : (
                                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-green-50 hover:text-green-500" title="Start">
                                                    <Play size={14} />
                                                </Button>
                                            )}
                                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Restart">
                                                <RotateCw size={14} />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Settings">
                                                <Settings size={14} />
                                            </Button>
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

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
