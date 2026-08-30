"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
    Users, ArrowLeft, Edit, Save, X, Mail, Phone, Building, DollarSign,
    Calendar, Server, Database, FileText, ExternalLink, Trash2, RefreshCw, Receipt,
    MessageSquare, Send, Check, Plus, AlertTriangle, Layers
} from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/toast";
import { clients as clientsApi, services as servicesApi, billing as billingApi, type Service } from "@/lib/api";
import { ServiceIcon } from "@/components/ServiceIcon";

interface ClientDetail {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    companyName: string | null;
    notes: string | null;
    billingCycle: string;
    monthlyFee: number;
    annualFee: number;
    paymentDay: number;
    paymentMonth: number;
    isActive: boolean;
    currency: string;
    odooPartnerId: number | null;
    vpsList: Array<{ id: string; name: string; ipAddress: string; status: string; monthlyCost: number }>;
    services: Array<{ id: string; name: string; type: string; url: string | null; monthlyCost: number; annualCost?: number; billingCycle?: string; status: string }>;
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
    const [orphanServices, setOrphanServices] = useState<Service[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Modals
    const [isQuickPayOpen, setIsQuickPayOpen] = useState(false);
    const [payAmount, setPayAmount] = useState("");
    const [payNotes, setPayNotes] = useState("");
    const [isPaying, setIsPaying] = useState(false);

    const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);
    const [whatsAppMessage, setWhatsAppMessage] = useState("");
    const [isSendingEmail, setIsSendingEmail] = useState(false);

    const { addToast } = useToast();

    const [formData, setFormData] = useState({
        name: "",
        email: "",
        phone: "",
        companyName: "",
        notes: "",
        billingCycle: "monthly",
        monthlyFee: "",
        annualFee: "",
        paymentDay: "",
        paymentMonth: "1",
        isActive: true,
    });

    const fetchClient = useCallback(async () => {
        setIsLoading(true);
        try {
            const [clientRes, allServicesRes] = await Promise.all([
                fetch(`/api/clients/${clientId}`).then(r => r.json()),
                servicesApi.list().catch(() => ({ data: [] })),
            ]);

            if (clientRes.success) {
                const c = clientRes.data;
                setClient({
                    ...c,
                    billingCycle: c.billingCycle || "monthly",
                    annualFee: c.annualFee || 0,
                    paymentMonth: c.paymentMonth || 1,
                    vpsList: c.vpsList ?? [],
                    services: c.services ?? [],
                    payments: c.payments ?? [],
                    totalMonthlyCost: c.totalMonthlyCost ?? 0,
                });
                setFormData({
                    name: c.name || "",
                    email: c.email || "",
                    phone: c.phone || "",
                    companyName: c.companyName || "",
                    notes: c.notes || "",
                    billingCycle: c.billingCycle || "monthly",
                    monthlyFee: String(c.monthlyFee || 0),
                    annualFee: String(c.annualFee || 0),
                    paymentDay: String(c.paymentDay || 1),
                    paymentMonth: String(c.paymentMonth || 1),
                    isActive: c.isActive ?? true,
                });
            } else {
                addToast("Error al cargar cliente", "error");
            }

            const allSvcs = Array.isArray(allServicesRes.data) ? allServicesRes.data : [];
            setOrphanServices(allSvcs.filter(s => !s.clientId || s.clientId === ""));
        } catch (error) {
            addToast("Error de conexión", "error");
        } finally {
            setIsLoading(false);
        }
    }, [clientId, addToast]);

    useEffect(() => {
        fetchClient();
    }, [fetchClient]);

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
                    billingCycle: formData.billingCycle,
                    monthlyFee: parseFloat(formData.monthlyFee) || 0,
                    annualFee: parseFloat(formData.annualFee) || 0,
                    paymentDay: parseInt(formData.paymentDay) || 1,
                    paymentMonth: parseInt(formData.paymentMonth) || 1,
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
        if (!confirm(`¿Estás seguro de eliminar permanentemente al cliente "${client?.name}"?`)) return;

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

    // Quick Payment
    const openQuickPayModal = () => {
        if (!client) return;
        const total = (client.monthlyFee || 0) + (client.totalMonthlyCost || 0);
        setPayAmount(String(total));
        setPayNotes(`Cobro mensual ${new Date().toLocaleDateString("es-ES", { month: "long", year: "numeric" })}`);
        setIsQuickPayOpen(true);
    };

    const handleQuickPaySubmit = async () => {
        if (!client) return;
        const amt = parseFloat(payAmount);
        if (isNaN(amt) || amt < 0) {
            addToast("Monto inválido", "error");
            return;
        }

        setIsPaying(true);
        try {
            const res = await clientsApi.recordPayment(client.id, {
                amount: amt,
                notes: payNotes,
            });
            if (res.success) {
                addToast(`¡Pago de $${amt.toFixed(2)} registrado! Factura: ${res.invoiceName || "OK"}`, "success");
                setIsQuickPayOpen(false);
                fetchClient();
            } else {
                addToast("Error al registrar pago", "error");
            }
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error al registrar pago", "error");
        } finally {
            setIsPaying(false);
        }
    };

    // WhatsApp
    const openWhatsAppModal = () => {
        if (!client) return;
        const total = (client.monthlyFee || 0) + (client.totalMonthlyCost || 0);
        const serviceNames = (client.services && client.services.length > 0)
            ? client.services.map(s => s.name).join(", ")
            : "Servicios Cloud / Hosting";
        const cycle = client.billingCycle === "annual" ? "anual" : "mensual";
        const dueText = client.billingCycle === "annual"
            ? `el ${client.paymentDay || 1}/${client.paymentMonth || 1}`
            : `el día ${client.paymentDay || 1} de este mes`;

        const msg = `Hola *${client.name}*, te saludamos de *RNV*. Te recordamos el estado de tu suscripción:\n\n` +
            `📌 *Servicios:* ${serviceNames}\n` +
            `💵 *Total ${cycle}:* $${total.toFixed(2)} USD\n` +
            `📅 *Fecha de vencimiento:* ${dueText}\n\n` +
            `Agradecemos tu confirmación una vez realizado el pago para emitir tu comprobante. ¡Muchas gracias!`;

        setWhatsAppMessage(msg);
        setIsWhatsAppOpen(true);
    };

    const handleSendWhatsApp = () => {
        if (!client?.phone) {
            addToast("El cliente no tiene teléfono configurado", "error");
            return;
        }
        const cleanPhone = client.phone.replace(/[^0-9]/g, "");
        const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsAppMessage)}`;
        window.open(url, "_blank");
        setIsWhatsAppOpen(false);
    };

    // Email Reminder
    const handleSendEmailReminder = async () => {
        if (!client?.id) return;
        setIsSendingEmail(true);
        try {
            const res = await billingApi.remind({ clientId: client.id });
            if (res.sent > 0) {
                addToast("Recordatorio enviado por email exitosamente", "success");
            } else {
                addToast("El cliente no tiene email o ya pagó", "info");
            }
        } catch (e) {
            addToast(e instanceof Error ? e.message : "Error al enviar email", "error");
        } finally {
            setIsSendingEmail(false);
        }
    };

    // Link Orphan Service to this Client
    const handleLinkService = async (serviceId: string) => {
        try {
            const res = await servicesApi.bulkOrganize([{
                id: serviceId,
                clientId: client?.id,
                monthlyCost: 10,
            }]);
            if (res.success) {
                addToast("Servicio vinculado al cliente", "success");
                fetchClient();
            }
        } catch {
            addToast("Error al vincular servicio", "error");
        }
    };

    // Unlink Service from this Client
    const handleUnlinkService = async (serviceId: string) => {
        if (!confirm("¿Desvincular este servicio del cliente?")) return;
        try {
            const res = await servicesApi.bulkOrganize([{
                id: serviceId,
                clientId: "",
                monthlyCost: 0,
            }]);
            if (res.success) {
                addToast("Servicio desvinculado", "success");
                fetchClient();
            }
        } catch {
            addToast("Error al desvincular servicio", "error");
        }
    };

    // Update Service Price
    const handleUpdateServicePrice = async (serviceId: string, cost: number) => {
        try {
            const res = await servicesApi.bulkOrganize([{
                id: serviceId,
                monthlyCost: cost,
            }]);
            if (res.success) {
                addToast("Tarifa de servicio actualizada", "success");
                fetchClient();
            }
        } catch {
            addToast("Error al actualizar tarifa", "error");
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
                    <Button className="mt-4 rounded-xl">Volver a Clientes</Button>
                </Link>
            </div>
        );
    }

    const calculatedTotalMonthly = (client.monthlyFee || 0) + (client.totalMonthlyCost || 0);

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-16">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <Link href="/clients">
                        <Button variant="ghost" size="icon" className="rounded-2xl h-10 w-10 border border-gray-200">
                            <ArrowLeft size={18} />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h2 className="text-3xl font-black tracking-tight text-gray-900">{client.name}</h2>
                            <Badge variant={client.isActive ? "success" : "warning"} className="rounded-full">
                                {client.isActive ? "Activo" : "Inactivo"}
                            </Badge>
                            {client.odooPartnerId ? (
                                <Badge variant="outline" className="text-xs text-emerald-700 bg-emerald-50 border-emerald-200">
                                    Odoo #{client.odooPartnerId}
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="text-xs text-gray-400 bg-gray-50 border-gray-200">
                                    Sin Odoo
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{client.companyName || "Sin razón social registrada"}</p>
                    </div>
                </div>

                {/* Main Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* ⚡ Cobro Rápido */}
                    <Button
                        onClick={openQuickPayModal}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl gap-1.5 shadow-sm text-xs h-9"
                    >
                        <DollarSign size={14} />
                        Registrar Cobro
                    </Button>

                    {/* 💬 WhatsApp */}
                    <Button
                        variant="outline"
                        onClick={openWhatsAppModal}
                        className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-2xl gap-1.5 text-xs h-9"
                    >
                        <MessageSquare size={14} />
                        WhatsApp
                    </Button>

                    {/* ✉️ Email */}
                    <Button
                        variant="outline"
                        disabled={!client.email || isSendingEmail}
                        onClick={handleSendEmailReminder}
                        className="border-gray-200 text-gray-700 hover:bg-gray-50 rounded-2xl gap-1.5 text-xs h-9"
                    >
                        <Mail size={14} className={isSendingEmail ? "animate-pulse" : ""} />
                        Email
                    </Button>

                    {/* Edit / Save */}
                    {isEditing ? (
                        <>
                            <Button variant="outline" onClick={() => setIsEditing(false)} className="rounded-2xl text-xs h-9">
                                <X size={14} className="mr-1" /> Cancelar
                            </Button>
                            <Button onClick={handleSave} disabled={isSaving} className="bg-violet-600 hover:bg-violet-700 text-white rounded-2xl text-xs h-9 gap-1.5">
                                <Save size={14} /> {isSaving ? "Guardando..." : "Guardar"}
                            </Button>
                        </>
                    ) : (
                        <Button variant="outline" onClick={() => setIsEditing(true)} className="rounded-2xl text-xs h-9 gap-1.5">
                            <Edit size={14} /> Editar
                        </Button>
                    )}

                    <Button variant="ghost" onClick={handleDelete} className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-2xl text-xs h-9 px-2">
                        <Trash2 size={14} />
                    </Button>
                </div>
            </div>

            {/* Financial Summary Breakdown Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-violet-600 to-indigo-700 text-white rounded-3xl border-0 shadow-lg p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-violet-200 uppercase tracking-wider font-semibold">Total a Cobrar</p>
                            <p className="text-3xl font-black mt-1">
                                ${calculatedTotalMonthly.toFixed(2)}
                                <span className="text-xs font-normal text-violet-200"> /mes</span>
                            </p>
                            <p className="text-xs text-violet-200 mt-1">
                                {client.billingCycle === "annual" ? `Plan Anual: $${(client.annualFee || calculatedTotalMonthly * 12).toFixed(2)}/año` : "Plan Mensual"}
                            </p>
                        </div>
                        <div className="p-3 rounded-2xl bg-white/10 backdrop-blur">
                            <DollarSign className="h-6 w-6 text-white" />
                        </div>
                    </div>
                </Card>

                <Card className="bg-white/80 backdrop-blur rounded-3xl border-2 border-gray-100 shadow-sm p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Tarifa Base</p>
                            <p className="text-2xl font-black text-gray-900 mt-1">${(client.monthlyFee || 0).toFixed(2)}</p>
                            <p className="text-xs text-gray-400 mt-1">Suscripción fija</p>
                        </div>
                        <div className="p-3 rounded-2xl bg-gray-100 text-gray-600">
                            <Building className="h-6 w-6" />
                        </div>
                    </div>
                </Card>

                <Card className="bg-white/80 backdrop-blur rounded-3xl border-2 border-gray-100 shadow-sm p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Servicios Activos</p>
                            <p className="text-2xl font-black text-purple-700 mt-1">{client.services.length}</p>
                            <p className="text-xs text-purple-600 mt-1">
                                Costo: ${(client.serviceCost || client.services.reduce((sum, s) => sum + (s.monthlyCost || 0), 0)).toFixed(2)}/mes
                            </p>
                        </div>
                        <div className="p-3 rounded-2xl bg-purple-50 text-purple-600">
                            <Database className="h-6 w-6" />
                        </div>
                    </div>
                </Card>

                <Card className="bg-white/80 backdrop-blur rounded-3xl border-2 border-gray-100 shadow-sm p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Día de Cobro</p>
                            <p className="text-2xl font-black text-emerald-700 mt-1">
                                {client.billingCycle === "annual" ? `${client.paymentDay}/${client.paymentMonth}` : `Día ${client.paymentDay}`}
                            </p>
                            <p className="text-xs text-emerald-600 mt-1">Próximo vencimiento</p>
                        </div>
                        <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600">
                            <Calendar className="h-6 w-6" />
                        </div>
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Client Info Form */}
                <Card className="bg-white/80 backdrop-blur rounded-3xl border-2 border-gray-100 shadow-sm">
                    <CardHeader className="pb-3 border-b border-gray-100">
                        <CardTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
                            <Users className="w-5 h-5 text-violet-600" />
                            Información del Cliente
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-semibold text-gray-500">Nombre</label>
                                {isEditing ? (
                                    <Input
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="rounded-xl border-gray-300 text-xs mt-1"
                                    />
                                ) : (
                                    <p className="font-bold text-gray-900 text-sm mt-0.5">{client.name}</p>
                                )}
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                                    <Building size={12} /> Empresa
                                </label>
                                {isEditing ? (
                                    <Input
                                        value={formData.companyName}
                                        onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                                        className="rounded-xl border-gray-300 text-xs mt-1"
                                    />
                                ) : (
                                    <p className="text-gray-700 text-sm mt-0.5">{client.companyName || "-"}</p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                                    <Mail size={12} /> Email
                                </label>
                                {isEditing ? (
                                    <Input
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="rounded-xl border-gray-300 text-xs mt-1"
                                    />
                                ) : (
                                    <p className="text-gray-700 text-sm mt-0.5">{client.email || "-"}</p>
                                )}
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                                    <Phone size={12} /> Teléfono
                                </label>
                                {isEditing ? (
                                    <Input
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="rounded-xl border-gray-300 text-xs mt-1"
                                    />
                                ) : (
                                    <p className="text-gray-700 text-sm mt-0.5">{client.phone || "-"}</p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3.5 rounded-2xl border border-gray-200">
                            <div>
                                <label className="text-xs font-bold text-gray-700">Ciclo de Cobro</label>
                                {isEditing ? (
                                    <select
                                        value={formData.billingCycle}
                                        onChange={(e) => setFormData({ ...formData, billingCycle: e.target.value })}
                                        className="w-full rounded-xl border border-gray-300 px-3 py-1.5 text-xs bg-white mt-1"
                                    >
                                        <option value="monthly">Mensual</option>
                                        <option value="annual">Anual</option>
                                    </select>
                                ) : (
                                    <p className="font-bold text-gray-800 text-xs capitalize mt-1">{client.billingCycle || "Mensual"}</p>
                                )}
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-700">Tarifa Base ($)</label>
                                {isEditing ? (
                                    <Input
                                        type="number"
                                        value={formData.monthlyFee}
                                        onChange={(e) => setFormData({ ...formData, monthlyFee: e.target.value })}
                                        className="rounded-xl border-gray-300 text-xs mt-1 bg-white"
                                    />
                                ) : (
                                    <p className="font-bold text-emerald-700 text-sm mt-1">${client.monthlyFee}/mes</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-gray-500">Notas de Facturación</label>
                            {isEditing ? (
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    rows={2}
                                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs mt-1 focus:outline-none"
                                />
                            ) : (
                                <p className="text-xs text-gray-600 mt-1 italic">{client.notes || "Sin notas adicionales"}</p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Interactive Services & VPS Manager */}
                <div className="space-y-6">
                    {/* Services Manager */}
                    <Card className="bg-white/80 backdrop-blur rounded-3xl border-2 border-gray-100 shadow-sm">
                        <CardHeader className="pb-3 border-b border-gray-100">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
                                    <Database className="w-5 h-5 text-purple-600" />
                                    Servicios del Cliente ({client.services.length})
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3">
                            {/* Attach Orphan Service Selector */}
                            {orphanServices.length > 0 && (
                                <div className="p-3 bg-violet-50/70 border border-violet-200 rounded-2xl flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-violet-900">
                                        <Plus size={14} className="text-violet-600" />
                                        Asignar Servicio Huérfano:
                                    </div>
                                    <select
                                        defaultValue=""
                                        onChange={(e) => {
                                            if (e.target.value) handleLinkService(e.target.value);
                                        }}
                                        className="h-8 px-2.5 rounded-xl border border-violet-300 text-xs bg-white text-gray-800 font-medium"
                                    >
                                        <option value="" disabled>Seleccionar servicio...</option>
                                        {orphanServices.map(s => (
                                            <option key={s.id} value={s.id}>
                                                {s.name} ({s.type})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {client.services.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-6">Sin servicios asignados a este cliente.</p>
                            ) : (
                                <div className="space-y-2.5">
                                    {client.services.map((service) => (
                                        <div
                                            key={service.id}
                                            className="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50/80 border border-gray-200/80 hover:bg-violet-50/30 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <ServiceIcon type={service.type} name={service.name} size="sm" />
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <Link href={`/services/${service.id}`} className="font-bold text-gray-900 text-xs hover:text-violet-600">
                                                            {service.name}
                                                        </Link>
                                                        <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                                                            {service.type}
                                                        </Badge>
                                                        {service.url && (
                                                            <a href={service.url} target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-700">
                                                                <ExternalLink size={12} />
                                                            </a>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-gray-500 mt-0.5">
                                                        Estado: <span className="font-semibold text-emerald-600">{service.status}</span>
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Price & Action */}
                                            <div className="flex items-center gap-2">
                                                <div className="text-right">
                                                    <span className="text-xs font-black text-gray-900">${service.monthlyCost}</span>
                                                    <span className="text-[10px] text-gray-400">/mes</span>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleUnlinkService(service.id)}
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl text-xs h-7 px-2"
                                                    title="Desvincular servicio"
                                                >
                                                    <X size={13} />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* VPS List */}
                    <Card className="bg-white/80 backdrop-blur rounded-3xl border-2 border-gray-100 shadow-sm">
                        <CardHeader className="pb-3 border-b border-gray-100">
                            <CardTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
                                <Server className="w-5 h-5 text-blue-600" />
                                Servidores VPS Asignados ({client.vpsList.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                            {client.vpsList.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-4">Sin VPS asignados directamente.</p>
                            ) : (
                                <div className="space-y-2">
                                    {client.vpsList.map((vps) => (
                                        <Link key={vps.id} href={`/vps/${vps.id}`}>
                                            <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 hover:bg-blue-50/50 transition-colors">
                                                <div>
                                                    <p className="font-bold text-gray-900 text-xs">{vps.name}</p>
                                                    <p className="text-[11px] text-gray-500">{vps.ipAddress}</p>
                                                </div>
                                                <div className="text-right">
                                                    <Badge variant={vps.status === "running" ? "success" : "warning"} className="text-[10px]">
                                                        {vps.status}
                                                    </Badge>
                                                    <p className="text-xs font-bold text-gray-700 mt-1">${vps.monthlyCost}/mes</p>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Payment History */}
            <Card className="bg-white/80 backdrop-blur rounded-3xl border-2 border-gray-100 shadow-sm">
                <CardHeader className="pb-3 border-b border-gray-100 flex flex-row items-center justify-between">
                    <CardTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-emerald-600" />
                        Historial de Pagos y Facturas ({client.payments.length})
                    </CardTitle>
                    <Button
                        size="sm"
                        onClick={openQuickPayModal}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs gap-1 h-8"
                    >
                        <Plus size={13} />
                        Registrar Pago
                    </Button>
                </CardHeader>
                <CardContent className="p-4">
                    {client.payments.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-8">No hay pagos registrados para este cliente.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px]">
                                        <th className="text-left py-3 px-4 font-bold">Fecha</th>
                                        <th className="text-left py-3 px-4 font-bold">Referencia / Factura</th>
                                        <th className="text-right py-3 px-4 font-bold">Monto</th>
                                        <th className="text-center py-3 px-4 font-bold">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {client.payments.map((payment, index) => (
                                        <motion.tr
                                            key={payment.id}
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.03 }}
                                            className="border-b border-gray-100 hover:bg-emerald-50/40 transition-colors"
                                        >
                                            <td className="py-3 px-4 font-medium text-gray-800">
                                                {new Date(payment.date).toLocaleDateString("es-DO", {
                                                    year: "numeric",
                                                    month: "short",
                                                    day: "numeric",
                                                })}
                                            </td>
                                            <td className="py-3 px-4 font-mono text-violet-600 font-semibold">
                                                {payment.odooInvoiceName || `REC-${payment.id.slice(0, 8)}`}
                                            </td>
                                            <td className="py-3 px-4 text-right font-black text-emerald-700 text-sm">
                                                ${(payment.amount ?? 0).toFixed(2)}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <Badge
                                                    variant={payment.status === "completed" ? "success" : "outline"}
                                                    className="rounded-full text-[10px]"
                                                >
                                                    {payment.status === "completed" ? "Completado" : payment.status}
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

            {/* ── MODAL: QUICK PAYMENT ── */}
            <Dialog open={isQuickPayOpen} onOpenChange={setIsQuickPayOpen}>
                <DialogContent className="max-w-md rounded-3xl p-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold text-gray-900">
                            <DollarSign className="w-6 h-6 text-emerald-600" />
                            Registrar Cobro
                        </DialogTitle>
                        <DialogDescription className="text-xs text-gray-500">
                            Registra el pago de suscripción para <span className="font-bold text-gray-800">{client.name}</span>.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 my-2">
                        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 flex justify-between items-center text-sm font-bold text-emerald-950">
                            <span>Monto Sugerido:</span>
                            <span className="text-xl text-emerald-700">${calculatedTotalMonthly.toFixed(2)}</span>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-700">Monto Recibido ($ USD)</label>
                            <Input
                                type="number"
                                step="0.01"
                                value={payAmount}
                                onChange={(e) => setPayAmount(e.target.value)}
                                className="rounded-xl border-gray-300 font-bold text-base h-11"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-700">Referencia / Notas</label>
                            <Input
                                value={payNotes}
                                onChange={(e) => setPayNotes(e.target.value)}
                                placeholder="Ej: Transferencia / Zelle"
                                className="rounded-xl border-gray-300 text-xs h-10"
                            />
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0 mt-4">
                        <Button variant="outline" onClick={() => setIsQuickPayOpen(false)} className="rounded-xl">
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleQuickPaySubmit}
                            disabled={isPaying}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5"
                        >
                            {isPaying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Confirmar Cobro
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── MODAL: WHATSAPP MESSAGE ── */}
            <Dialog open={isWhatsAppOpen} onOpenChange={setIsWhatsAppOpen}>
                <DialogContent className="max-w-lg rounded-3xl p-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold text-gray-900">
                            <MessageSquare className="w-6 h-6 text-emerald-600" />
                            Recordatorio por WhatsApp
                        </DialogTitle>
                        <DialogDescription className="text-xs text-gray-500">
                            Mensaje para <span className="font-bold text-gray-800">{client.name}</span> ({client.phone || "Sin teléfono"}).
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 my-2">
                        <textarea
                            value={whatsAppMessage}
                            onChange={(e) => setWhatsAppMessage(e.target.value)}
                            rows={8}
                            className="w-full px-3.5 py-3 rounded-2xl border-2 border-gray-200 text-xs leading-relaxed focus:border-emerald-500 focus:outline-none resize-none font-sans"
                        />
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setIsWhatsAppOpen(false)} className="rounded-xl">
                            Cerrar
                        </Button>
                        <Button
                            onClick={handleSendWhatsApp}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5"
                        >
                            <Send size={14} />
                            Abrir WhatsApp
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
