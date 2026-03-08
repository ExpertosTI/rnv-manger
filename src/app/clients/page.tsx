"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Users, Plus, Search, Mail, Phone, Calendar, DollarSign, AlertTriangle, RefreshCw, Building, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/toast";

export default function ClientsPage() {
    const [clients, setClients] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { addToast } = useToast();

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        phone: "",
        companyName: "",
        notes: "",
        monthlyFee: "",
        paymentDay: "1",
    });

    const fetchClients = () => {
        setIsLoading(true);
        fetch("/api/clients")
            .then(res => res.json())
            .then(response => {
                // Handle both { success: true, data: [...] } and array format
                const data = response.data || response;
                setClients(Array.isArray(data) ? data : []);
                setIsLoading(false);
            })
            .catch(err => {
                console.error("Error fetching clients:", err);
                setIsLoading(false);
            });
    };

    useEffect(() => {
        fetchClients();
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
            const response = await fetch("/api/clients", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email || null,
                    phone: formData.phone || null,
                    companyName: formData.companyName || null,
                    notes: formData.notes || null,
                    monthlyFee: parseFloat(formData.monthlyFee) || 0,
                    paymentDay: parseInt(formData.paymentDay) || 1,
                }),
            });

            if (response.ok) {
                addToast("Cliente creado exitosamente", "success");
                setIsModalOpen(false);
                setFormData({ name: "", email: "", phone: "", companyName: "", notes: "", monthlyFee: "", paymentDay: "1" });
                fetchClients();
            } else {
                const error = await response.json();
                addToast(error.error || "Error al crear cliente", "error");
            }
        } catch (error) {
            addToast("Error de conexión", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalRevenue = clients.reduce((sum, c) => sum + (c.monthlyFee || 0), 0);
    const overdueClients = clients.filter(c => {
        if (!c.paymentDay) return false;
        const today = new Date().getDate();
        return today > c.paymentDay;
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Clientes</h2>
                    <p className="text-muted-foreground">Gestiona tus cuentas de clientes y pagos</p>
                </div>
                <Button
                    onClick={() => setIsModalOpen(true)}
                    className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg shadow-purple-200"
                >
                    <Plus size={16} />
                    Agregar Cliente
                </Button>
            </div>

            {/* Stats Summary */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-white/70 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/20">
                                <Users className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Total Clientes</p>
                                <p className="text-2xl font-bold">{clients.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white/70 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-green-500/20">
                                <DollarSign className="h-5 w-5 text-green-400" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Ingresos Mensuales</p>
                                <p className="text-2xl font-bold">${totalRevenue.toLocaleString()}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white/70 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-500/20">
                                <Calendar className="h-5 w-5 text-blue-400" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Pendientes Pago</p>
                                <p className="text-2xl font-bold">{clients.length - overdueClients.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white/70 backdrop-blur rounded-2xl border-2 border-red-100 shadow-sm shadow-red-50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-red-500/20">
                                <AlertTriangle className="h-5 w-5 text-red-400" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Vencidos</p>
                                <p className="text-2xl font-bold text-red-400">{overdueClients.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Search */}
            <div className="flex gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar clientes..."
                        className="pl-9 rounded-xl border-2"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button variant="outline" className="rounded-xl border-2">Todos los Estados</Button>
            </div>

            {/* Clients List */}
            <div className="space-y-3">
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
                    </div>
                ) : filteredClients.length === 0 ? (
                    <Card className="bg-white/50 border-dashed border-2 p-12 text-center rounded-2xl">
                        <div className="flex flex-col items-center gap-2">
                            <Users className="w-12 h-12 text-gray-300" />
                            <h3 className="text-lg font-bold text-gray-700">No hay clientes</h3>
                            <p className="text-gray-500">Agrega tu primer cliente para comenzar la gestión.</p>
                            <Button
                                onClick={() => setIsModalOpen(true)}
                                className="mt-4 gap-2"
                            >
                                <Plus size={16} />
                                Agregar Cliente
                            </Button>
                        </div>
                    </Card>
                ) : (
                    filteredClients.map((client, index) => (
                        <motion.div
                            key={client.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                        >
                            <Card className="bg-white/70 backdrop-blur hover:bg-white transition-all border-2 border-gray-100 rounded-2xl group">
                                <CardContent className="py-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
                                                {client.name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold">{client.name}</h3>
                                                    <Badge variant={client.isActive ? "success" : "warning"} className="rounded-full">
                                                        {client.isActive ? "Activo" : "Inactivo"}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                                    {client.email && (
                                                        <span className="flex items-center gap-1">
                                                            <Mail size={12} /> {client.email}
                                                        </span>
                                                    )}
                                                    {client.phone && (
                                                        <span className="flex items-center gap-1">
                                                            <Phone size={12} /> {client.phone}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-8">
                                            <div className="text-right">
                                                <p className="text-lg font-bold">${client.monthlyFee || 0}/mes</p>
                                                <p className="text-xs text-muted-foreground">Día pago: {client.paymentDay || 1}</p>
                                            </div>
                                            <Link href={`/clients/${client.id}`}>
                                                <Button variant="outline" size="sm" className="rounded-xl border-2 group-hover:bg-violet-50 group-hover:border-violet-200">Gestionar</Button>
                                            </Link>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))
                )}
            </div>

            {/* Create Client Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-violet-500" />
                            Nuevo Cliente
                        </DialogTitle>
                        <DialogDescription>
                            Agrega un nuevo cliente a tu sistema de gestión.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Nombre *</label>
                            <Input
                                name="name"
                                placeholder="Nombre del cliente"
                                value={formData.name}
                                onChange={handleInputChange}
                                className="rounded-xl border-2"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-1">
                                    <Mail size={14} /> Email
                                </label>
                                <Input
                                    name="email"
                                    type="email"
                                    placeholder="email@ejemplo.com"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    className="rounded-xl border-2"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-1">
                                    <Phone size={14} /> Teléfono
                                </label>
                                <Input
                                    name="phone"
                                    placeholder="+1 234 567 890"
                                    value={formData.phone}
                                    onChange={handleInputChange}
                                    className="rounded-xl border-2"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-1">
                                <Building size={14} /> Empresa
                            </label>
                            <Input
                                name="companyName"
                                placeholder="Nombre de empresa (opcional)"
                                value={formData.companyName}
                                onChange={handleInputChange}
                                className="rounded-xl border-2"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-1">
                                    <DollarSign size={14} /> Tarifa Mensual
                                </label>
                                <Input
                                    name="monthlyFee"
                                    type="number"
                                    placeholder="0.00"
                                    value={formData.monthlyFee}
                                    onChange={handleInputChange}
                                    className="rounded-xl border-2"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-1">
                                    <Calendar size={14} /> Día de Pago
                                </label>
                                <Input
                                    name="paymentDay"
                                    type="number"
                                    min="1"
                                    max="31"
                                    placeholder="1"
                                    value={formData.paymentDay}
                                    onChange={handleInputChange}
                                    className="rounded-xl border-2"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-1">
                                <FileText size={14} /> Notas
                            </label>
                            <textarea
                                name="notes"
                                placeholder="Notas adicionales (opcional)"
                                value={formData.notes}
                                onChange={handleInputChange}
                                rows={3}
                                className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 focus:border-violet-300 focus:outline-none resize-none"
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
                                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                    <Plus className="w-4 h-4 mr-2" />
                                )}
                                Crear Cliente
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div >
    );
}
