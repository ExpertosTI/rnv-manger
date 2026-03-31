"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Users, ArrowLeft, Edit, Save, X, Mail, Phone, Building, DollarSign,
    Calendar, Server, Database, FileText, ExternalLink, Trash2, RefreshCw, Receipt
} from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/toast";

interface ClientDetail {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    companyName: string | null;
    notes: string | null;
    monthlyFee: number;
    paymentDay: number;
    isActive: boolean;
    currency: string;
    odooPartnerId: number | null;
    vpsList: Array<{ id: string; name: string; ipAddress: string; status: string; monthlyCost: number }>;
    services: Array<{ id: string; name: string; type: string; url: string | null; monthlyCost: number; status: string }>;
    payments: Array<{ id: string; amount: number; date: string; status: string; odooInvoiceName: string | null }>;
    vpsCost: number;
    serviceCost: number;
    totalMonthlyCost: number;
}

export default function ClientDetailPage() {
    const params = useParams();
    const router = useRouter();
    const clientId = params.id as string;

    const [client, setClient] = useState<ClientDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const { addToast } = useToast();

    const [formData, setFormData] = useState({
        name: "",
        email: "",
        phone: "",
        companyName: "",
        notes: "",
        monthlyFee: "",
        paymentDay: "",
        isActive: true,
    });

    useEffect(() => {
        fetchClient();
    }, [clientId]);

    const fetchClient = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/clients/${clientId}`);
            const data = await response.json();
            if (data.success) {
                setClient(data.data);
                setFormData({
                    name: data.data.name || "",
                    email: data.data.email || "",
                    phone: data.data.phone || "",
                    companyName: data.data.companyName || "",
                    notes: data.data.notes || "",
                    monthlyFee: String(data.data.monthlyFee || 0),
                    paymentDay: String(data.data.paymentDay || 1),
                    isActive: data.data.isActive,
                });
            } else {
                addToast("Error al cargar cliente", "error");
            }
        } catch (error) {
            addToast("Error de conexión", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const response = await fetch(`/api/clients/${clientId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email || null,
                    phone: formData.phone || null,
                    companyName: formData.companyName || null,
                    notes: formData.notes || null,
                    monthlyFee: parseFloat(formData.monthlyFee) || 0,
                    paymentDay: parseInt(formData.paymentDay) || 1,
                    isActive: formData.isActive,
                }),
            });

            const data = await response.json();
            if (data.success) {
                addToast("Cliente actualizado exitosamente", "success");
                setIsEditing(false);
                fetchClient();
            } else {
                addToast(data.error || "Error al guardar", "error");
            }
        } catch (error) {
            addToast("Error de conexión", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("¿Estás seguro de eliminar este cliente?")) return;

        try {
            const response = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
            const data = await response.json();
            if (data.success) {
                addToast("Cliente eliminado", "success");
                router.push("/clients");
            } else {
                addToast(data.error || "Error al eliminar", "error");
            }
        } catch (error) {
            addToast("Error de conexión", "error");
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
        );
    }

    if (!client) {
        return (
            <div className="text-center py-20">
                <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-gray-700">Cliente no encontrado</h2>
                <Link href="/clients">
                    <Button className="mt-4">Volver a Clientes</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/clients">
                        <Button variant="ghost" size="icon" className="rounded-full">
                            <ArrowLeft size={20} />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-3xl font-bold tracking-tight">{client.name}</h2>
                            <Badge variant={client.isActive ? "success" : "warning"} className="rounded-full">
                                {client.isActive ? "Activo" : "Inactivo"}
                            </Badge>
                        </div>
                        <p className="text-muted-foreground">{client.companyName || "Sin empresa"}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {isEditing ? (
                        <>
                            <Button variant="outline" onClick={() => setIsEditing(false)}>
                                <X size={16} className="mr-2" /> Cancelar
                            </Button>
                            <Button onClick={handleSave} disabled={isSaving} className="bg-green-500 hover:bg-green-600">
                                <Save size={16} className="mr-2" /> {isSaving ? "Guardando..." : "Guardar"}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" onClick={() => setIsEditing(true)}>
                                <Edit size={16} className="mr-2" /> Editar
                            </Button>
                            <Button variant="destructive" onClick={handleDelete}>
                                <Trash2 size={16} className="mr-2" /> Eliminar
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-2xl border-0 shadow-lg">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <DollarSign className="h-8 w-8 opacity-80" />
                            <div>
                                <p className="text-sm opacity-80">Costo Total Mensual</p>
                                <p className="text-2xl font-bold">${client.totalMonthlyCost.toFixed(2)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white/70 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <Server className="h-6 w-6 text-blue-500" />
                            <div>
                                <p className="text-sm text-muted-foreground">VPS</p>
                                <p className="text-2xl font-bold">{client.vpsList.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white/70 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <Database className="h-6 w-6 text-purple-500" />
                            <div>
                                <p className="text-sm text-muted-foreground">Servicios</p>
                                <p className="text-2xl font-bold">{client.services.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white/70 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <Calendar className="h-6 w-6 text-green-500" />
                            <div>
                                <p className="text-sm text-muted-foreground">Día de Pago</p>
                                <p className="text-2xl font-bold">{client.paymentDay}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Client Info Form */}
                <Card className="bg-white/70 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-violet-500" />
                            Información del Cliente
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Nombre</label>
                                {isEditing ? (
                                    <Input
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="rounded-xl border-2"
                                    />
                                ) : (
                                    <p className="font-semibold">{client.name}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-1"><Building size={14} /> Empresa</label>
                                {isEditing ? (
                                    <Input
                                        value={formData.companyName}
                                        onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                                        className="rounded-xl border-2"
                                    />
                                ) : (
                                    <p className="text-muted-foreground">{client.companyName || "-"}</p>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-1"><Mail size={14} /> Email</label>
                                {isEditing ? (
                                    <Input
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="rounded-xl border-2"
                                    />
                                ) : (
                                    <p className="text-muted-foreground">{client.email || "-"}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-1"><Phone size={14} /> Teléfono</label>
                                {isEditing ? (
                                    <Input
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="rounded-xl border-2"
                                    />
                                ) : (
                                    <p className="text-muted-foreground">{client.phone || "-"}</p>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-1"><DollarSign size={14} /> Tarifa Base</label>
                                {isEditing ? (
                                    <Input
                                        type="number"
                                        value={formData.monthlyFee}
                                        onChange={(e) => setFormData({ ...formData, monthlyFee: e.target.value })}
                                        className="rounded-xl border-2"
                                    />
                                ) : (
                                    <p className="font-semibold">${client.monthlyFee}/mes</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-1"><Calendar size={14} /> Día de Pago</label>
                                {isEditing ? (
                                    <Input
                                        type="number"
                                        min="1"
                                        max="31"
                                        value={formData.paymentDay}
                                        onChange={(e) => setFormData({ ...formData, paymentDay: e.target.value })}
                                        className="rounded-xl border-2"
                                    />
                                ) : (
                                    <p>{client.paymentDay}</p>
                                )}
                            </div>
                        </div>
                        {isEditing && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-1"><FileText size={14} /> Notas</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    rows={3}
                                    className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 focus:border-violet-300 focus:outline-none resize-none"
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* VPS & Services */}
                <div className="space-y-6">
                    {/* VPS List */}
                    <Card className="bg-white/70 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Server className="w-5 h-5 text-blue-500" />
                                VPS Asignados ({client.vpsList.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {client.vpsList.length === 0 ? (
                                <p className="text-muted-foreground text-center py-4">Sin VPS asignados</p>
                            ) : (
                                <div className="space-y-2">
                                    {client.vpsList.map((vps) => (
                                        <Link key={vps.id} href={`/vps/${vps.id}`}>
                                            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-blue-50 transition-colors cursor-pointer">
                                                <div>
                                                    <p className="font-medium">{vps.name}</p>
                                                    <p className="text-sm text-muted-foreground">{vps.ipAddress}</p>
                                                </div>
                                                <div className="text-right">
                                                    <Badge variant={vps.status === "running" ? "success" : "warning"}>{vps.status}</Badge>
                                                    <p className="text-sm font-medium mt-1">${vps.monthlyCost}/mes</p>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Services List */}
                    <Card className="bg-white/70 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Database className="w-5 h-5 text-purple-500" />
                                Servicios ({client.services.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {client.services.length === 0 ? (
                                <p className="text-muted-foreground text-center py-4">Sin servicios</p>
                            ) : (
                                <div className="space-y-2">
                                    {client.services.map((service) => (
                                        <div key={service.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-purple-50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <Link href={`/services/${service.id}`} className="font-medium hover:text-violet-600">
                                                    {service.name}
                                                </Link>
                                                <Badge variant="outline">{service.type}</Badge>
                                                {service.url && (
                                                    <a href={service.url} target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:text-cyan-600">
                                                        <ExternalLink size={14} />
                                                    </a>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-medium">${service.monthlyCost}/mes</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Payment History */}
            <Card className="bg-white/70 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-green-500" />
                        Historial de Pagos ({client.payments.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {client.payments.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">Sin pagos registrados</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left py-3 px-4 font-medium text-gray-500">Fecha</th>
                                        <th className="text-left py-3 px-4 font-medium text-gray-500">Factura</th>
                                        <th className="text-right py-3 px-4 font-medium text-gray-500">Monto</th>
                                        <th className="text-center py-3 px-4 font-medium text-gray-500">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {client.payments.map((payment, index) => (
                                        <motion.tr
                                            key={payment.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.05 }}
                                            className="border-b border-gray-100 hover:bg-green-50/50 transition-colors"
                                        >
                                            <td className="py-3 px-4">
                                                {new Date(payment.date).toLocaleDateString('es-DO', {
                                                    year: 'numeric',
                                                    month: 'short',
                                                    day: 'numeric'
                                                })}
                                            </td>
                                            <td className="py-3 px-4">
                                                {payment.odooInvoiceName ? (
                                                    <span className="font-mono text-sm text-violet-600">{payment.odooInvoiceName}</span>
                                                ) : (
                                                    <span className="text-gray-400">-</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right font-bold text-green-600">
                                                ${payment.amount.toFixed(2)}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <Badge
                                                    variant={
                                                        payment.status === 'completed' ? 'success' :
                                                            payment.status === 'pending' ? 'warning' :
                                                                payment.status === 'cancelled' ? 'destructive' : 'outline'
                                                    }
                                                    className="rounded-full"
                                                >
                                                    {payment.status === 'completed' ? 'Pagado' :
                                                        payment.status === 'pending' ? 'Pendiente' :
                                                            payment.status === 'cancelled' ? 'Cancelado' : payment.status}
                                                </Badge>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
