"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
    UsersRound, Plus, Link2, Copy, Check, MessageSquare, Shield, 
    UserCheck, Trash2, Calendar, DollarSign, ExternalLink, RefreshCw,
    Layers, Search, CheckCircle2, Clock, AlertCircle, X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/ui/toast";
import { affiliates, type Affiliate, type AffiliateInvite, type Client } from "@/lib/api";
import { useCurrency } from "@/lib/currency";

interface AffiliatesModalProps {
    isOpen: boolean;
    onClose: () => void;
    clientsList?: Client[];
    onClientsUpdated?: () => void;
}

type ActiveTab = "affiliates" | "invite" | "history";

export function AffiliatesModal({
    isOpen,
    onClose,
    clientsList = [],
    onClientsUpdated,
}: AffiliatesModalProps) {
    const { format } = useCurrency();
    const { addToast } = useToast();

    const [activeTab, setActiveTab] = useState<ActiveTab>("affiliates");
    const [affiliatesList, setAffiliatesList] = useState<Affiliate[]>([]);
    const [invitesList, setInvitesList] = useState<AffiliateInvite[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Form for new invite
    const [inviteName, setInviteName] = useState("");
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteNote, setInviteNote] = useState("");
    const [inviteDays, setInviteDays] = useState(7);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedInvite, setGeneratedInvite] = useState<{
        inviteUrl: string;
        whatsappMessage: string;
    } | null>(null);
    const [copied, setCopied] = useState(false);

    // Assignment Sub-Modal
    const [assigningAffiliate, setAssigningAffiliate] = useState<Affiliate | null>(null);
    const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
    const [clientSearch, setClientSearch] = useState("");
    const [isSavingAssignment, setIsSavingAssignment] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [affRes, invRes] = await Promise.all([
                affiliates.list(),
                affiliates.listInvites().catch(() => ({ data: [] })),
            ]);
            setAffiliatesList(Array.isArray(affRes.data) ? affRes.data : []);
            setInvitesList(Array.isArray(invRes.data) ? invRes.data : []);
        } catch (err) {
            console.error("Error fetching affiliates:", err);
            addToast("Error al cargar afiliados", "error");
        } finally {
            setIsLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        if (isOpen) {
            fetchData();
        }
    }, [isOpen, fetchData]);

    // Handle Create Invite
    const handleCreateInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsGenerating(true);
        try {
            const res = await affiliates.createInvite({
                name: inviteName.trim() || undefined,
                email: inviteEmail.trim() || undefined,
                note: inviteNote.trim() || undefined,
                daysValid: Number(inviteDays) || 7,
            });

            if (res.success) {
                setGeneratedInvite({
                    inviteUrl: res.inviteUrl,
                    whatsappMessage: res.whatsappMessage,
                });
                addToast("Enlace de invitación generado", "success");
                fetchData();
            }
        } catch (err) {
            addToast(err instanceof Error ? err.message : "Error al generar invitación", "error");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        addToast("Enlace copiado al portapapeles", "success");
        setTimeout(() => setCopied(false), 2000);
    };

    const handleWhatsAppShare = (msg: string) => {
        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
        window.open(url, "_blank");
    };

    const handleToggleStatus = async (affiliate: Affiliate) => {
        try {
            const newStatus = !affiliate.isActive;
            const res = await affiliates.toggleStatus(affiliate.id, newStatus);
            if (res.success) {
                setAffiliatesList(prev => prev.map(a => a.id === affiliate.id ? { ...a, isActive: newStatus } : a));
                addToast(`Afiliado ${newStatus ? "activado" : "desactivado"} exitosamente`, "success");
            }
        } catch (err) {
            addToast("Error al actualizar estado del afiliado", "error");
        }
    };

    const handleRevokeInvite = async (id: string) => {
        try {
            const res = await affiliates.revokeInvite(id);
            if (res.success) {
                setInvitesList(prev => prev.filter(i => i.id !== id));
                addToast("Invitación revocada", "success");
            }
        } catch (err) {
            addToast("Error al revocar invitación", "error");
        }
    };

    // Open Assign Dialog
    const openAssignDialog = (aff: Affiliate) => {
        setAssigningAffiliate(aff);
        // Pre-select clients that currently belong to this affiliate
        const currentAssigned = clientsList
            .filter(c => c.affiliateId === aff.id)
            .map(c => c.id);
        setSelectedClientIds(currentAssigned);
        setClientSearch("");
    };

    const handleSaveAssignment = async () => {
        if (!assigningAffiliate) return;
        setIsSavingAssignment(true);
        try {
            // First unassign clients that were removed
            const currentlyAssigned = clientsList
                .filter(c => c.affiliateId === assigningAffiliate.id)
                .map(c => c.id);
            const toUnassign = currentlyAssigned.filter(id => !selectedClientIds.includes(id));
            if (toUnassign.length > 0) {
                await affiliates.assignClients(assigningAffiliate.id, toUnassign, "unassign");
            }

            // Assign newly selected clients
            if (selectedClientIds.length > 0) {
                await affiliates.assignClients(assigningAffiliate.id, selectedClientIds, "assign");
            }

            addToast("Asignación de clientes actualizada", "success");
            setAssigningAffiliate(null);
            fetchData();
            if (onClientsUpdated) onClientsUpdated();
        } catch (err) {
            addToast("Error al guardar asignación", "error");
        } finally {
            setIsSavingAssignment(false);
        }
    };

    // Overall portfolio KPIs
    const kpis = useMemo(() => {
        const totalAffiliates = affiliatesList.length;
        const totalManagedClients = affiliatesList.reduce((acc, a) => acc + a.clientCount, 0);
        const totalPortfolioRevenue = affiliatesList.reduce((acc, a) => acc + a.monthlyRevenue, 0);
        return { totalAffiliates, totalManagedClients, totalPortfolioRevenue };
    }, [affiliatesList]);

    const filteredClientsForAssign = useMemo(() => {
        if (!clientSearch) return clientsList;
        const q = clientSearch.toLowerCase();
        return clientsList.filter(c => 
            c.name.toLowerCase().includes(q) || 
            (c.companyName && c.companyName.toLowerCase().includes(q))
        );
    }, [clientsList, clientSearch]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 rounded-3xl border-0 shadow-2xl bg-white/95 backdrop-blur-2xl">
                {/* Header with gradient badge */}
                <div className="p-6 pb-4 border-b border-gray-100 bg-gradient-to-r from-violet-50/70 via-white to-indigo-50/70">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
                                <UsersRound size={24} />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold text-gray-900 tracking-tight">
                                    Afiliados y Colaboradores
                                </DialogTitle>
                                <DialogDescription className="text-xs text-gray-500 mt-0.5">
                                    Genera enlaces de registro, asigna carteras de clientes y supervisa el rendimiento como Master.
                                </DialogDescription>
                            </div>
                        </div>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={fetchData}
                            className="rounded-xl text-gray-500 hover:text-gray-800"
                        >
                            <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
                        </Button>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex gap-2 mt-5 border-b border-gray-100">
                        <button
                            type="button"
                            onClick={() => setActiveTab("affiliates")}
                            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
                                activeTab === "affiliates"
                                    ? "border-violet-600 text-violet-700"
                                    : "border-transparent text-gray-500 hover:text-gray-800"
                            }`}
                        >
                            <UserCheck size={16} />
                            Afiliados Activos ({affiliatesList.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab("invite")}
                            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
                                activeTab === "invite"
                                    ? "border-violet-600 text-violet-700"
                                    : "border-transparent text-gray-500 hover:text-gray-800"
                            }`}
                        >
                            <Link2 size={16} />
                            Generar Link de Invitación
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab("history")}
                            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
                                activeTab === "history"
                                    ? "border-violet-600 text-violet-700"
                                    : "border-transparent text-gray-500 hover:text-gray-800"
                            }`}
                        >
                            <Clock size={16} />
                            Historial de Enlaces ({invitesList.length})
                        </button>
                    </div>
                </div>

                <div className="p-6 pt-4">
                    {/* TAB 1: AFILIADOS ACTIVOS */}
                    {activeTab === "affiliates" && (
                        <div className="space-y-5">
                            {/* KPI Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="p-3.5 rounded-2xl bg-violet-50/70 border border-violet-100/80 flex items-center gap-3">
                                    <div className="p-2.5 rounded-xl bg-violet-600 text-white">
                                        <UsersRound size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-medium text-violet-600 uppercase tracking-wider">Afiliados</p>
                                        <p className="text-xl font-bold text-violet-950">{kpis.totalAffiliates}</p>
                                    </div>
                                </div>
                                <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-100/80 flex items-center gap-3">
                                    <div className="p-2.5 rounded-xl bg-indigo-600 text-white">
                                        <Layers size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-medium text-indigo-600 uppercase tracking-wider">Clientes Asignados</p>
                                        <p className="text-xl font-bold text-indigo-950">{kpis.totalManagedClients}</p>
                                    </div>
                                </div>
                                <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100/80 flex items-center gap-3">
                                    <div className="p-2.5 rounded-xl bg-emerald-600 text-white">
                                        <DollarSign size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-medium text-emerald-600 uppercase tracking-wider">Cartera Mensual</p>
                                        <p className="text-xl font-bold text-emerald-950">{format(kpis.totalPortfolioRevenue)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* List of Affiliates */}
                            {affiliatesList.length === 0 ? (
                                <div className="text-center py-12 px-4 rounded-2xl border-2 border-dashed border-gray-200">
                                    <div className="mx-auto w-12 h-12 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center mb-3">
                                        <UsersRound size={24} />
                                    </div>
                                    <h4 className="text-sm font-bold text-gray-900">Aún no hay afiliados registrados</h4>
                                    <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-4">
                                        Genera un enlace de invitación para compartirlo por WhatsApp o correo y permitir que tus colaboradores se unan.
                                    </p>
                                    <Button
                                        onClick={() => setActiveTab("invite")}
                                        className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs"
                                    >
                                        <Link2 size={14} className="mr-1.5" />
                                        Crear primer enlace de invitación
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {affiliatesList.map((aff) => (
                                        <div
                                            key={aff.id}
                                            className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                                                aff.isActive 
                                                    ? "bg-white border-gray-200/80 hover:shadow-md hover:border-violet-200" 
                                                    : "bg-gray-50 border-gray-200 opacity-60"
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-500 to-purple-600 text-white font-bold flex items-center justify-center text-sm shadow-sm shrink-0">
                                                    {aff.name.slice(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="text-sm font-bold text-gray-900">{aff.name}</h4>
                                                        <Badge variant={aff.isActive ? "success" : "secondary"} className="text-[10px] px-2 py-0">
                                                            {aff.isActive ? "Activo" : "Inactivo"}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-xs text-gray-500">{aff.email} {aff.phone && `· ${aff.phone}`}</p>
                                                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                                                        <span className="inline-flex items-center gap-1 font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-md">
                                                            <Layers size={12} />
                                                            {aff.clientCount} clientes ({aff.activeClients} activos)
                                                        </span>
                                                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                                                            <DollarSign size={12} />
                                                            {format(aff.monthlyRevenue)} / mes
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 self-end sm:self-center">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => openAssignDialog(aff)}
                                                    className="rounded-xl border-violet-200 text-violet-700 hover:bg-violet-50 text-xs h-9"
                                                >
                                                    <Layers size={14} className="mr-1.5" />
                                                    Asignar Clientes
                                                </Button>

                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleToggleStatus(aff)}
                                                    className={`rounded-xl text-xs h-9 ${
                                                        aff.isActive ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"
                                                    }`}
                                                >
                                                    {aff.isActive ? "Desactivar" : "Activar"}
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2: GENERAR INVITACIÓN */}
                    {activeTab === "invite" && (
                        <div className="max-w-xl mx-auto space-y-6">
                            <form onSubmit={handleCreateInvite} className="space-y-4">
                                <div className="p-4 rounded-2xl bg-violet-50/50 border border-violet-100 text-xs text-violet-800 space-y-1">
                                    <p className="font-semibold flex items-center gap-1.5">
                                        <Shield size={14} />
                                        Enlace con Registro Autónomo
                                    </p>
                                    <p className="text-gray-600">
                                        Genera un link único que podrás enviar por WhatsApp o correo. El afiliado se registrará con sus datos y solo tendrá acceso a los clientes que tú le asignes o los que él mismo registre.
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-gray-700 ml-1">Nombre o referencia del colaborador (opcional)</label>
                                    <Input
                                        placeholder="Ej. Juan Pérez (Ventas Santo Domingo)"
                                        value={inviteName}
                                        onChange={(e) => setInviteName(e.target.value)}
                                        className="h-10 rounded-xl text-sm"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-gray-700 ml-1">Correo electrónico previsto (opcional)</label>
                                        <Input
                                            type="email"
                                            placeholder="juan@ejemplo.com"
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                            className="h-10 rounded-xl text-sm"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-gray-700 ml-1">Días de validez</label>
                                        <select
                                            value={inviteDays}
                                            onChange={(e) => setInviteDays(Number(e.target.value))}
                                            className="w-full h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        >
                                            <option value={3}>3 días</option>
                                            <option value={7}>7 días (recomendado)</option>
                                            <option value={15}>15 días</option>
                                            <option value={30}>30 días</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-gray-700 ml-1">Nota interna para el equipo (opcional)</label>
                                    <Input
                                        placeholder="Ej. Afiliado comisiones 15% cartera nueva"
                                        value={inviteNote}
                                        onChange={(e) => setInviteNote(e.target.value)}
                                        className="h-10 rounded-xl text-sm"
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    disabled={isGenerating}
                                    className="w-full h-11 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl shadow-md shadow-violet-500/20 font-semibold text-xs flex items-center justify-center gap-2"
                                >
                                    <Link2 size={16} />
                                    {isGenerating ? "Generando enlace..." : "Generar Enlace Seguro de Registro"}
                                </Button>
                            </form>

                            {/* Result card if created */}
                            <AnimatePresence>
                                {generatedInvite && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50/90 to-teal-50/70 border border-emerald-200 shadow-md space-y-4"
                                    >
                                        <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                                            <CheckCircle2 size={18} className="text-emerald-600" />
                                            ¡Enlace generado exitosamente!
                                        </div>

                                        <div className="p-3 bg-white rounded-xl border border-emerald-200/80 font-mono text-xs text-gray-700 break-all select-all flex items-center justify-between gap-2">
                                            <span>{generatedInvite.inviteUrl}</span>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleCopy(generatedInvite.inviteUrl)}
                                                className="shrink-0 h-8 px-2 text-emerald-700 hover:bg-emerald-50 rounded-lg"
                                            >
                                                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                                            </Button>
                                        </div>

                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <Button
                                                onClick={() => handleCopy(generatedInvite.inviteUrl)}
                                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs h-10 shadow-sm"
                                            >
                                                <Copy size={14} className="mr-1.5" />
                                                Copiar Enlace
                                            </Button>

                                            <Button
                                                onClick={() => handleWhatsAppShare(generatedInvite.whatsappMessage)}
                                                className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs h-10 shadow-sm"
                                            >
                                                <MessageSquare size={14} className="mr-1.5" />
                                                Enviar por WhatsApp
                                            </Button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* TAB 3: HISTORIAL DE ENLACES */}
                    {activeTab === "history" && (
                        <div className="space-y-3">
                            {invitesList.length === 0 ? (
                                <p className="text-center py-10 text-xs text-gray-500">
                                    No hay invitaciones registradas en el sistema.
                                </p>
                            ) : (
                                invitesList.map((inv) => {
                                    const isExpired = new Date(inv.expiresAt) < new Date();
                                    return (
                                        <div
                                            key={inv.id}
                                            className="p-3.5 rounded-xl border border-gray-100 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                                        >
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-gray-900">
                                                        {inv.name || "Sin nombre específico"}
                                                    </span>
                                                    {inv.used ? (
                                                        <Badge variant="success" className="text-[10px] px-2 py-0">
                                                            Utilizado por {inv.usedBy?.name || "Afiliado"}
                                                        </Badge>
                                                    ) : isExpired ? (
                                                        <Badge variant="destructive" className="text-[10px] px-2 py-0">
                                                            Expirado
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="secondary" className="text-[10px] px-2 py-0 bg-amber-50 text-amber-700 border-amber-200">
                                                            Pendiente de registro
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-gray-500 font-mono text-[11px] truncate max-w-sm">
                                                    Token: {inv.token} {inv.note && `· ${inv.note}`}
                                                </p>
                                                <p className="text-gray-400 text-[10px]">
                                                    Creado: {new Date(inv.createdAt).toLocaleDateString("es-ES")} · Expira: {new Date(inv.expiresAt).toLocaleDateString("es-ES")}
                                                </p>
                                            </div>

                                            {!inv.used && !isExpired && (
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => {
                                                            const url = `${window.location.origin}/afiliados/registro?token=${inv.token}`;
                                                            handleCopy(url);
                                                        }}
                                                        className="h-8 px-2.5 text-[11px] rounded-lg border-gray-200"
                                                    >
                                                        <Copy size={12} className="mr-1" />
                                                        Copiar
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleRevokeInvite(inv.id)}
                                                        className="h-8 px-2.5 text-[11px] text-red-600 hover:bg-red-50 rounded-lg"
                                                    >
                                                        <Trash2 size={12} className="mr-1" />
                                                        Revocar
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>

                {/* Sub-Dialog for Client Assignment */}
                <Dialog open={!!assigningAffiliate} onOpenChange={(open) => { if (!open) setAssigningAffiliate(null); }}>
                    <DialogContent className="max-w-md p-6 rounded-3xl bg-white shadow-2xl">
                        <DialogHeader>
                            <DialogTitle className="text-base font-bold text-gray-900">
                                Asignar Clientes a {assigningAffiliate?.name}
                            </DialogTitle>
                            <DialogDescription className="text-xs text-gray-500">
                                Selecciona los clientes que estarán en la cartera visible y editable para este colaborador.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="mt-4 space-y-3">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <Input
                                    placeholder="Buscar cliente por nombre..."
                                    value={clientSearch}
                                    onChange={(e) => setClientSearch(e.target.value)}
                                    className="pl-9 h-9 text-xs rounded-xl"
                                />
                            </div>

                            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 border border-gray-100 rounded-xl p-2 bg-gray-50/50">
                                {filteredClientsForAssign.length === 0 ? (
                                    <p className="text-center py-6 text-xs text-gray-400">No se encontraron clientes</p>
                                ) : (
                                    filteredClientsForAssign.map((cl) => {
                                        const isSelected = selectedClientIds.includes(cl.id);
                                        const isOtherAffiliate = cl.affiliateId && cl.affiliateId !== assigningAffiliate?.id;

                                        return (
                                            <label
                                                key={cl.id}
                                                className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                                                    isSelected 
                                                        ? "bg-violet-50 border-violet-200 text-violet-950 font-medium" 
                                                        : "bg-white border-gray-100 text-gray-700 hover:bg-gray-50"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedClientIds(prev => [...prev, cl.id]);
                                                            } else {
                                                                setSelectedClientIds(prev => prev.filter(id => id !== cl.id));
                                                            }
                                                        }}
                                                        className="rounded text-violet-600 focus:ring-violet-500 h-4 w-4"
                                                    />
                                                    <div className="truncate">
                                                        <p className="truncate">{cl.name}</p>
                                                        {cl.companyName && (
                                                            <p className="text-[10px] text-gray-400 truncate">{cl.companyName}</p>
                                                        )}
                                                    </div>
                                                </div>

                                                {isOtherAffiliate && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                                                        Otro afiliado
                                                    </span>
                                                )}
                                            </label>
                                        );
                                    })
                                )}
                            </div>

                            <div className="pt-2 flex justify-between items-center text-xs text-gray-500">
                                <span>{selectedClientIds.length} clientes seleccionados</span>
                                <div className="flex gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setAssigningAffiliate(null)}
                                        className="rounded-xl text-xs"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleSaveAssignment}
                                        disabled={isSavingAssignment}
                                        className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs px-4"
                                    >
                                        {isSavingAssignment ? "Guardando..." : "Guardar Cartera"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </DialogContent>
        </Dialog>
    );
}
