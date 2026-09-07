"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
    UsersRound, Plus, Link2, Copy, Check, MessageSquare, Shield, 
    UserCheck, Trash2, Calendar, DollarSign, ExternalLink, RefreshCw,
    Layers, Search, CheckCircle2, Clock, AlertCircle, Sparkles, UserPlus,
    Building2, Phone, Mail, ArrowRight, ShieldCheck, UserX, ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/ui/toast";
import { affiliates, auth, clients as clientsApi, type Affiliate, type AffiliateInvite, type Client, type User } from "@/lib/api";
import { useCurrency } from "@/lib/currency";
import { AffiliatesModal } from "@/components/AffiliatesModal";

export default function AfiliadosPage() {
    const { format } = useCurrency();
    const { addToast } = useToast();

    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [affiliatesList, setAffiliatesList] = useState<Affiliate[]>([]);
    const [invitesList, setInvitesList] = useState<AffiliateInvite[]>([]);
    const [allClients, setAllClients] = useState<Client[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Modal state for direct actions
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Quick Invite Form
    const [invitePhone, setInvitePhone] = useState("");
    const [inviteName, setInviteName] = useState("");
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteNote, setInviteNote] = useState("");
    const [inviteDays, setInviteDays] = useState(7);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedInvite, setGeneratedInvite] = useState<{
        inviteUrl: string;
        whatsappMessage: string;
        whatsappUrl?: string;
        phone?: string;
    } | null>(null);
    const [copied, setCopied] = useState(false);

    // Filter & Search
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<"collaborators" | "invites">("collaborators");

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [meRes, affRes, invRes, clientsRes] = await Promise.all([
                auth.me().catch(() => ({ success: false, user: null })),
                affiliates.list().catch(() => ({ success: false, data: [] })),
                affiliates.listInvites().catch(() => ({ success: false, data: [] })),
                clientsApi.list().catch(() => ({ success: false, data: [] })),
            ]);

            if (meRes.success && meRes.user) setCurrentUser(meRes.user);
            setAffiliatesList(Array.isArray(affRes.data) ? affRes.data : []);
            setInvitesList(Array.isArray(invRes.data) ? invRes.data : []);
            setAllClients(Array.isArray(clientsRes.data) ? clientsRes.data : []);
        } catch (err) {
            console.error("Error fetching data:", err);
            addToast("Error al sincronizar colaboradores", "error");
        } finally {
            setIsLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const isMaster = !currentUser || currentUser.role === "superadmin" || currentUser.role === "admin";
    const isAffiliate = currentUser?.role === "affiliate" || currentUser?.role === "collaborator";

    // Handle Quick Invite
    const handleCreateInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!invitePhone.trim()) {
            addToast("Por favor introduce el número de WhatsApp", "error");
            return;
        }
        setIsGenerating(true);
        try {
            const res = await affiliates.createInvite({
                phone: invitePhone.trim() || undefined,
                name: inviteName.trim() || undefined,
                email: inviteEmail.trim() || undefined,
                note: inviteNote.trim() || undefined,
                daysValid: Number(inviteDays) || 7,
            });

            if (res.success) {
                setGeneratedInvite({
                    inviteUrl: res.inviteUrl,
                    whatsappMessage: res.whatsappMessage,
                    whatsappUrl: res.whatsappUrl,
                    phone: invitePhone.trim(),
                });
                addToast("Enlace de invitación generado con éxito", "success");
                setInvitePhone("");
                setInviteName("");
                setInviteEmail("");
                setInviteNote("");
                fetchData();
            }
        } catch (err) {
            addToast(err instanceof Error ? err.message : "Error al generar invitación", "error");
        } finally {
            setIsGenerating(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        addToast("Enlace copiado al portapapeles", "success");
        setTimeout(() => setCopied(false), 2000);
    };

    const handleRevokeInvite = async (id: string) => {
        if (!confirm("¿Deseas revocar este enlace de invitación? Ya no podrá ser usado para registrarse.")) return;
        try {
            const res = await affiliates.revokeInvite(id);
            if (res.success) {
                addToast("Invitación revocada", "success");
                fetchData();
            }
        } catch {
            addToast("Error al revocar invitación", "error");
        }
    };

    const handleToggleStatus = async (id: string, currentStatus: boolean) => {
        try {
            const res = await affiliates.toggleStatus(id, !currentStatus);
            if (res.success) {
                addToast(currentStatus ? "Colaborador pausado" : "Colaborador activado", "success");
                fetchData();
            }
        } catch {
            addToast("Error al actualizar estado", "error");
        }
    };

    // Calculate totals
    const totalAssignedClients = useMemo(() => {
        return affiliatesList.reduce((sum, a) => sum + (a.clientsCount || 0), 0);
    }, [affiliatesList]);

    const totalDelegatedMonthly = useMemo(() => {
        return affiliatesList.reduce((sum, a) => sum + (a.totalMonthlyRevenue || 0), 0);
    }, [affiliatesList]);

    const filteredAffiliates = useMemo(() => {
        if (!searchTerm.trim()) return affiliatesList;
        const q = searchTerm.toLowerCase();
        return affiliatesList.filter(a => 
            a.name.toLowerCase().includes(q) || 
            a.email.toLowerCase().includes(q) ||
            (a.phone && a.phone.includes(q))
        );
    }, [affiliatesList, searchTerm]);

    const activeInvites = useMemo(() => {
        return invitesList.filter(inv => !inv.used && new Date(inv.expiresAt) > new Date());
    }, [invitesList]);

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
            {/* Top Header Banner */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-violet-900/40 via-purple-900/30 to-indigo-900/40 p-6 rounded-3xl border border-violet-500/20 backdrop-blur-xl shadow-xl shadow-violet-950/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
                
                <div className="space-y-1 relative z-10">
                    <div className="flex items-center gap-2">
                        <span className="px-3 py-0.5 rounded-full text-[11px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                            {isAffiliate ? "Espacio de Colaborador" : "Gestión de Socios & Afiliados"}
                        </span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                        <UsersRound className="w-8 h-8 text-violet-400" />
                        {isAffiliate ? "Mi Cartera Asignada" : "Centro de Colaboradores"}
                    </h1>
                    <p className="text-sm text-slate-300 max-w-2xl">
                        {isAffiliate 
                            ? "Consulta tus clientes asignados, supervisa el estado de sus pagos y gestiona nuevas partidas."
                            : "Invita colaboradores con enlaces seguros, delega carteras de clientes y supervisa la cobranza descentralizada."}
                    </p>
                </div>

                <div className="flex items-center gap-3 relative z-10">
                    <Button
                        variant="outline"
                        onClick={fetchData}
                        disabled={isLoading}
                        className="bg-white/10 hover:bg-white/15 border-white/10 text-white rounded-2xl h-11 px-4 text-xs font-medium"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                        Sincronizar
                    </Button>

                    {isMaster && (
                        <Button
                            onClick={() => setIsModalOpen(true)}
                            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-2xl h-11 px-5 text-xs font-semibold shadow-lg shadow-violet-600/30"
                        >
                            <UserPlus className="w-4 h-4 mr-2" />
                            Nuevo Colaborador
                        </Button>
                    )}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-slate-800/80 bg-slate-900/60 backdrop-blur-md rounded-2xl shadow-sm">
                    <CardContent className="p-5 flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-xs font-medium text-slate-400">Total Colaboradores</p>
                            <h3 className="text-2xl font-bold text-white tracking-tight">{affiliatesList.length}</h3>
                            <p className="text-[11px] text-emerald-400 font-medium">Activos en plataforma</p>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                            <UsersRound className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-800/80 bg-slate-900/60 backdrop-blur-md rounded-2xl shadow-sm">
                    <CardContent className="p-5 flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-xs font-medium text-slate-400">Clientes Delegados</p>
                            <h3 className="text-2xl font-bold text-white tracking-tight">{totalAssignedClients}</h3>
                            <p className="text-[11px] text-slate-400">De {allClients.length} clientes totales</p>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                            <Building2 className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-800/80 bg-slate-900/60 backdrop-blur-md rounded-2xl shadow-sm">
                    <CardContent className="p-5 flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-xs font-medium text-slate-400">Cartera Delegada</p>
                            <h3 className="text-2xl font-bold text-emerald-400 tracking-tight">{format(totalDelegatedMonthly)}</h3>
                            <p className="text-[11px] text-slate-400">Facturación recurrente mensual</p>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                            <DollarSign className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-800/80 bg-slate-900/60 backdrop-blur-md rounded-2xl shadow-sm">
                    <CardContent className="p-5 flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-xs font-medium text-slate-400">Invitaciones Activas</p>
                            <h3 className="text-2xl font-bold text-amber-400 tracking-tight">{activeInvites.length}</h3>
                            <p className="text-[11px] text-slate-400">Esperando registro</p>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                            <Clock className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* If Master: Show Quick Invite Section & Directory */}
            {isMaster && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Quick Invitation Generator Card */}
                    <Card className="border-slate-800/80 bg-slate-900/60 backdrop-blur-md rounded-3xl lg:col-span-1 shadow-sm">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-base text-white flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-violet-400" />
                                Generar Enlace de Invitación
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-400">
                                Crea un enlace con token seguro para que tu colaborador se registre directamente.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleCreateInvite} className="space-y-4">
                                <div>
                                    <label className="text-xs font-semibold text-violet-300 block mb-1.5 flex items-center gap-1.5">
                                        <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                                        WhatsApp del Colaborador
                                    </label>
                                    <Input
                                        type="tel"
                                        placeholder="Ej: 809 123 4567 o +1 829 555 1234"
                                        value={invitePhone}
                                        onChange={(e) => setInvitePhone(e.target.value)}
                                        className="bg-slate-950/80 border-violet-500/40 focus:border-violet-400 text-white rounded-xl text-xs h-10 placeholder:text-slate-500"
                                        required
                                        autoFocus
                                    />
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        Solo con el número se genera el enlace. El colaborador completará sus datos al registrarse.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-1">
                                    <div>
                                        <label className="text-xs font-medium text-slate-400 block mb-1.5">Nombre (Opcional)</label>
                                        <Input
                                            placeholder="Ej: Carlos Gómez"
                                            value={inviteName}
                                            onChange={(e) => setInviteName(e.target.value)}
                                            className="bg-slate-950/60 border-slate-800 text-white rounded-xl text-xs h-10 placeholder:text-slate-600"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-400 block mb-1.5">Correo (Opcional)</label>
                                        <Input
                                            type="email"
                                            placeholder="carlos@ejemplo.com"
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                            className="bg-slate-950/60 border-slate-800 text-white rounded-xl text-xs h-10 placeholder:text-slate-600"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-slate-300 block mb-1.5">Validez (Días)</label>
                                        <select
                                            value={inviteDays}
                                            onChange={(e) => setInviteDays(Number(e.target.value))}
                                            className="w-full bg-slate-950/60 border border-slate-800 text-white rounded-xl text-xs h-10 px-3 focus:outline-none focus:border-violet-500"
                                        >
                                            <option value={3}>3 días</option>
                                            <option value={7}>7 días</option>
                                            <option value={15}>15 días</option>
                                            <option value={30}>30 días</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-300 block mb-1.5">Nota / Cartera</label>
                                        <Input
                                            placeholder="Zona Norte, etc."
                                            value={inviteNote}
                                            onChange={(e) => setInviteNote(e.target.value)}
                                            className="bg-slate-950/60 border-slate-800 text-white rounded-xl text-xs h-10"
                                        />
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={isGenerating || !invitePhone.trim()}
                                    className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold h-10 shadow-md shadow-violet-600/20"
                                >
                                    {isGenerating ? "Generando..." : "Generar Invitación"}
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </form>

                            {/* Generated Link Box */}
                            {generatedInvite && (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-4 p-3.5 rounded-2xl bg-violet-500/10 border border-violet-500/20 space-y-3"
                                >
                                    <div className="flex items-center justify-between text-xs font-semibold text-violet-300">
                                        <span>¡Enlace listo para enviar!</span>
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                    </div>
                                    <div className="flex items-center gap-2 bg-slate-950/80 p-2 rounded-xl border border-violet-500/20">
                                        <input
                                            readOnly
                                            value={generatedInvite.inviteUrl}
                                            className="bg-transparent text-[11px] text-slate-200 w-full outline-none font-mono"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => copyToClipboard(generatedInvite.inviteUrl)}
                                            className="p-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                                            title="Copiar enlace"
                                        >
                                            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>

                                    <a
                                        href={
                                            generatedInvite.whatsappUrl ||
                                            (generatedInvite.phone
                                                ? `https://wa.me/${generatedInvite.phone.replace(/\D/g, "")}?text=${encodeURIComponent(generatedInvite.whatsappMessage)}`
                                                : `https://wa.me/?text=${encodeURIComponent(generatedInvite.whatsappMessage)}`)
                                        }
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium transition-colors shadow-sm"
                                    >
                                        <MessageSquare className="w-3.5 h-3.5" />
                                        Enviar por WhatsApp
                                    </a>
                                </motion.div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Right: Collaborators Directory & Invites Tabs */}
                    <div className="lg:col-span-2 space-y-4">
                        {/* Tab Switcher & Search */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                            <div className="flex items-center gap-2 p-1 bg-slate-900/80 rounded-2xl border border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("collaborators")}
                                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                                        activeTab === "collaborators"
                                            ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                                            : "text-slate-400 hover:text-white"
                                    }`}
                                >
                                    Directorio ({affiliatesList.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("invites")}
                                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                                        activeTab === "invites"
                                            ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                                            : "text-slate-400 hover:text-white"
                                    }`}
                                >
                                    Invitaciones Pendientes ({activeInvites.length})
                                </button>
                            </div>

                            {activeTab === "collaborators" && (
                                <div className="relative w-full sm:w-64">
                                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <Input
                                        placeholder="Buscar colaborador..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-9 bg-slate-900/60 border-slate-800 text-white rounded-xl text-xs h-10 w-full"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Collaborators List */}
                        {activeTab === "collaborators" && (
                            <div className="space-y-3">
                                {filteredAffiliates.length === 0 ? (
                                    <div className="text-center py-12 bg-slate-900/40 rounded-3xl border border-dashed border-slate-800 text-slate-400 space-y-3">
                                        <UsersRound className="w-12 h-12 mx-auto text-slate-600" />
                                        <p className="text-sm font-medium">No se encontraron colaboradores</p>
                                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                                            Genera un enlace de invitación para que tu primer colaborador se registre y acceda a su cartera.
                                        </p>
                                    </div>
                                ) : (
                                    filteredAffiliates.map((aff) => (
                                        <Card key={aff.id} className="border-slate-800/80 bg-slate-900/60 hover:border-violet-500/30 transition-all rounded-2xl overflow-hidden shadow-sm">
                                            <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="flex items-center gap-3.5 min-w-0">
                                                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-md shadow-violet-600/20">
                                                        {aff.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0 space-y-0.5">
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="text-sm font-semibold text-white truncate">{aff.name}</h4>
                                                            <Badge variant={aff.isActive ? "default" : "secondary"} className={`text-[10px] px-2 py-0.5 ${aff.isActive ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-800 text-slate-400"}`}>
                                                                {aff.isActive ? "Activo" : "Inactivo"}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs text-slate-400 truncate flex items-center gap-1.5">
                                                            <Mail className="w-3 h-3 text-slate-500" />
                                                            {aff.email}
                                                            {aff.phone && (
                                                                <>
                                                                    <span>•</span>
                                                                    <Phone className="w-3 h-3 text-slate-500" />
                                                                    {aff.phone}
                                                                </>
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between sm:justify-end gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
                                                    <div className="text-left sm:text-right space-y-0.5">
                                                        <p className="text-[11px] text-slate-400">Clientes Asignados</p>
                                                        <div className="flex items-center sm:justify-end gap-1.5">
                                                            <span className="text-sm font-bold text-white">{aff.clientsCount || 0}</span>
                                                            <span className="text-xs text-emerald-400 font-semibold">({format(aff.totalMonthlyRevenue || 0)})</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => setIsModalOpen(true)}
                                                            className="bg-slate-800/80 hover:bg-violet-600 hover:text-white border-slate-700 text-xs rounded-xl h-9 px-3"
                                                        >
                                                            Gestionar
                                                        </Button>

                                                        {aff.phone && (
                                                            <a
                                                                href={`https://wa.me/${aff.phone.replace(/[^0-9]/g, "")}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="w-9 h-9 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center transition-colors"
                                                                title="Contactar por WhatsApp"
                                                            >
                                                                <MessageSquare className="w-4 h-4" />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))
                                )}
                            </div>
                        )}

                        {/* Pending Invites List */}
                        {activeTab === "invites" && (
                            <div className="space-y-3">
                                {activeInvites.length === 0 ? (
                                    <div className="text-center py-12 bg-slate-900/40 rounded-3xl border border-dashed border-slate-800 text-slate-400 space-y-2">
                                        <CheckCircle2 className="w-10 h-10 mx-auto text-slate-600" />
                                        <p className="text-sm font-medium">No hay invitaciones activas pendientes</p>
                                        <p className="text-xs text-slate-500">Usa el generador a la izquierda para invitar a nuevos colaboradores.</p>
                                    </div>
                                ) : (
                                    activeInvites.map((inv) => {
                                        const registerUrl = typeof window !== "undefined" ? `${window.location.origin}/afiliados/registro?token=${inv.token}` : `/afiliados/registro?token=${inv.token}`;
                                        const expiresDate = new Date(inv.expiresAt).toLocaleDateString();

                                        return (
                                            <Card key={inv.id} className="border-slate-800/80 bg-slate-900/60 rounded-2xl overflow-hidden shadow-sm">
                                                <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="text-sm font-semibold text-white">{inv.name || "Sin nombre asignado"}</h4>
                                                            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">
                                                                Expira {expiresDate}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs text-slate-400 font-mono truncate max-w-md">
                                                            {registerUrl}
                                                        </p>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => copyToClipboard(registerUrl)}
                                                            className="bg-slate-800/80 border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs h-9"
                                                        >
                                                            <Copy className="w-3.5 h-3.5 mr-1.5" />
                                                            Copiar
                                                        </Button>

                                                        <a
                                                            href={`https://wa.me/?text=${encodeURIComponent(`Hola! Te invito a unirte a RNV Manager como colaborador. Accede aquí para crear tu cuenta: ${registerUrl}`)}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="px-3 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                                                        >
                                                            <MessageSquare className="w-3.5 h-3.5" />
                                                            WhatsApp
                                                        </a>

                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleRevokeInvite(inv.id)}
                                                            className="text-red-400 hover:bg-red-500/10 rounded-xl h-9 px-2.5"
                                                            title="Revocar"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* If Affiliate User: Show their personal assigned portfolio */}
            {isAffiliate && (
                <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-600/20 to-purple-600/20 border border-violet-500/30 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <ShieldCheck className="w-6 h-6 text-violet-400" />
                            <div>
                                <h3 className="text-sm font-semibold text-white">Modo Colaborador Activo</h3>
                                <p className="text-xs text-slate-300">Tienes acceso restringido para consultar y gestionar únicamente tus clientes asignados.</p>
                            </div>
                        </div>
                        <Button
                            onClick={() => window.location.href = "/clients"}
                            className="bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs h-9 px-4 font-semibold"
                        >
                            Ver en Clientes →
                        </Button>
                    </div>
                </div>
            )}

            {/* Master Affiliates & Assignment Modal */}
            <AffiliatesModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                clientsList={allClients}
                onClientsUpdated={fetchData}
            />
        </div>
    );
}
