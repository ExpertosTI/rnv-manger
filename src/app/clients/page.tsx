"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
    Users, Plus, Search, Mail, Phone, Calendar, DollarSign, AlertTriangle,
    RefreshCw, Building, FileText, CheckCircle2, Clock, Sparkles, Layers,
    Send, MessageSquare, ExternalLink, Edit2, Trash2,
    Wrench, Check, Copy, Download,
    Server, ArrowRight, UsersRound
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/ui/toast";
import { clients as clientsApi, services as servicesApi, billing as billingApi, auth, type Client, type Service, type User } from "@/lib/api";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useCurrency } from "@/lib/currency";
import { CurrencyToggle } from "@/components/CurrencyToggle";
import { AffiliatesModal } from "@/components/AffiliatesModal";

type FilterTab = "all" | "overdue" | "paid" | "pending" | "no_services" | "zero_fee" | "no_odoo" | "inactive";
type ViewMode = "directory" | "cleanup";

export default function ClientsPage() {
    const { mode, rate, format, formatUSD, formatDOP, toDOP, toUSD } = useCurrency();
    const [clients, setClients] = useState<Client[]>([]);
    const [allServices, setAllServices] = useState<Service[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterTab, setFilterTab] = useState<FilterTab>("all");
    const [cycleFilter, setCycleFilter] = useState<"all" | "monthly" | "annual">("all");
    const [sortBy, setSortBy] = useState<"name" | "revenue" | "daysLate" | "paymentDay">("name");
    const [viewMode, setViewMode] = useState<ViewMode>("directory");
    const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);

    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isAffiliatesModalOpen, setIsAffiliatesModalOpen] = useState(false);
    const [affiliateFilter, setAffiliateFilter] = useState<string>("all");

    // Modals
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const [quickPayClient, setQuickPayClient] = useState<Client | null>(null);
    const [organizeClient, setOrganizeClient] = useState<Client | null>(null);
    const [whatsAppModalClient, setWhatsAppModalClient] = useState<Client | null>(null);
    const [whatsAppMessage, setWhatsAppMessage] = useState("");

    // Quick Pay Form
    const [payCurrency, setPayCurrency] = useState<"USD" | "DOP">("USD");
    const [payAmount, setPayAmount] = useState("");
    const [payNotes, setPayNotes] = useState("");
    const [isPaying, setIsPaying] = useState(false);

    // Form state for Create / Edit
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        phone: "",
        companyName: "",
        notes: "",
        billingCycle: "monthly",
        monthlyFee: "",
        annualFee: "",
        paymentDay: "1",
        paymentMonth: "1",
        isActive: true,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reminders state
    const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
    const [isBatchReminding, setIsBatchReminding] = useState(false);

    const { addToast } = useToast();

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [clientsRes, servicesRes, authRes] = await Promise.all([
                clientsApi.list(),
                servicesApi.list().catch(() => ({ data: [] })),
                auth.me().catch(() => null),
            ]);
            setClients(Array.isArray(clientsRes.data) ? clientsRes.data : []);
            setAllServices(Array.isArray(servicesRes.data) ? servicesRes.data : []);
            if (authRes && authRes.success && authRes.user) {
                setCurrentUser(authRes.user);
            }
        } catch (err) {
            console.error("Error fetching data:", err);
            addToast("Error al cargar datos", "error");
        } finally {
            setIsLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const isMaster = !currentUser || currentUser.role === "superadmin" || currentUser.role === "admin";
    const isAffiliate = currentUser?.role === "affiliate" || currentUser?.role === "collaborator";

    // Orphan Services (services without client)
    const orphanServices = useMemo(() => {
        return allServices.filter(s => !s.clientId || s.clientId === "");
    }, [allServices]);

    // Diagnostic Metrics
    const metrics = useMemo(() => {
        const totalClients = clients.length;
        const activeClients = clients.filter(c => c.isActive);
        const monthlyRevenue = activeClients.reduce((sum, c) => {
            const cost = c.calculatedCosts?.total ?? ((c.monthlyFee || 0) + (c.totalMonthlyCost || 0));
            return sum + (c.billingCycle === "annual" ? (c.annualFee || cost * 12) / 12 : cost);
        }, 0);

        const overdueClients = clients.filter(c => c.isOverdue || c.billingStatus === "overdue");
        const overdueAmount = overdueClients.reduce((sum, c) => sum + (c.amountDue || c.monthlyFee || 0), 0);
        const paidClients = clients.filter(c => c.paidThisPeriod || c.billingStatus === "paid");
        
        // Issues
        const noServicesClients = clients.filter(c => (c.services?.length ?? 0) === 0 && (c.vpsList?.length ?? 0) === 0);
        const zeroFeeClients = clients.filter(c => {
            const total = c.calculatedCosts?.total ?? c.monthlyFee ?? 0;
            return total <= 0 && (!c.annualFee || c.annualFee <= 0) && ((c.services?.length ?? 0) > 0 || (c.vpsList?.length ?? 0) > 0);
        });
        const noOdooClients = clients.filter(c => !c.odooPartnerId && !c.syncedWithOdoo);
        const noContactClients = clients.filter(c => !c.email && !c.phone);

        return {
            totalClients,
            activeClients: activeClients.length,
            monthlyRevenue,
            overdueCount: overdueClients.length,
            overdueAmount,
            paidCount: paidClients.length,
            orphanServicesCount: orphanServices.length,
            noServicesCount: noServicesClients.length,
            zeroFeeCount: zeroFeeClients.length,
            noOdooCount: noOdooClients.length,
            noContactCount: noContactClients.length,
            totalIssues: overdueClients.length + orphanServices.length + zeroFeeClients.length + noContactClients.length,
        };
    }, [clients, orphanServices]);

    // Filter and Sort Clients
    const filteredClients = useMemo(() => {
        return clients.filter(c => {
            // Search filter
            const matchSearch =
                c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.services?.some(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));

            if (!matchSearch) return false;

            // Cycle filter
            if (cycleFilter === "monthly" && c.billingCycle === "annual") return false;
            if (cycleFilter === "annual" && c.billingCycle !== "annual") return false;

            // Affiliate filter (for Master view)
            if (isMaster && affiliateFilter !== "all") {
                if (affiliateFilter === "unassigned") {
                    if (c.affiliateId) return false;
                } else if (c.affiliateId !== affiliateFilter) {
                    return false;
                }
            }

            // Tab filter
            switch (filterTab) {
                case "overdue":
                    return c.isOverdue || c.billingStatus === "overdue";
                case "paid":
                    return c.paidThisPeriod || c.billingStatus === "paid";
                case "pending":
                    return c.billingStatus === "pending" || c.billingStatus === "due_today";
                case "no_services":
                    return (c.services?.length ?? 0) === 0 && (c.vpsList?.length ?? 0) === 0;
                case "zero_fee": {
                    const total = c.calculatedCosts?.total ?? c.monthlyFee ?? 0;
                    return total <= 0 && (!c.annualFee || c.annualFee <= 0) && ((c.services?.length ?? 0) > 0 || (c.vpsList?.length ?? 0) > 0);
                }
                case "no_odoo":
                    return !c.odooPartnerId && !c.syncedWithOdoo;
                case "inactive":
                    return !c.isActive;
                default:
                    return true;
            }
        }).sort((a, b) => {
            if (sortBy === "revenue") {
                const revA = a.calculatedCosts?.total ?? a.monthlyFee ?? 0;
                const revB = b.calculatedCosts?.total ?? b.monthlyFee ?? 0;
                return revB - revA;
            }
            if (sortBy === "daysLate") {
                return (b.daysLate || 0) - (a.daysLate || 0);
            }
            if (sortBy === "paymentDay") {
                return (a.paymentDay || 1) - (b.paymentDay || 1);
            }
            return a.name.localeCompare(b.name);
        });
    }, [clients, searchTerm, filterTab, cycleFilter, sortBy, affiliateFilter, isMaster]);

    // Handle Form change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (type === "checkbox") {
            const checked = (e.target as HTMLInputElement).checked;
            setFormData(prev => ({ ...prev, [name]: checked }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    // Open Create Modal
    const openCreateModal = () => {
        setEditingClient(null);
        setFormData({
            name: "",
            email: "",
            phone: "",
            companyName: "",
            notes: "",
            billingCycle: "monthly",
            monthlyFee: "",
            annualFee: "",
            paymentDay: "1",
            paymentMonth: "1",
            isActive: true,
        });
        setIsCreateModalOpen(true);
    };

    // Open Edit Modal
    const openEditModal = (client: Client) => {
        setEditingClient(client);
        setFormData({
            name: client.name || "",
            email: client.email || "",
            phone: client.phone || "",
            companyName: client.companyName || "",
            notes: client.notes || "",
            billingCycle: client.billingCycle || "monthly",
            monthlyFee: String(client.monthlyFee || ""),
            annualFee: String(client.annualFee || ""),
            paymentDay: String(client.paymentDay || 1),
            paymentMonth: String(client.paymentMonth || 1),
            isActive: client.isActive ?? true,
        });
        setIsCreateModalOpen(true);
    };

    // Submit Create / Edit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            addToast("El nombre es requerido", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                name: formData.name.trim(),
                email: formData.email.trim() || undefined,
                phone: formData.phone.trim() || undefined,
                companyName: formData.companyName.trim() || undefined,
                notes: formData.notes.trim() || undefined,
                billingCycle: formData.billingCycle as "monthly" | "annual",
                monthlyFee: parseFloat(formData.monthlyFee) || 0,
                annualFee: parseFloat(formData.annualFee) || 0,
                paymentDay: parseInt(formData.paymentDay) || 1,
                paymentMonth: parseInt(formData.paymentMonth) || 1,
                isActive: formData.isActive,
            };

            if (editingClient) {
                await clientsApi.update(editingClient.id, payload);
                addToast("Cliente actualizado exitosamente", "success");
            } else {
                await clientsApi.create(payload);
                addToast("Cliente creado exitosamente", "success");
            }

            setIsCreateModalOpen(false);
            fetchData();
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error al guardar", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Delete Client
    const handleDeleteClient = async (client: Client) => {
        if (!confirm(`¿Eliminar al cliente "${client.name}"? Esta acción no se puede deshacer.`)) return;
        try {
            await clientsApi.delete(client.id);
            addToast("Cliente eliminado", "success");
            fetchData();
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error al eliminar", "error");
        }
    };

    // Open Quick Pay Modal
    const openQuickPay = (client: Client) => {
        setQuickPayClient(client);
        setPayCurrency("USD");
        const total = client.amountDue && client.amountDue > 0
            ? client.amountDue
            : (client.calculatedCosts?.total ?? client.monthlyFee ?? 0);
        setPayAmount(String(total));
        setPayNotes(`Cobro servicio ${new Date().toLocaleDateString("es-ES", { month: "long", year: "numeric" })}`);
    };

    // Submit Quick Payment
    const handleQuickPaySubmit = async () => {
        if (!quickPayClient) return;
        const rawAmt = parseFloat(payAmount);
        if (isNaN(rawAmt) || rawAmt < 0) {
            addToast("Monto inválido", "error");
            return;
        }

        // Always normalize amount in USD for backend storage
        const amtInUSD = payCurrency === "DOP" && rate > 0 ? rawAmt / rate : rawAmt;

        setIsPaying(true);
        try {
            const formattedNote = payCurrency === "DOP"
                ? `${payNotes} (Cobrado en DOP: RD$ ${rawAmt.toLocaleString("es-DO", { minimumFractionDigits: 2 })} a tasa ${rate})`
                : payNotes;

            const res = await clientsApi.recordPayment(quickPayClient.id, {
                amount: amtInUSD,
                notes: formattedNote,
            });
            if (res.success) {
                addToast(`¡Pago de $${amtInUSD.toFixed(2)} USD (≈ RD$ ${(amtInUSD * rate).toFixed(2)} DOP) registrado exitosamente!`, "success");
                setQuickPayClient(null);
                fetchData();
            } else {
                addToast("Error al registrar pago", "error");
            }
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error al registrar pago", "error");
        } finally {
            setIsPaying(false);
        }
    };

    // Open WhatsApp Assistant
    const openWhatsApp = (client: Client) => {
        setWhatsAppModalClient(client);
        const totalUSD = client.amountDue && client.amountDue > 0
            ? client.amountDue
            : (client.calculatedCosts?.total ?? client.monthlyFee ?? 0);
        const totalDOP = (totalUSD * rate).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const serviceNames = (client.services && client.services.length > 0)
            ? client.services.map(s => s.name).join(", ")
            : "Servicios Cloud / Hosting";
        const cycle = client.billingCycle === "annual" ? "anual" : "mensual";
        const dueText = client.billingCycle === "annual"
            ? `el ${client.paymentDay || 1}/${client.paymentMonth || 1}`
            : `el día ${client.paymentDay || 1} de este mes`;

        const msg = `Hola *${client.name}*, te saludamos cordialmente del equipo de *RNV*. Te recordamos el estado de tu servicio:\n\n` +
            `📌 *Servicios:* ${serviceNames}\n` +
            `💵 *Total ${cycle}:* $${totalUSD.toFixed(2)} USD (≈ RD$ ${totalDOP} DOP a tasa ${rate})\n` +
            `📅 *Fecha de vencimiento:* ${dueText}\n\n` +
            `Agradecemos tu confirmación una vez realizado el pago para emitir tu comprobante. ¡Quedamos a tu disposición!`;

        setWhatsAppMessage(msg);
    };

    // Send WhatsApp Direct Link
    const handleSendWhatsApp = () => {
        if (!whatsAppModalClient) return;
        const phone = (whatsAppModalClient.phone || "").replace(/[^0-9+]/g, "");
        if (!phone) {
            addToast("El cliente no tiene teléfono configurado", "error");
            return;
        }
        const cleanPhone = phone.startsWith("+") ? phone.slice(1) : phone;
        const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsAppMessage)}`;
        window.open(url, "_blank");
        setWhatsAppModalClient(null);
    };

    // Send Email Reminder
    const handleSendEmailReminder = async (clientId: string) => {
        setSendingReminderId(clientId);
        try {
            const res = await billingApi.remind({ clientId });
            if (res.sent > 0) {
                addToast("Recordatorio enviado por email exitosamente", "success");
            } else if (res.skipped > 0) {
                addToast("El cliente no tiene email o ya pagó", "info");
            } else {
                addToast(res.errors?.join("; ") || "No se pudo enviar el correo", "error");
            }
        } catch (e) {
            addToast(e instanceof Error ? e.message : "Error al enviar email", "error");
        } finally {
            setSendingReminderId(null);
        }
    };

    // Assign Orphan Service to Client
    const handleAssignOrphanService = async (serviceId: string, targetClientId: string, cost?: number) => {
        if (!targetClientId) return;
        try {
            const payload = [{
                id: serviceId,
                clientId: targetClientId,
                monthlyCost: cost ?? 0,
            }];
            const res = await servicesApi.bulkOrganize(payload);
            if (res.success) {
                addToast("Servicio asignado al cliente con éxito", "success");
                fetchData();
            } else {
                addToast("Error al asignar servicio", "error");
            }
        } catch (e) {
            addToast(e instanceof Error ? e.message : "Error de asignación", "error");
        }
    };

    // Toggle Multi-Selection
    const toggleSelectClient = (id: string) => {
        setSelectedClientIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const selectAllFiltered = () => {
        if (selectedClientIds.length === filteredClients.length) {
            setSelectedClientIds([]);
        } else {
            setSelectedClientIds(filteredClients.map(c => c.id));
        }
    };

    // Batch Reminders
    const handleBatchRemind = async () => {
        if (selectedClientIds.length === 0) return;
        setIsBatchReminding(true);
        try {
            let sentCount = 0;
            for (const id of selectedClientIds) {
                const res = await billingApi.remind({ clientId: id }).catch(() => null);
                if (res && res.sent > 0) sentCount++;
            }
            addToast(`Se enviaron recordatorios a ${sentCount} cliente(s)`, "success");
            setSelectedClientIds([]);
        } catch {
            addToast("Error en envío masivo", "error");
        } finally {
            setIsBatchReminding(false);
        }
    };

    // Export to Clipboard
    const handleExportSummary = () => {
        const lines = [
            `📋 REPORTE DE COBRANZA - RNV MANAGER (${new Date().toLocaleDateString("es-ES")})`,
            `Total Clientes: ${clients.length} | Ingresos Proyectados: $${metrics.monthlyRevenue.toFixed(2)}/mes`,
            "--------------------------------------------------",
            ...filteredClients.map(c => {
                const total = c.calculatedCosts?.total ?? c.monthlyFee ?? 0;
                const status = c.paidThisPeriod ? "✅ Pagado" : c.isOverdue ? `🔴 Mora (${c.daysLate}d)` : "⏳ Pendiente";
                return `• ${c.name} (${c.companyName || "Personal"}): $${total.toFixed(2)}/mes - Día ${c.paymentDay || 1} [${status}] ${c.phone ? `📱 ${c.phone}` : ""}`;
            }),
        ];
        navigator.clipboard.writeText(lines.join("\n"));
        addToast("Listado de cobranza copiado al portapapeles", "success");
    };

    // Helper status badge renderer
    const renderStatusBadge = (client: Client) => {
        if (!client.isActive) {
            return <Badge variant="outline" className="text-gray-400 bg-gray-50 border-gray-200">Inactivo</Badge>;
        }
        if (client.paidThisPeriod || client.billingStatus === "paid") {
            return (
                <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200 gap-1">
                    <CheckCircle2 size={12} className="text-emerald-600" /> Al día
                </Badge>
            );
        }
        if (client.isOverdue || client.billingStatus === "overdue") {
            return (
                <Badge variant="outline" className="text-red-700 bg-red-50 border-red-200 gap-1 animate-pulse">
                    <AlertTriangle size={12} className="text-red-600" /> Vence hace {client.daysLate || 1}d
                </Badge>
            );
        }
        if (client.billingStatus === "due_today") {
            return (
                <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200 gap-1">
                    <Clock size={12} className="text-amber-600" /> Vence hoy
                </Badge>
            );
        }
        if (client.billingStatus === "unconfigured") {
            return (
                <Badge variant="outline" className="text-orange-700 bg-orange-50 border-orange-200 gap-1">
                    <Wrench size={12} className="text-orange-600" /> Sin tarifa ($0)
                </Badge>
            );
        }
        return (
            <Badge variant="outline" className="text-blue-700 bg-blue-50 border-blue-200 gap-1">
                <Calendar size={12} className="text-blue-600" /> Día {client.paymentDay || 1}
            </Badge>
        );
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-16">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-violet-600 to-purple-500 text-white shadow-md shadow-violet-200">
                            <Users className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-gray-900 via-gray-800 to-gray-700 bg-clip-text text-transparent">
                                Clientes & Cobranzas
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Depura anomalías, organiza servicios y cobra en 1 clic
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    {/* View mode switcher */}
                    <div className="flex bg-gray-100/80 p-1 rounded-2xl border border-gray-200/80">
                        <button
                            onClick={() => setViewMode("directory")}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                viewMode === "directory"
                                    ? "bg-white text-violet-700 shadow-sm"
                                    : "text-gray-600 hover:text-gray-900"
                            }`}
                        >
                            <Users size={14} />
                            Directorio & Cobro
                        </button>
                        <button
                            onClick={() => setViewMode("cleanup")}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                viewMode === "cleanup"
                                    ? "bg-white text-violet-700 shadow-sm"
                                    : "text-gray-600 hover:text-gray-900"
                            }`}
                        >
                            <Sparkles size={14} className="text-amber-500" />
                            Centro de Depuración
                            {metrics.totalIssues > 0 && (
                                <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800">
                                    {metrics.totalIssues}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Quick Currency Switcher */}
                    <CurrencyToggle />

                    {/* Master Affiliates & Collaborators Modal */}
                    {isMaster && (
                        <Button
                            variant="outline"
                            onClick={() => setIsAffiliatesModalOpen(true)}
                            className="gap-2 bg-white/90 hover:bg-violet-50 text-violet-700 border-violet-200 hover:border-violet-300 rounded-2xl shadow-sm text-xs font-semibold h-10 px-3.5"
                        >
                            <UsersRound size={15} />
                            Afiliados & Colaboradores
                        </Button>
                    )}

                    <Button
                        onClick={openCreateModal}
                        className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-2xl shadow-md shadow-violet-200 text-xs font-semibold h-10 px-4"
                    >
                        <Plus size={16} />
                        Nuevo Cliente
                    </Button>
                </div>
            </div>

            {/* Collaborator Portfolio Banner if user is affiliate */}
            {isAffiliate && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-violet-500/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center text-white shrink-0">
                            <UsersRound size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-sm tracking-tight">Panel de Colaborador · {currentUser?.name || "Afiliado"}</h3>
                            <p className="text-xs text-violet-100">Visualizando tu cartera exclusiva de clientes, partidas y cobros asignados.</p>
                        </div>
                    </div>
                    <Button
                        onClick={openCreateModal}
                        size="sm"
                        className="bg-white hover:bg-white/90 text-violet-800 font-semibold rounded-xl text-xs shadow self-end sm:self-center"
                    >
                        <Plus size={14} className="mr-1" />
                        Registrar Cliente
                    </Button>
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-white/80 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ingresos Proyectados</p>
                                <p className="text-2xl font-black text-gray-900 mt-1">
                                    {format(metrics.monthlyRevenue)}
                                    <span className="text-xs font-medium text-gray-400"> /mes</span>
                                </p>
                                <p className="text-xs text-emerald-600 font-bold mt-1">
                                    ≈ {formatDOP(metrics.monthlyRevenue)} <span className="text-gray-400 font-normal">({metrics.activeClients} activas)</span>
                                </p>
                            </div>
                            <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                                <DollarSign className="h-6 w-6" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/80 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cobros al Día</p>
                                <p className="text-2xl font-black text-emerald-700 mt-1">
                                    {metrics.paidCount}
                                    <span className="text-xs font-medium text-gray-400"> / {metrics.activeClients}</span>
                                </p>
                                <p className="text-xs text-gray-500 mt-1">Pagaron en este período</p>
                            </div>
                            <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                                <CheckCircle2 className="h-6 w-6" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className={`backdrop-blur rounded-2xl border-2 shadow-sm transition-all ${
                    metrics.overdueCount > 0 ? "bg-red-50/40 border-red-200" : "bg-white/80 border-gray-100"
                }`}>
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">Vencidos / Por Cobrar</p>
                                <p className="text-2xl font-black text-red-700 mt-1">
                                    {metrics.overdueCount}
                                    <span className="text-xs font-bold text-red-500 ml-2">
                                        ({format(metrics.overdueAmount)})
                                    </span>
                                </p>
                                <p className="text-xs text-red-600/80 font-bold mt-1">
                                    ≈ {formatDOP(metrics.overdueAmount)} en mora
                                </p>
                            </div>
                            <div className="p-3 rounded-2xl bg-red-100 text-red-600 border border-red-200">
                                <AlertTriangle className="h-6 w-6" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className={`backdrop-blur rounded-2xl border-2 shadow-sm transition-all ${
                    metrics.orphanServicesCount > 0 ? "bg-amber-50/40 border-amber-200" : "bg-white/80 border-gray-100"
                }`}>
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Servicios Huérfanos</p>
                                <p className="text-2xl font-black text-amber-800 mt-1">
                                    {metrics.orphanServicesCount}
                                    <span className="text-xs font-medium text-amber-600 ml-1">en VPS</span>
                                </p>
                                <p className="text-xs text-amber-700/80 font-medium mt-1">Sin cliente asignado</p>
                            </div>
                            <div className="p-3 rounded-2xl bg-amber-100 text-amber-700 border border-amber-200">
                                <Layers className="h-6 w-6" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* VIEW MODE: DIRECTORY */}
            {viewMode === "directory" && (
                <div className="space-y-4">
                    {/* Filters & Actions Bar */}
                    <div className="bg-white/70 backdrop-blur p-4 rounded-2xl border-2 border-gray-100 flex flex-col lg:flex-row gap-3 items-center justify-between shadow-sm">
                        {/* Search & Tabs */}
                        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto flex-1">
                            <div className="relative min-w-[220px] flex-1 max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Buscar por cliente, email, teléfono o servicio..."
                                    className="pl-9 rounded-xl border-gray-200 text-xs h-9 bg-white"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            {/* Cycle Selector */}
                            <select
                                value={cycleFilter}
                                onChange={(e) => setCycleFilter(e.target.value as any)}
                                className="h-9 px-3 rounded-xl border border-gray-200 text-xs bg-white text-gray-700 font-medium"
                            >
                                <option value="all">Todos los ciclos</option>
                                <option value="monthly">Mensual</option>
                                <option value="annual">Anual</option>
                            </select>

                            {/* Sort Selector */}
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as any)}
                                className="h-9 px-3 rounded-xl border border-gray-200 text-xs bg-white text-gray-700 font-medium"
                            >
                                <option value="name">Ordenar: Nombre (A-Z)</option>
                                <option value="revenue">Ordenar: Mayor Ingreso</option>
                                <option value="daysLate">Ordenar: Más Días de Mora</option>
                                <option value="paymentDay">Ordenar: Día de Pago</option>
                            </select>

                            {/* Affiliate Selector (Master view) */}
                            {isMaster && (
                                <select
                                    value={affiliateFilter}
                                    onChange={(e) => setAffiliateFilter(e.target.value)}
                                    className="h-9 px-3 rounded-xl border border-violet-200 text-xs bg-violet-50/60 text-violet-900 font-semibold focus:outline-none"
                                >
                                    <option value="all">👥 Todos los afiliados</option>
                                    <option value="unassigned">Sin asignar</option>
                                    {Array.from(new Map(clients.filter(c => c.affiliate).map(c => [c.affiliate!.id, c.affiliate!.name])).entries())
                                        .map(([id, name]) => (
                                            <option key={id} value={id}>👤 {name}</option>
                                        ))}
                                </select>
                            )}
                        </div>

                        {/* Export & Refresh */}
                        <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleExportSummary}
                                className="rounded-xl border-gray-200 gap-1.5 text-xs h-9"
                                title="Copiar resumen para WhatsApp o Telegram"
                            >
                                <Copy size={13} />
                                Copiar Listado
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={fetchData}
                                className="rounded-xl border-gray-200 gap-1 text-xs h-9"
                            >
                                <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
                            </Button>
                        </div>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        <button
                            onClick={() => setFilterTab("all")}
                            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                                filterTab === "all"
                                    ? "bg-violet-600 text-white shadow-sm"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                        >
                            Todos ({clients.length})
                        </button>
                        <button
                            onClick={() => setFilterTab("overdue")}
                            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                                filterTab === "overdue"
                                    ? "bg-red-600 text-white shadow-sm"
                                    : "bg-red-50 text-red-700 hover:bg-red-100"
                            }`}
                        >
                            🔴 Vencidos ({metrics.overdueCount})
                        </button>
                        <button
                            onClick={() => setFilterTab("paid")}
                            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                                filterTab === "paid"
                                    ? "bg-emerald-600 text-white shadow-sm"
                                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            }`}
                        >
                            🟢 Al Día ({metrics.paidCount})
                        </button>
                        <button
                            onClick={() => setFilterTab("pending")}
                            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                                filterTab === "pending"
                                    ? "bg-blue-600 text-white shadow-sm"
                                    : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                            }`}
                        >
                            🟡 Por Cobrar
                        </button>
                        <button
                            onClick={() => setFilterTab("zero_fee")}
                            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                                filterTab === "zero_fee"
                                    ? "bg-orange-600 text-white shadow-sm"
                                    : "bg-orange-50 text-orange-700 hover:bg-orange-100"
                            }`}
                        >
                            🟠 Tarifa $0 ({metrics.zeroFeeCount})
                        </button>
                        <button
                            onClick={() => setFilterTab("no_services")}
                            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                                filterTab === "no_services"
                                    ? "bg-gray-800 text-white shadow-sm"
                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                        >
                            ⚪ Sin Servicios ({metrics.noServicesCount})
                        </button>
                        <button
                            onClick={() => setFilterTab("no_odoo")}
                            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                                filterTab === "no_odoo"
                                    ? "bg-purple-600 text-white shadow-sm"
                                    : "bg-purple-50 text-purple-700 hover:bg-purple-100"
                            }`}
                        >
                            🔵 Sin Odoo ({metrics.noOdooCount})
                        </button>
                        <button
                            onClick={() => setFilterTab("inactive")}
                            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                                filterTab === "inactive"
                                    ? "bg-gray-600 text-white shadow-sm"
                                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                            }`}
                        >
                            Inactivos
                        </button>
                    </div>

                    {/* Batch Actions Bar (when items selected) */}
                    {selectedClientIds.length > 0 && (
                        <div className="bg-violet-900 text-white px-4 py-3 rounded-2xl shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold bg-violet-800 px-2.5 py-1 rounded-lg">
                                    {selectedClientIds.length} seleccionados
                                </span>
                                <p className="text-xs text-violet-200">Acciones masivas para cobranza</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    onClick={handleBatchRemind}
                                    disabled={isBatchReminding}
                                    className="bg-violet-700 hover:bg-violet-600 text-white text-xs rounded-xl gap-1.5"
                                >
                                    <Send size={13} className={isBatchReminding ? "animate-pulse" : ""} />
                                    Recordatorio Masivo Email
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setSelectedClientIds([])}
                                    className="text-violet-300 hover:text-white text-xs"
                                >
                                    Cancelar
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Clients List */}
                    {isLoading ? (
                        <div className="flex justify-center py-16">
                            <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
                        </div>
                    ) : filteredClients.length === 0 ? (
                        <Card className="bg-white/50 border-dashed border-2 p-12 text-center rounded-3xl">
                            <div className="flex flex-col items-center gap-3">
                                <Users className="w-12 h-12 text-gray-300" />
                                <h3 className="text-lg font-bold text-gray-700">No se encontraron clientes</h3>
                                <p className="text-xs text-gray-500 max-w-md">
                                    {searchTerm
                                        ? "No hay resultados para tu búsqueda. Intenta con otro término."
                                        : "Comienza registrando tu primer cliente o asignando servicios desde el Centro de Depuración."}
                                </p>
                                <Button onClick={openCreateModal} className="mt-3 gap-2 rounded-2xl">
                                    <Plus size={16} />
                                    Agregar Cliente
                                </Button>
                            </div>
                        </Card>
                    ) : (
                        <div className="grid gap-3.5">
                            {filteredClients.map((client, index) => {
                                const totalMonthly = client.calculatedCosts?.total ?? client.monthlyFee ?? 0;
                                const isAnnual = client.billingCycle === "annual";
                                const amountUSD = isAnnual ? (client.annualFee || totalMonthly * 12) : totalMonthly;
                                const totalDisplay = `${format(amountUSD)}${isAnnual ? "/año" : "/mes"}`;
                                const dopEquivalent = formatDOP(amountUSD);
                                const usdEquivalent = formatUSD(amountUSD);

                                const isSelected = selectedClientIds.includes(client.id);

                                return (
                                    <motion.div
                                        key={client.id}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: Math.min(index * 0.03, 0.3) }}
                                    >
                                        <Card className={`bg-white/80 backdrop-blur hover:bg-white transition-all border-2 rounded-2xl group ${
                                            client.isOverdue
                                                ? "border-red-100 hover:border-red-300 shadow-sm shadow-red-50"
                                                : isSelected
                                                ? "border-violet-400 bg-violet-50/20"
                                                : "border-gray-100 hover:border-gray-200 shadow-sm"
                                        }`}>
                                            <CardContent className="p-4 sm:p-5">
                                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                                    {/* Left: Info & Checkbox */}
                                                    <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleSelectClient(client.id)}
                                                            className="mt-1 sm:mt-0 rounded border-gray-300 text-violet-600 focus:ring-violet-500 h-4 w-4 cursor-pointer"
                                                        />

                                                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-extrabold text-base shadow-sm shrink-0">
                                                            {client.name.charAt(0).toUpperCase()}
                                                        </div>

                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <Link
                                                                    href={`/clients/${client.id}`}
                                                                    className="font-bold text-gray-900 hover:text-violet-600 transition-colors text-base truncate"
                                                                >
                                                                    {client.name}
                                                                </Link>
                                                                {client.companyName && (
                                                                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                                                                        {client.companyName}
                                                                    </span>
                                                                )}
                                                                {renderStatusBadge(client)}
                                                                {client.odooPartnerId ? (
                                                                    <Badge variant="outline" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                                                                        Odoo #{client.odooPartnerId}
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge variant="outline" className="text-[10px] text-gray-400 bg-gray-50 border-gray-200">
                                                                        Sin Odoo
                                                                    </Badge>
                                                                )}
                                                                {client.affiliate && (
                                                                    <Badge variant="outline" className="text-[10px] text-violet-700 bg-violet-50 border-violet-200 gap-1 font-medium">
                                                                        <UsersRound size={10} />
                                                                        {client.affiliate.name}
                                                                    </Badge>
                                                                )}
                                                            </div>

                                                            {/* Contact & Meta info */}
                                                            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-1">
                                                                {client.phone ? (
                                                                    <a
                                                                        href={`tel:${client.phone}`}
                                                                        className="flex items-center gap-1 hover:text-violet-600 transition-colors"
                                                                    >
                                                                        <Phone size={12} className="text-gray-400" />
                                                                        {client.phone}
                                                                    </a>
                                                                ) : (
                                                                    <span className="text-gray-400 italic">Sin teléfono</span>
                                                                )}

                                                                {client.email ? (
                                                                    <a
                                                                        href={`mailto:${client.email}`}
                                                                        className="flex items-center gap-1 hover:text-violet-600 transition-colors"
                                                                    >
                                                                        <Mail size={12} className="text-gray-400" />
                                                                        {client.email}
                                                                    </a>
                                                                ) : (
                                                                    <span className="text-gray-400 italic">Sin email</span>
                                                                )}

                                                                <span className="flex items-center gap-1 text-gray-400">
                                                                    <Calendar size={12} />
                                                                    {isAnnual
                                                                        ? `Cobro anual: ${client.paymentDay || 1}/${client.paymentMonth || 1}`
                                                                        : `Día de cobro: ${client.paymentDay || 1}`}
                                                                </span>

                                                                {client.lastPaymentDate && (
                                                                    <span className="text-emerald-600">
                                                                        Último pago: {client.lastPaymentDate}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Services chips */}
                                                            {client.services && client.services.length > 0 && (
                                                                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                                                                    {client.services.map(s => (
                                                                        <div
                                                                            key={s.id}
                                                                            className="flex items-center gap-1 bg-violet-50/80 border border-violet-100 px-2 py-0.5 rounded-lg text-[11px] text-violet-900 font-medium"
                                                                            title={`Tipo: ${s.type} | Costo: $${s.monthlyCost}/mes`}
                                                                        >
                                                                            <ServiceIcon type={s.type} name={s.name} size="xs" />
                                                                            <span>{s.name}</span>
                                                                            {s.monthlyCost > 0 && (
                                                                                <span className="text-violet-600 font-bold ml-0.5">
                                                                                    {formatUSD(s.monthlyCost)}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Right: Pricing & Quick Actions */}
                                                    <div className="flex flex-wrap sm:flex-nowrap items-center justify-between lg:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                                                        <div className="text-left sm:text-right">
                                                            <p className="text-lg font-black text-gray-900 leading-tight">
                                                                {totalDisplay}
                                                            </p>
                                                            {mode === "USD" ? (
                                                                <p className="text-[11px] font-bold text-emerald-600">
                                                                    ≈ {dopEquivalent}
                                                                </p>
                                                            ) : mode === "DOP" ? (
                                                                <p className="text-[11px] font-bold text-emerald-600">
                                                                    Base: {usdEquivalent}
                                                                </p>
                                                            ) : null}
                                                            <p className="text-[11px] text-gray-500">
                                                                {client.services?.length || 0} servicio(s) · {client.vpsList?.length || 0} VPS
                                                            </p>
                                                        </div>

                                                        {/* Quick Action Buttons */}
                                                        <div className="flex items-center gap-1.5">
                                                            {/* ⚡ 1-Click Cobro Rápido */}
                                                            <Button
                                                                size="sm"
                                                                onClick={() => openQuickPay(client)}
                                                                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl shadow-sm text-xs gap-1 h-8"
                                                                title="Registrar cobro instantáneo"
                                                            >
                                                                <DollarSign size={13} />
                                                                Cobrar
                                                            </Button>

                                                            {/* 💬 WhatsApp Cobro */}
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => openWhatsApp(client)}
                                                                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl text-xs h-8 px-2.5"
                                                                title="Enviar recordatorio / cobrar por WhatsApp"
                                                            >
                                                                <MessageSquare size={13} />
                                                            </Button>

                                                            {/* ✉️ Email Reminder */}
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={!client.email || sendingReminderId === client.id}
                                                                onClick={() => handleSendEmailReminder(client.id)}
                                                                className="border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-xs h-8 px-2.5"
                                                                title="Enviar recordatorio por Email"
                                                            >
                                                                <Mail size={13} className={sendingReminderId === client.id ? "animate-pulse" : ""} />
                                                            </Button>

                                                            {/* 🛠️ Organizar Servicios */}
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => setOrganizeClient(client)}
                                                                className="border-violet-200 text-violet-700 hover:bg-violet-50 rounded-xl text-xs h-8 px-2.5"
                                                                title="Asignar y organizar servicios de este cliente"
                                                            >
                                                                <Layers size={13} />
                                                            </Button>

                                                            {/* ✏️ Editar */}
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => openEditModal(client)}
                                                                className="text-gray-500 hover:text-gray-900 rounded-xl text-xs h-8 px-2"
                                                                title="Editar cliente"
                                                            >
                                                                <Edit2 size={13} />
                                                            </Button>

                                                            {/* 🔗 Detalles */}
                                                            <Link href={`/clients/${client.id}`}>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="text-gray-500 hover:text-violet-600 rounded-xl text-xs h-8 px-2"
                                                                    title="Ver perfil completo"
                                                                >
                                                                    <ArrowRight size={13} />
                                                                </Button>
                                                            </Link>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* VIEW MODE: CLEANUP & AUDIT CENTER */}
            {viewMode === "cleanup" && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    <div className="bg-gradient-to-r from-violet-900 to-indigo-900 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
                        <div className="relative z-10 max-w-2xl">
                            <div className="inline-flex items-center gap-2 bg-violet-800/80 px-3 py-1 rounded-full text-xs font-semibold text-violet-200 mb-3">
                                <Sparkles size={14} className="text-amber-400" />
                                Auditoría Inteligente de Clientes y Cobranzas
                            </div>
                            <h3 className="text-2xl font-black tracking-tight">Centro de Depuración y Diagnóstico</h3>
                            <p className="text-sm text-violet-200 mt-1">
                                Identifica servicios sin cobrar, clientes con morosidad y recursos huérfanos para regularizar tus ingresos de inmediato.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* 1. ORPHAN SERVICES IN VPS */}
                        <Card className="bg-white/90 backdrop-blur rounded-3xl border-2 border-amber-200 shadow-sm">
                            <CardHeader className="pb-3 border-b border-amber-100">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base font-bold text-amber-900 flex items-center gap-2">
                                        <Layers className="text-amber-600 w-5 h-5" />
                                        Servicios Huérfanos en VPS ({orphanServices.length})
                                    </CardTitle>
                                    <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-xs">
                                        Sin cliente asignado
                                    </Badge>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Servicios detectados en tus VPS que no están vinculados a ningún cliente para cobro.
                                </p>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3 max-h-[420px] overflow-y-auto">
                                {orphanServices.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400">
                                        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                                        <p className="font-semibold text-gray-700 text-sm">¡Todo organizado!</p>
                                        <p className="text-xs text-gray-500">No hay servicios huérfanos sin cliente.</p>
                                    </div>
                                ) : (
                                    orphanServices.map(svc => (
                                        <div
                                            key={svc.id}
                                            className="p-3.5 bg-amber-50/50 rounded-2xl border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                        >
                                            <div className="flex items-center gap-3">
                                                <ServiceIcon type={svc.type} name={svc.name} size="sm" />
                                                <div>
                                                    <p className="font-bold text-gray-900 text-xs sm:text-sm">{svc.name}</p>
                                                    <p className="text-[11px] text-gray-500">
                                                        Tipo: <span className="font-medium text-gray-700">{svc.type}</span>
                                                        {svc.port ? ` · Puerto ${svc.port}` : ""}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Assign Dropdown */}
                                            <div className="flex items-center gap-2">
                                                <select
                                                    defaultValue=""
                                                    onChange={(e) => {
                                                        if (e.target.value) {
                                                            handleAssignOrphanService(svc.id, e.target.value, svc.monthlyCost || 10);
                                                        }
                                                    }}
                                                    className="h-8 px-2.5 rounded-xl border border-amber-300 text-xs bg-white text-gray-800 font-medium"
                                                >
                                                    <option value="" disabled>Asignar a cliente...</option>
                                                    {clients.map(c => (
                                                        <option key={c.id} value={c.id}>
                                                            {c.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>

                        {/* 2. OVERDUE CLIENTS */}
                        <Card className="bg-white/90 backdrop-blur rounded-3xl border-2 border-red-200 shadow-sm">
                            <CardHeader className="pb-3 border-b border-red-100">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base font-bold text-red-900 flex items-center gap-2">
                                        <AlertTriangle className="text-red-600 w-5 h-5" />
                                        Clientes con Cobros Vencidos ({metrics.overdueCount})
                                    </CardTitle>
                                    <span className="text-xs font-extrabold text-red-700 bg-red-100 px-2.5 py-1 rounded-full">
                                        ${metrics.overdueAmount.toFixed(2)} pendiente
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Cuentas que sobrepasaron su día de pago programado.
                                </p>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3 max-h-[420px] overflow-y-auto">
                                {metrics.overdueCount === 0 ? (
                                    <div className="text-center py-8 text-gray-400">
                                        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                                        <p className="font-semibold text-gray-700 text-sm">¡Cero morosidad!</p>
                                        <p className="text-xs text-gray-500">Todos los clientes están al día con sus pagos.</p>
                                    </div>
                                ) : (
                                    clients.filter(c => c.isOverdue || c.billingStatus === "overdue").map(c => (
                                        <div
                                            key={c.id}
                                            className="p-3.5 bg-red-50/50 rounded-2xl border border-red-200 flex items-center justify-between gap-3"
                                        >
                                            <div>
                                                <p className="font-bold text-gray-900 text-xs sm:text-sm">{c.name}</p>
                                                <p className="text-xs text-red-600 font-semibold mt-0.5">
                                                    Monto: ${(c.amountDue || c.monthlyFee || 0).toFixed(2)} · Retraso: {c.daysLate || 1} días
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Button
                                                    size="sm"
                                                    onClick={() => openQuickPay(c)}
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs h-8 px-2.5 gap-1"
                                                >
                                                    <DollarSign size={12} />
                                                    Cobrar
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => openWhatsApp(c)}
                                                    className="border-emerald-300 text-emerald-700 bg-white rounded-xl text-xs h-8 px-2"
                                                >
                                                    <MessageSquare size={13} />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>

                        {/* 3. CLIENTS WITH ZERO TARIFF */}
                        <Card className="bg-white/90 backdrop-blur rounded-3xl border-2 border-orange-200 shadow-sm">
                            <CardHeader className="pb-3 border-b border-orange-100">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base font-bold text-orange-900 flex items-center gap-2">
                                        <Wrench className="text-orange-600 w-5 h-5" />
                                        Clientes con Servicios pero Tarifa $0 ({metrics.zeroFeeCount})
                                    </CardTitle>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Clientes que tienen recursos asignados pero su cuota configurada es $0.
                                </p>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3 max-h-[420px] overflow-y-auto">
                                {metrics.zeroFeeCount === 0 ? (
                                    <div className="text-center py-8 text-gray-400">
                                        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                                        <p className="font-semibold text-gray-700 text-sm">Tarifas configuradas</p>
                                        <p className="text-xs text-gray-500">Todos los clientes activos tienen tarifa asignada.</p>
                                    </div>
                                ) : (
                                    clients.filter(c => {
                                        const total = c.calculatedCosts?.total ?? c.monthlyFee ?? 0;
                                        return total <= 0 && (!c.annualFee || c.annualFee <= 0) && ((c.services?.length ?? 0) > 0 || (c.vpsList?.length ?? 0) > 0);
                                    }).map(c => (
                                        <div
                                            key={c.id}
                                            className="p-3.5 bg-orange-50/50 rounded-2xl border border-orange-200 flex items-center justify-between gap-3"
                                        >
                                            <div>
                                                <p className="font-bold text-gray-900 text-xs sm:text-sm">{c.name}</p>
                                                <p className="text-xs text-gray-500">
                                                    {c.services?.length || 0} servicio(s) · Tarifa actual: <span className="font-bold text-orange-600">$0.00</span>
                                                </p>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => openEditModal(c)}
                                                className="border-orange-300 text-orange-800 bg-white hover:bg-orange-50 rounded-xl text-xs h-8"
                                            >
                                                Fijar Tarifa
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>

                        {/* 4. CLIENTS WITHOUT CONTACT INFO */}
                        <Card className="bg-white/90 backdrop-blur rounded-3xl border-2 border-gray-200 shadow-sm">
                            <CardHeader className="pb-3 border-b border-gray-100">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base font-bold text-gray-800 flex items-center gap-2">
                                        <Phone className="text-gray-600 w-5 h-5" />
                                        Clientes Sin Datos de Contacto ({metrics.noContactCount})
                                    </CardTitle>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Clientes sin teléfono ni email para enviar recordatorios de cobranza.
                                </p>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3 max-h-[420px] overflow-y-auto">
                                {metrics.noContactCount === 0 ? (
                                    <div className="text-center py-8 text-gray-400">
                                        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                                        <p className="font-semibold text-gray-700 text-sm">Directorio completo</p>
                                        <p className="text-xs text-gray-500">Todos los clientes tienen datos de contacto.</p>
                                    </div>
                                ) : (
                                    clients.filter(c => !c.email && !c.phone).map(c => (
                                        <div
                                            key={c.id}
                                            className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between gap-3"
                                        >
                                            <div>
                                                <p className="font-bold text-gray-900 text-xs sm:text-sm">{c.name}</p>
                                                <p className="text-xs text-gray-500">Sin teléfono ni correo electrónico</p>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => openEditModal(c)}
                                                className="border-gray-300 text-gray-700 bg-white hover:bg-gray-100 rounded-xl text-xs h-8"
                                            >
                                                Completar Datos
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* ── MODAL: QUICK PAYMENT ── */}
            <Dialog open={!!quickPayClient} onOpenChange={(open) => !open && setQuickPayClient(null)}>
                <DialogContent className="max-w-md rounded-3xl p-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold text-gray-900">
                            <DollarSign className="w-6 h-6 text-emerald-600" />
                            Registrar Cobro Rápido
                        </DialogTitle>
                        <DialogDescription className="text-xs text-gray-500">
                            Registra el pago de <span className="font-bold text-gray-800">{quickPayClient?.name}</span> para poner al día su cuenta.
                        </DialogDescription>
                    </DialogHeader>

                    {quickPayClient && (() => {
                        const calculatedUSD = quickPayClient.amountDue && quickPayClient.amountDue > 0
                            ? quickPayClient.amountDue
                            : (quickPayClient.calculatedCosts?.total ?? quickPayClient.monthlyFee ?? 0);
                        const calculatedDOP = calculatedUSD * rate;

                        return (
                            <div className="space-y-4 my-2">
                                {/* Summary Card */}
                                <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 space-y-2">
                                    <div className="flex justify-between text-xs text-gray-600">
                                        <span>Ciclo de cobro:</span>
                                        <span className="font-bold capitalize">{quickPayClient.billingCycle || "Mensual"}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-600">
                                        <span>Servicios activos:</span>
                                        <span className="font-bold">{quickPayClient.services?.length || 0} servicio(s)</span>
                                    </div>
                                    <div className="border-t border-emerald-200 pt-2 flex justify-between items-center text-sm font-bold text-emerald-950">
                                        <span>Total Tarifa Base (USD):</span>
                                        <span className="text-lg text-emerald-700">${calculatedUSD.toFixed(2)} USD</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs font-bold text-emerald-800">
                                        <span>Equivalente en Pesos (DOP):</span>
                                        <span className="font-mono text-emerald-800">
                                            RD$ {calculatedDOP.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-gray-400 text-right">Tasa de cambio actual: 1 USD = RD$ {rate.toFixed(2)}</p>
                                </div>

                                {/* Moneda selector */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-700">Moneda del Pago Recibido</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPayCurrency("USD");
                                                setPayAmount(String(calculatedUSD));
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
                                                setPayAmount(String(calculatedDOP.toFixed(2)));
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

                                {/* Payment Amount input */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-semibold text-gray-700">
                                            Monto Cobrado ({payCurrency === "USD" ? "$ USD" : "RD$ DOP"})
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
                                        placeholder="0.00"
                                        className="rounded-xl border-gray-300 font-bold text-base h-11"
                                    />
                                </div>

                                {/* Notes */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-gray-700">Notas / Referencia de Pago</label>
                                    <Input
                                        value={payNotes}
                                        onChange={(e) => setPayNotes(e.target.value)}
                                        placeholder="Ej: Transferencia Zelle / Banco Popular #12345"
                                        className="rounded-xl border-gray-300 text-xs h-10"
                                    />
                                </div>
                            </div>
                        );
                    })()}

                    <DialogFooter className="gap-2 sm:gap-0 mt-4">
                        <Button variant="outline" onClick={() => setQuickPayClient(null)} className="rounded-xl">
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

            {/* ── MODAL: WHATSAPP ASSISTANT ── */}
            <Dialog open={!!whatsAppModalClient} onOpenChange={(open) => !open && setWhatsAppModalClient(null)}>
                <DialogContent className="max-w-lg rounded-3xl p-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold text-gray-900">
                            <MessageSquare className="w-6 h-6 text-emerald-600" />
                            Recordatorio por WhatsApp
                        </DialogTitle>
                        <DialogDescription className="text-xs text-gray-500">
                            Mensaje preformateado para <span className="font-bold text-gray-800">{whatsAppModalClient?.name}</span> ({whatsAppModalClient?.phone || "Sin teléfono"}).
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 my-2">
                        <label className="text-xs font-semibold text-gray-700">Plantilla de Mensaje (Personalizable)</label>
                        <textarea
                            value={whatsAppMessage}
                            onChange={(e) => setWhatsAppMessage(e.target.value)}
                            rows={8}
                            className="w-full px-3.5 py-3 rounded-2xl border-2 border-gray-200 text-xs leading-relaxed font-sans focus:border-emerald-500 focus:outline-none resize-none"
                        />
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setWhatsAppModalClient(null)} className="rounded-xl">
                            Cerrar
                        </Button>
                        <Button
                            onClick={handleSendWhatsApp}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5"
                        >
                            <Send size={14} />
                            Abrir WhatsApp Web / App
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── MODAL: ORGANIZE SERVICES FOR CLIENT ── */}
            <Dialog open={!!organizeClient} onOpenChange={(open) => !open && setOrganizeClient(null)}>
                <DialogContent className="max-w-xl rounded-3xl p-6 max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold text-gray-900">
                            <Layers className="w-6 h-6 text-violet-600" />
                            Organizar Servicios de {organizeClient?.name}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-gray-500">
                            Asocia servicios detectados o desvincula servicios de este cliente.
                        </DialogDescription>
                    </DialogHeader>

                    {organizeClient && (
                        <div className="space-y-5 my-3">
                            {/* Current Services */}
                            <div>
                                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                    Servicios Actualmente Asignados ({organizeClient.services?.length || 0})
                                </h4>
                                {(organizeClient.services?.length || 0) === 0 ? (
                                    <p className="text-xs text-gray-400 italic bg-gray-50 p-3 rounded-xl">
                                        No tiene servicios asociados actualmente.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {organizeClient.services?.map(s => (
                                            <div key={s.id} className="flex items-center justify-between p-3 bg-violet-50/60 rounded-xl border border-violet-100">
                                                <div className="flex items-center gap-2.5">
                                                    <ServiceIcon type={s.type} name={s.name} size="xs" />
                                                    <div>
                                                        <p className="font-bold text-xs text-gray-900">{s.name}</p>
                                                        <p className="text-[10px] text-gray-500">{s.type} · ${s.monthlyCost}/mes</p>
                                                    </div>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleAssignOrphanService(s.id, "", 0)}
                                                    className="text-red-500 hover:text-red-700 text-xs h-7 px-2"
                                                >
                                                    Desvincular
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Available Orphan Services to Add */}
                            {orphanServices.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">
                                        Añadir Servicios Huérfanos Disponibles ({orphanServices.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {orphanServices.map(s => (
                                            <div key={s.id} className="flex items-center justify-between p-3 bg-amber-50/50 rounded-xl border border-amber-200">
                                                <div className="flex items-center gap-2.5">
                                                    <ServiceIcon type={s.type} name={s.name} size="xs" />
                                                    <div>
                                                        <p className="font-bold text-xs text-gray-900">{s.name}</p>
                                                        <p className="text-[10px] text-gray-500">{s.type}</p>
                                                    </div>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleAssignOrphanService(s.id, organizeClient.id, s.monthlyCost || 10)}
                                                    className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-7 rounded-lg"
                                                >
                                                    + Asignar
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button onClick={() => setOrganizeClient(null)} className="rounded-xl">
                            Cerrar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── MODAL: CREATE / EDIT CLIENT ── */}
            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                <DialogContent className="max-w-lg rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold text-gray-900">
                            <Users className="w-5 h-5 text-violet-600" />
                            {editingClient ? "Editar Cliente" : "Nuevo Cliente"}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-gray-500">
                            Configura los datos fiscales y ciclo de cobro del cliente.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-700">Nombre Completo *</label>
                            <Input
                                name="name"
                                placeholder="Ej: Juan Pérez / Empresa XYZ"
                                value={formData.name}
                                onChange={handleInputChange}
                                className="rounded-xl border-gray-300"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                                    <Mail size={12} /> Email
                                </label>
                                <Input
                                    name="email"
                                    type="email"
                                    placeholder="contacto@empresa.com"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    className="rounded-xl border-gray-300 text-xs"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                                    <Phone size={12} /> Teléfono (WhatsApp)
                                </label>
                                <Input
                                    name="phone"
                                    placeholder="+1 809 123 4567"
                                    value={formData.phone}
                                    onChange={handleInputChange}
                                    className="rounded-xl border-gray-300 text-xs"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                                <Building size={12} /> Empresa / Razón Social
                            </label>
                            <Input
                                name="companyName"
                                placeholder="Nombre comercial o empresa (opcional)"
                                value={formData.companyName}
                                onChange={handleInputChange}
                                className="rounded-xl border-gray-300 text-xs"
                            />
                        </div>

                        {/* Billing Cycle & Rates in USD + Real-time DOP Conversion */}
                        <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3.5 rounded-2xl border border-gray-200">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-700">Ciclo de Facturación</label>
                                <select
                                    name="billingCycle"
                                    value={formData.billingCycle}
                                    onChange={handleInputChange}
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs bg-white"
                                >
                                    <option value="monthly">Mensual</option>
                                    <option value="annual">Anual</option>
                                </select>
                            </div>

                            {formData.billingCycle === "monthly" ? (
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-gray-700">Tarifa Base Mensual ($ USD)</label>
                                        {parseFloat(formData.monthlyFee) > 0 && (
                                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                                ≈ {formatDOP(parseFloat(formData.monthlyFee))}
                                            </span>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">$</span>
                                        <Input
                                            name="monthlyFee"
                                            type="number"
                                            step="0.01"
                                            placeholder="0.00"
                                            value={formData.monthlyFee}
                                            onChange={handleInputChange}
                                            className="pl-7 rounded-xl border-gray-300 text-xs font-bold bg-white"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-gray-700">Tarifa Base Anual ($ USD)</label>
                                        {parseFloat(formData.annualFee) > 0 && (
                                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                                ≈ {formatDOP(parseFloat(formData.annualFee))}
                                            </span>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">$</span>
                                        <Input
                                            name="annualFee"
                                            type="number"
                                            step="0.01"
                                            placeholder="0.00"
                                            value={formData.annualFee}
                                            onChange={handleInputChange}
                                            className="pl-7 rounded-xl border-gray-300 text-xs font-bold bg-white"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Real-time Converter Tool inside Form */}
                            <div className="col-span-2 bg-white/90 p-2.5 rounded-xl border border-gray-200 flex flex-wrap items-center justify-between gap-2 shadow-inner">
                                <div className="flex items-center gap-1.5 text-xs text-gray-700 font-medium">
                                    <span>🇩🇴 Calcular desde DOP (RD$):</span>
                                    <input
                                        type="number"
                                        placeholder="Ej: 3000"
                                        className="w-24 h-7 text-xs px-2 border border-gray-300 rounded-lg font-bold"
                                        onChange={(e) => {
                                            const dop = parseFloat(e.target.value);
                                            if (!isNaN(dop) && dop > 0 && rate > 0) {
                                                const usd = (dop / rate).toFixed(2);
                                                if (formData.billingCycle === "monthly") {
                                                    setFormData(prev => ({ ...prev, monthlyFee: usd }));
                                                } else {
                                                    setFormData(prev => ({ ...prev, annualFee: usd }));
                                                }
                                            }
                                        }}
                                    />
                                </div>
                                <span className="text-[11px] text-emerald-700 font-bold font-mono bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                                    1 USD = RD$ {rate.toFixed(2)}
                                </span>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-700">Día de Pago (1 - 28)</label>
                                <Input
                                    name="paymentDay"
                                    type="number"
                                    min="1"
                                    max="28"
                                    placeholder="1"
                                    value={formData.paymentDay}
                                    onChange={handleInputChange}
                                    className="rounded-xl border-gray-300 text-xs bg-white"
                                />
                            </div>

                            {formData.billingCycle === "annual" && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-700">Mes de Cobro (1 - 12)</label>
                                    <Input
                                        name="paymentMonth"
                                        type="number"
                                        min="1"
                                        max="12"
                                        placeholder="1"
                                        value={formData.paymentMonth}
                                        onChange={handleInputChange}
                                        className="rounded-xl border-gray-300 text-xs bg-white"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Active checkbox */}
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="isActive"
                                name="isActive"
                                checked={formData.isActive}
                                onChange={handleInputChange}
                                className="rounded border-gray-300 text-violet-600 focus:ring-violet-500 h-4 w-4"
                            />
                            <label htmlFor="isActive" className="text-xs font-medium text-gray-700">
                                Cliente Activo (habilitado para cobros e informes)
                            </label>
                        </div>

                        {/* Notes */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-700">Notas Adicionales</label>
                            <textarea
                                name="notes"
                                placeholder="Detalles de facturación, condiciones especiales, etc."
                                value={formData.notes}
                                onChange={handleInputChange}
                                rows={2}
                                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:border-violet-400 focus:outline-none resize-none"
                            />
                        </div>

                        <DialogFooter className="gap-2 sm:gap-0 pt-2">
                            <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)} className="rounded-xl">
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl gap-1.5"
                            >
                                {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                {editingClient ? "Guardar Cambios" : "Crear Cliente"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Master Affiliates & Collaborators Modal */}
            {isMaster && (
                <AffiliatesModal
                    isOpen={isAffiliatesModalOpen}
                    onClose={() => setIsAffiliatesModalOpen(false)}
                    clientsList={clients}
                    onClientsUpdated={fetchData}
                />
            )}
        </div>
    );
}
