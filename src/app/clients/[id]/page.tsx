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
    MessageSquare, Send, Check, Plus, AlertTriangle, Layers, Unlink, Edit3, Search, Sparkles
} from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/toast";
import { clients as clientsApi, services as servicesApi, billing as billingApi, type Service } from "@/lib/api";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useCurrency } from "@/lib/currency";
import { CurrencyToggle } from "@/components/CurrencyToggle";

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
    const { mode, rate, format, formatUSD, formatDOP } = useCurrency();
    const params = useParams();
    const router = useRouter();
    const clientId = params.id as string;

    const [client, setClient] = useState<ClientDetail | null>(null);
    const [allServices, setAllServices] = useState<Service[]>([]);
    const [orphanServices, setOrphanServices] = useState<Service[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Service Assignment & Management Modals
    const [isAssignServiceModalOpen, setIsAssignServiceModalOpen] = useState(false);
    const [assignTab, setAssignTab] = useState<"link" | "create">("link");
    const [assignSearch, setAssignSearch] = useState("");
    const [selectedServiceId, setSelectedServiceId] = useState("");
    const [assignBillingCycle, setAssignBillingCycle] = useState<"monthly" | "annual">("monthly");
    const [assignCost, setAssignCost] = useState<string>("0");
    const [isSubmittingService, setIsSubmittingService] = useState(false);

    // Create Service Form state
    const [newServiceForm, setNewServiceForm] = useState({
        name: "",
        type: "web",
        url: "",
        billingCycle: "monthly" as "monthly" | "annual",
        monthlyCost: "0",
        annualCost: "0",
        vpsId: "",
    });

    // Edit Service Price Modal
    const [editingServicePrice, setEditingServicePrice] = useState<{
        id: string;
        name: string;
        billingCycle: "monthly" | "annual";
        cost: string;
    } | null>(null);

    // Delete confirmation modal state
    const [serviceToDelete, setServiceToDelete] = useState<{ id: string; name: string } | null>(null);
    const [isDeletingService, setIsDeletingService] = useState(false);

    // Modals
    const [isQuickPayOpen, setIsQuickPayOpen] = useState(false);
    const [payCurrency, setPayCurrency] = useState<"USD" | "DOP">("USD");
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
                clientsApi.get(clientId).catch((err) => ({ success: false, data: null, error: err instanceof Error ? err.message : "Error" })),
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
            setAllServices(allSvcs);
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
        setPayCurrency("USD");
        const total = (client.monthlyFee || 0) + (client.totalMonthlyCost || 0);
        setPayAmount(String(total));
        setPayNotes(`Cobro mensual ${new Date().toLocaleDateString("es-ES", { month: "long", year: "numeric" })}`);
        setIsQuickPayOpen(true);
    };

    const handleQuickPaySubmit = async () => {
        if (!client) return;
        const rawAmt = parseFloat(payAmount);
        if (isNaN(rawAmt) || rawAmt < 0) {
            addToast("Monto inválido", "error");
            return;
        }

        const amtInUSD = payCurrency === "DOP" && rate > 0 ? rawAmt / rate : rawAmt;

        setIsPaying(true);
        try {
            const formattedNote = payCurrency === "DOP"
                ? `${payNotes} (Cobrado en DOP: RD$ ${rawAmt.toLocaleString("es-DO", { minimumFractionDigits: 2 })} a tasa ${rate})`
                : payNotes;

            const res = await clientsApi.recordPayment(client.id, {
                amount: amtInUSD,
                notes: formattedNote,
            });
            if (res.success) {
                addToast(`¡Pago de $${amtInUSD.toFixed(2)} USD (≈ RD$ ${(amtInUSD * rate).toFixed(2)} DOP) registrado!`, "success");
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
        const totalUSD = (client.monthlyFee || 0) + (client.totalMonthlyCost || 0);
        const totalDOP = (totalUSD * rate).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const serviceNames = (client.services && client.services.length > 0)
            ? client.services.map(s => s.name).join(", ")
            : "Servicios Cloud / Hosting";
        const cycle = client.billingCycle === "annual" ? "anual" : "mensual";
        const dueText = client.billingCycle === "annual"
            ? `el ${client.paymentDay || 1}/${client.paymentMonth || 1}`
            : `el día ${client.paymentDay || 1} de este mes`;

        const msg = `Hola *${client.name}*, te saludamos de *RNV*. Te recordamos el estado de tu suscripción:\n\n` +
            `📌 *Servicios:* ${serviceNames}\n` +
            `💵 *Total ${cycle}:* $${totalUSD.toFixed(2)} USD (≈ RD$ ${totalDOP} DOP a tasa ${rate})\n` +
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

    // Link Existing Service to this Client
    const handleLinkServiceSubmit = async () => {
        if (!selectedServiceId) {
            addToast("Por favor selecciona un servicio de la lista", "error");
            return;
        }
        setIsSubmittingService(true);
        try {
            const costNum = parseFloat(assignCost) || 0;
            const res = await servicesApi.bulkOrganize([{
                id: selectedServiceId,
                clientId: client?.id,
                billingCycle: assignBillingCycle,
                monthlyCost: assignBillingCycle === "monthly" ? costNum : 0,
                annualCost: assignBillingCycle === "annual" ? costNum : 0,
                amount: costNum,
            }]);
            if (res.success) {
                addToast("Servicio asignado correctamente al cliente", "success");
                setIsAssignServiceModalOpen(false);
                setSelectedServiceId("");
                fetchClient();
            } else {
                addToast(res.message || "Error al asignar servicio", "error");
            }
        } catch (e) {
            addToast(e instanceof Error ? e.message : "Error al vincular servicio", "error");
        } finally {
            setIsSubmittingService(false);
        }
    };

    // Create and Assign New Service
    const handleCreateServiceSubmit = async () => {
        if (!newServiceForm.name.trim()) {
            addToast("El nombre del servicio es obligatorio", "error");
            return;
        }
        setIsSubmittingService(true);
        try {
            const mCost = parseFloat(newServiceForm.monthlyCost) || 0;
            const aCost = parseFloat(newServiceForm.annualCost) || 0;
            const res = await servicesApi.create({
                name: newServiceForm.name.trim(),
                type: newServiceForm.type,
                url: newServiceForm.url.trim() || undefined,
                clientId: client?.id,
                vpsId: newServiceForm.vpsId || undefined,
                billingCycle: newServiceForm.billingCycle,
                monthlyCost: newServiceForm.billingCycle === "monthly" ? mCost : 0,
                annualCost: newServiceForm.billingCycle === "annual" ? aCost : 0,
                status: "active",
            });
            if (res.success) {
                addToast("Servicio creado y asignado al cliente con éxito", "success");
                setIsAssignServiceModalOpen(false);
                setNewServiceForm({
                    name: "",
                    type: "web",
                    url: "",
                    billingCycle: "monthly",
                    monthlyCost: "0",
                    annualCost: "0",
                    vpsId: "",
                });
                fetchClient();
            } else {
                addToast("Error al crear servicio", "error");
            }
        } catch (e) {
            addToast(e instanceof Error ? e.message : "Error al crear servicio", "error");
        } finally {
            setIsSubmittingService(false);
        }
    };

    // Unlink Service from this Client (leaves service in DB as orphan)
    const handleUnlinkService = async (serviceId: string, serviceName: string) => {
        if (!confirm(`¿Desvincular "${serviceName}" de este cliente? El servicio permanecerá registrado pero sin cliente asignado.`)) return;
        try {
            const res = await servicesApi.bulkOrganize([{
                id: serviceId,
                clientId: "",
            }]);
            if (res.success) {
                addToast(`Servicio "${serviceName}" desvinculado`, "success");
                fetchClient();
            } else {
                addToast(res.message || "Error al desvincular servicio", "error");
            }
        } catch {
            addToast("Error al desvincular servicio", "error");
        }
    };

    // Delete Service permanently from database
    const handleConfirmDeleteService = async () => {
        if (!serviceToDelete) return;
        setIsDeletingService(true);
        try {
            const res = await servicesApi.delete(serviceToDelete.id);
            if (res.success) {
                addToast(`Servicio "${serviceToDelete.name}" eliminado definitivamente`, "success");
                setServiceToDelete(null);
                fetchClient();
            } else {
                addToast(res.message || "Error al eliminar servicio", "error");
            }
        } catch (e) {
            addToast(e instanceof Error ? e.message : "Error al eliminar servicio", "error");
        } finally {
            setIsDeletingService(false);
        }
    };

    // Save Updated Service Price
    const handleSaveServicePrice = async () => {
        if (!editingServicePrice) return;
        try {
            const costNum = parseFloat(editingServicePrice.cost) || 0;
            const res = await servicesApi.bulkOrganize([{
                id: editingServicePrice.id,
                billingCycle: editingServicePrice.billingCycle,
                monthlyCost: editingServicePrice.billingCycle === "monthly" ? costNum : 0,
                annualCost: editingServicePrice.billingCycle === "annual" ? costNum : 0,
                amount: costNum,
            }]);
            if (res.success) {
                addToast("Tarifa de servicio actualizada", "success");
                setEditingServicePrice(null);
                fetchClient();
            } else {
                addToast(res.message || "Error al actualizar tarifa", "error");
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
                    {/* Quick Currency Switcher */}
                    <CurrencyToggle />

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
                                {format(calculatedTotalMonthly)}
                                <span className="text-xs font-normal text-violet-200"> /mes</span>
                            </p>
                            <p className="text-xs text-violet-200 font-bold mt-1">
                                ≈ {formatDOP(calculatedTotalMonthly)}
                            </p>
                            <p className="text-[11px] text-violet-300 mt-0.5">
                                {client.billingCycle === "annual" ? `Plan Anual: ${format(client.annualFee || calculatedTotalMonthly * 12)}/año` : "Plan Mensual"}
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
                            <p className="text-2xl font-black text-gray-900 mt-1">{format(client.monthlyFee || 0)}</p>
                            <p className="text-xs text-emerald-600 font-bold mt-0.5">≈ {formatDOP(client.monthlyFee || 0)}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">Suscripción fija</p>
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
                            <p className="text-xs text-purple-700 font-bold mt-0.5">
                                Costo: {format(client.serviceCost || client.services.reduce((sum, s) => sum + (s.monthlyCost || 0), 0))}/mes
                            </p>
                            <p className="text-[10px] text-purple-600 mt-0.5">
                                ≈ {formatDOP(client.serviceCost || client.services.reduce((sum, s) => sum + (s.monthlyCost || 0), 0))}
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
                                <Button
                                    size="sm"
                                    onClick={() => {
                                        setIsAssignServiceModalOpen(true);
                                        setAssignTab("link");
                                        setSelectedServiceId(orphanServices.length > 0 ? orphanServices[0].id : (allServices[0]?.id || ""));
                                        if (orphanServices.length > 0) {
                                            const s = orphanServices[0];
                                            setAssignCost(String(s.monthlyCost || 0));
                                            setAssignBillingCycle((s.billingCycle as "monthly" | "annual") || "monthly");
                                        }
                                    }}
                                    className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs h-8 px-3 flex items-center gap-1.5 shadow-sm shadow-violet-200 transition-all font-semibold"
                                >
                                    <Plus size={14} /> Asignar Servicio
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3">
                            {client.services.length === 0 ? (
                                <div className="text-center py-8 px-4 bg-gray-50/60 rounded-2xl border border-dashed border-gray-200">
                                    <Database className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                    <p className="text-xs text-gray-600 font-medium">Sin servicios asignados a este cliente</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">Vincula un servicio existente o crea uno nuevo</p>
                                    <Button
                                        size="sm"
                                        onClick={() => {
                                            setIsAssignServiceModalOpen(true);
                                            setAssignTab("link");
                                        }}
                                        className="mt-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs h-7 px-3"
                                    >
                                        <Plus size={13} className="mr-1" /> Asignar Servicio
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {client.services.map((service) => {
                                        const isAnnual = service.billingCycle === "annual";
                                        const displayCost = isAnnual ? (service.annualCost ?? service.monthlyCost) : service.monthlyCost;
                                        return (
                                            <div
                                                key={service.id}
                                                className="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50/80 border border-gray-200/80 hover:bg-violet-50/20 transition-all"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <ServiceIcon type={service.type} name={service.name} size="sm" />
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <Link href={`/services/${service.id}`} className="font-bold text-gray-900 text-xs hover:text-violet-600 truncate">
                                                                {service.name}
                                                            </Link>
                                                            <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                                                                {service.type}
                                                            </Badge>
                                                            {service.url && (
                                                                <a href={service.url} target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-700" title="Visitar URL">
                                                                    <ExternalLink size={12} />
                                                                </a>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                                                            <span>Estado: <span className="font-semibold text-emerald-600">{service.status}</span></span>
                                                            <span>•</span>
                                                            <span className="text-gray-400 capitalize">{isAnnual ? "Anual" : "Mensual"}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Price & Actions */}
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <div
                                                        onClick={() => setEditingServicePrice({
                                                            id: service.id,
                                                            name: service.name,
                                                            billingCycle: (service.billingCycle as "monthly" | "annual") || "monthly",
                                                            cost: String(displayCost || 0),
                                                        })}
                                                        className="text-right cursor-pointer group/price px-2.5 py-1 rounded-xl hover:bg-violet-100/60 transition-colors border border-transparent hover:border-violet-200"
                                                        title="Clic para editar tarifa y ciclo"
                                                    >
                                                        <div className="flex items-center justify-end gap-1">
                                                            <span className="text-xs font-black text-gray-900">${displayCost}</span>
                                                            <Edit3 size={11} className="text-violet-600 opacity-60 group-hover/price:opacity-100 transition-opacity" />
                                                        </div>
                                                        <span className="text-[10px] text-gray-400">/{isAnnual ? "año" : "mes"}</span>
                                                    </div>

                                                    <div className="flex items-center gap-1 border-l border-gray-200 pl-2">
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleUnlinkService(service.id, service.name)}
                                                            className="text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-xl text-xs h-7 w-7 p-0 flex items-center justify-center"
                                                            title="Desvincular servicio (quitar del cliente)"
                                                        >
                                                            <Unlink size={13} />
                                                        </Button>

                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => setServiceToDelete({ id: service.id, name: service.name })}
                                                            className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl text-xs h-7 w-7 p-0 flex items-center justify-center"
                                                            title="Eliminar servicio definitivamente de la base de datos"
                                                        >
                                                            <Trash2 size={13} />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
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
                        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 space-y-2">
                            <div className="flex justify-between items-center text-sm font-bold text-emerald-950">
                                <span>Tarifa Sugerida (USD):</span>
                                <span className="text-xl text-emerald-700">${calculatedTotalMonthly.toFixed(2)} USD</span>
                            </div>
                            <div className="flex justify-between items-center text-xs font-bold text-emerald-800">
                                <span>Equivalente en Pesos (DOP):</span>
                                <span className="font-mono text-emerald-800">
                                    RD$ {(calculatedTotalMonthly * rate).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                            <p className="text-[10px] text-gray-400 text-right">Tasa: 1 USD = RD$ {rate.toFixed(2)}</p>
                        </div>

                        {/* Moneda selector */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-700">Moneda del Pago</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPayCurrency("USD");
                                        setPayAmount(String(calculatedTotalMonthly));
                                    }}
                                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                        payCurrency === "USD"
                                            ? "border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm"
                                            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                                    }`}
                                >
                                    <span>💵</span> USD ($) Dólares
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPayCurrency("DOP");
                                        setPayAmount(String((calculatedTotalMonthly * rate).toFixed(2)));
                                    }}
                                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                        payCurrency === "DOP"
                                            ? "border-blue-500 bg-blue-50 text-blue-800 shadow-sm"
                                            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                                    }`}
                                >
                                    <span>🇩🇴</span> DOP (RD$) Pesos
                                </button>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-semibold text-gray-700">
                                    Monto Recibido ({payCurrency === "USD" ? "$ USD" : "RD$ DOP"})
                                </label>
                                {payCurrency === "USD" ? (
                                    <span className="text-[11px] font-bold text-emerald-700">
                                        ≈ RD$ {((parseFloat(payAmount) || 0) * rate).toLocaleString("es-DO", { minimumFractionDigits: 2 })} DOP
                                    </span>
                                ) : (
                                    <span className="text-[11px] font-bold text-blue-700">
                                        ≈ ${(((parseFloat(payAmount) || 0) / rate) || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} USD
                                    </span>
                                )}
                            </div>
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
                                placeholder="Ej: Transferencia / Zelle / Banco Popular #123"
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

            {/* ── MODAL: ASIGNAR O CREAR SERVICIO ── */}
            <Dialog open={isAssignServiceModalOpen} onOpenChange={setIsAssignServiceModalOpen}>
                <DialogContent className="max-w-xl rounded-3xl p-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-lg font-bold text-gray-900">
                            <Database className="w-5 h-5 text-violet-600" />
                            Gestionar Servicios para {client.name}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-gray-500">
                            Vincula un servicio existente en la plataforma o crea uno nuevo configurado para este cliente.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Tabs */}
                    <div className="flex rounded-xl bg-gray-100 p-1 mt-2">
                        <button
                            type="button"
                            onClick={() => setAssignTab("link")}
                            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                assignTab === "link"
                                    ? "bg-white text-violet-700 shadow-sm"
                                    : "text-gray-500 hover:text-gray-900"
                            }`}
                        >
                            Vincular Servicio Existente
                        </button>
                        <button
                            type="button"
                            onClick={() => setAssignTab("create")}
                            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                assignTab === "create"
                                    ? "bg-white text-violet-700 shadow-sm"
                                    : "text-gray-500 hover:text-gray-900"
                            }`}
                        >
                            Crear Nuevo Servicio
                        </button>
                    </div>

                    {assignTab === "link" ? (
                        <div className="space-y-4 my-3">
                            <div className="relative">
                                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <Input
                                    value={assignSearch}
                                    onChange={(e) => setAssignSearch(e.target.value)}
                                    placeholder="Buscar por nombre, tipo o URL..."
                                    className="pl-9 rounded-xl border-gray-200 text-xs h-9"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-700">Seleccionar Servicio</label>
                                <div className="max-h-48 overflow-y-auto space-y-1.5 p-1 border border-gray-200 rounded-2xl bg-gray-50/50">
                                    {(() => {
                                        const filtered = allServices.filter(s => {
                                            const matchesSearch = !assignSearch ||
                                                s.name.toLowerCase().includes(assignSearch.toLowerCase()) ||
                                                s.type.toLowerCase().includes(assignSearch.toLowerCase()) ||
                                                (s.url && s.url.toLowerCase().includes(assignSearch.toLowerCase()));
                                            const isAlreadyInClient = client.services.some(cs => cs.id === s.id);
                                            return matchesSearch && !isAlreadyInClient;
                                        });

                                        if (filtered.length === 0) {
                                            return (
                                                <div className="text-center py-6 text-xs text-gray-400">
                                                    No hay servicios disponibles que coincidan con la búsqueda.
                                                </div>
                                            );
                                        }

                                        return filtered.map((s) => {
                                            const isSelected = selectedServiceId === s.id;
                                            const isOrphan = !s.clientId || s.clientId === "";
                                            return (
                                                <div
                                                    key={s.id}
                                                    onClick={() => {
                                                        setSelectedServiceId(s.id);
                                                        setAssignCost(String(s.monthlyCost || s.annualCost || 0));
                                                        setAssignBillingCycle((s.billingCycle as "monthly" | "annual") || "monthly");
                                                    }}
                                                    className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${
                                                        isSelected
                                                            ? "bg-violet-50 border-violet-400 text-violet-900 shadow-xs"
                                                            : "bg-white border-gray-100 hover:bg-gray-100/70 text-gray-800"
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <ServiceIcon type={s.type} name={s.name} size="sm" />
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-bold text-xs truncate">{s.name}</span>
                                                                <Badge variant="outline" className="text-[9px] uppercase px-1 py-0">
                                                                    {s.type}
                                                                </Badge>
                                                                {isOrphan ? (
                                                                    <Badge variant="success" className="text-[9px] px-1 py-0 bg-emerald-50 text-emerald-700 border-emerald-200">
                                                                        Huérfano
                                                                    </Badge>
                                                                ) : (
                                                                    <span className="text-[10px] text-gray-400 truncate">
                                                                        (En otro cliente)
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {s.url && (
                                                                <span className="text-[10px] text-gray-400 truncate block">
                                                                    {s.url}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <span className="text-xs font-bold text-gray-700">${s.monthlyCost || 0}</span>
                                                        <span className="text-[10px] text-gray-400">/mes</span>
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>

                            {/* Billing & Rate Customization */}
                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                                <div>
                                    <label className="text-xs font-semibold text-gray-700">Ciclo de Facturación</label>
                                    <select
                                        value={assignBillingCycle}
                                        onChange={(e) => setAssignBillingCycle(e.target.value as "monthly" | "annual")}
                                        className="w-full mt-1 h-9 px-3 rounded-xl border border-gray-200 text-xs font-medium bg-white"
                                    >
                                        <option value="monthly">Mensual</option>
                                        <option value="annual">Anual</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-700">
                                        Tarifa a Cobrar ($ USD {assignBillingCycle === "annual" ? "al año" : "al mes"})
                                    </label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={assignCost}
                                        onChange={(e) => setAssignCost(e.target.value)}
                                        className="mt-1 rounded-xl border-gray-200 text-xs h-9 font-bold"
                                    />
                                </div>
                            </div>

                            <DialogFooter className="gap-2 sm:gap-0 pt-2">
                                <Button variant="outline" onClick={() => setIsAssignServiceModalOpen(false)} className="rounded-xl">
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleLinkServiceSubmit}
                                    disabled={!selectedServiceId || isSubmittingService}
                                    className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl gap-1.5"
                                >
                                    {isSubmittingService ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    Vincular Servicio
                                </Button>
                            </DialogFooter>
                        </div>
                    ) : (
                        <div className="space-y-3.5 my-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-700">Nombre del Servicio *</label>
                                    <Input
                                        value={newServiceForm.name}
                                        onChange={(e) => setNewServiceForm({ ...newServiceForm, name: e.target.value })}
                                        placeholder="Ej: ERP Odoo, Web Store"
                                        className="mt-1 rounded-xl border-gray-200 text-xs h-9"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-700">Tipo de Servicio</label>
                                    <select
                                        value={newServiceForm.type}
                                        onChange={(e) => setNewServiceForm({ ...newServiceForm, type: e.target.value })}
                                        className="w-full mt-1 h-9 px-3 rounded-xl border border-gray-200 text-xs font-medium bg-white"
                                    >
                                        <option value="web">Web Application</option>
                                        <option value="odoo">Odoo ERP</option>
                                        <option value="api">API / Backend</option>
                                        <option value="database">Database</option>
                                        <option value="other">Otro</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-gray-700">URL / Dominio (Opcional)</label>
                                <Input
                                    value={newServiceForm.url}
                                    onChange={(e) => setNewServiceForm({ ...newServiceForm, url: e.target.value })}
                                    placeholder="https://app.midominio.com"
                                    className="mt-1 rounded-xl border-gray-200 text-xs h-9"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-700">VPS Asociado (Opcional)</label>
                                    <select
                                        value={newServiceForm.vpsId}
                                        onChange={(e) => setNewServiceForm({ ...newServiceForm, vpsId: e.target.value })}
                                        className="w-full mt-1 h-9 px-3 rounded-xl border border-gray-200 text-xs font-medium bg-white"
                                    >
                                        <option value="">Sin VPS asociado</option>
                                        {client.vpsList.map((v) => (
                                            <option key={v.id} value={v.id}>
                                                {v.name} ({v.ipAddress})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-700">Ciclo de Cobro</label>
                                    <select
                                        value={newServiceForm.billingCycle}
                                        onChange={(e) => setNewServiceForm({ ...newServiceForm, billingCycle: e.target.value as "monthly" | "annual" })}
                                        className="w-full mt-1 h-9 px-3 rounded-xl border border-gray-200 text-xs font-medium bg-white"
                                    >
                                        <option value="monthly">Mensual</option>
                                        <option value="annual">Anual</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-gray-700">
                                    Tarifa ($ USD {newServiceForm.billingCycle === "annual" ? "al año" : "al mes"})
                                </label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={newServiceForm.billingCycle === "annual" ? newServiceForm.annualCost : newServiceForm.monthlyCost}
                                    onChange={(e) => {
                                        if (newServiceForm.billingCycle === "annual") {
                                            setNewServiceForm({ ...newServiceForm, annualCost: e.target.value });
                                        } else {
                                            setNewServiceForm({ ...newServiceForm, monthlyCost: e.target.value });
                                        }
                                    }}
                                    className="mt-1 rounded-xl border-gray-200 text-xs h-9 font-bold"
                                />
                            </div>

                            <DialogFooter className="gap-2 sm:gap-0 pt-2">
                                <Button variant="outline" onClick={() => setIsAssignServiceModalOpen(false)} className="rounded-xl">
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleCreateServiceSubmit}
                                    disabled={!newServiceForm.name.trim() || isSubmittingService}
                                    className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl gap-1.5"
                                >
                                    {isSubmittingService ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    Crear y Asignar
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* ── MODAL: EDITAR TARIFA DE SERVICIO ── */}
            <Dialog open={!!editingServicePrice} onOpenChange={(open) => !open && setEditingServicePrice(null)}>
                <DialogContent className="max-w-md rounded-3xl p-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-lg font-bold text-gray-900">
                            <DollarSign className="w-5 h-5 text-emerald-600" />
                            Editar Tarifa: {editingServicePrice?.name}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-gray-500">
                            Ajusta el ciclo de facturación y el precio a cobrar por este servicio.
                        </DialogDescription>
                    </DialogHeader>

                    {editingServicePrice && (
                        <div className="space-y-4 my-3">
                            <div>
                                <label className="text-xs font-semibold text-gray-700">Ciclo de Facturación</label>
                                <select
                                    value={editingServicePrice.billingCycle}
                                    onChange={(e) => setEditingServicePrice({ ...editingServicePrice, billingCycle: e.target.value as "monthly" | "annual" })}
                                    className="w-full mt-1 h-9 px-3 rounded-xl border border-gray-200 text-xs font-medium bg-white"
                                >
                                    <option value="monthly">Mensual</option>
                                    <option value="annual">Anual</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-700">
                                    Tarifa ($ USD {editingServicePrice.billingCycle === "annual" ? "al año" : "al mes"})
                                </label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={editingServicePrice.cost}
                                    onChange={(e) => setEditingServicePrice({ ...editingServicePrice, cost: e.target.value })}
                                    className="mt-1 rounded-xl border-gray-200 text-xs h-9 font-bold"
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0 pt-2">
                        <Button variant="outline" onClick={() => setEditingServicePrice(null)} className="rounded-xl">
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSaveServicePrice}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5"
                        >
                            <Save className="w-4 h-4" />
                            Guardar Tarifa
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── MODAL: CONFIRMAR ELIMINACIÓN DEFINITIVA DE SERVICIO ── */}
            <Dialog open={!!serviceToDelete} onOpenChange={(open) => !open && setServiceToDelete(null)}>
                <DialogContent className="max-w-md rounded-3xl p-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-lg font-bold text-red-600">
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                            Eliminar Servicio Definitivamente
                        </DialogTitle>
                        <DialogDescription className="text-xs text-gray-600 pt-1">
                            ¿Estás seguro de que deseas eliminar permanentemente el servicio <span className="font-bold text-gray-900">{serviceToDelete?.name}</span>?
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-3 bg-red-50/80 border border-red-200 rounded-2xl text-xs text-red-800 space-y-1 my-2">
                        <p className="font-semibold">⚠️ Esta acción no se puede deshacer.</p>
                        <p className="text-[11px] text-red-700">El servicio se borrará de la base de datos y se desvinculará de cualquier tarea programada o credencial asociada.</p>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0 pt-2">
                        <Button variant="outline" onClick={() => setServiceToDelete(null)} className="rounded-xl">
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleConfirmDeleteService}
                            disabled={isDeletingService}
                            className="bg-red-600 hover:bg-red-700 text-white rounded-xl gap-1.5"
                        >
                            {isDeletingService ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            Eliminar Definitivamente
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
