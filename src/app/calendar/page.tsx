"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
    ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, RefreshCw,
    DollarSign, AlertCircle, CheckCircle, Bell, MessageSquare, Download,
    Clock, Bot, Sparkles, Send, ArrowRight
} from "lucide-react";
import { calendar as calendarApi, type CalendarEvent } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const eventColors: Record<string, string> = {
    due: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    overdue: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    task: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    meeting: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    maintenance: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    reminder: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

export default function CalendarPage() {
    const [viewDate, setViewDate] = useState(() => new Date());
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [sendingSummary, setSendingSummary] = useState(false);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [taskForm, setTaskForm] = useState({ title: "", description: "", date: "", time: "09:00", type: "meeting" });
    const { addToast } = useToast();

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const fetchEvents = async () => {
        setLoading(true);
        const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month + 1, 0).getDate();
        const to = `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`;
        try {
            const res = await calendarApi.events(from, to);
            setEvents(res.data || []);
        } catch {
            addToast("Error al cargar calendario", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchEvents(); }, [year, month]);

    const eventsByDate = useMemo(() => {
        const map: Record<string, CalendarEvent[]> = {};
        for (const e of events) {
            (map[e.date] ||= []).push(e);
        }
        return map;
    }, [events]);

    const calendarDays = useMemo(() => {
        const first = new Date(year, month, 1);
        const startPad = first.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells: { date: string; day: number; inMonth: boolean }[] = [];
        for (let i = 0; i < startPad; i++) {
            const d = new Date(year, month, -startPad + i + 1);
            cells.push({ date: d.toISOString().slice(0, 10), day: d.getDate(), inMonth: false });
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            cells.push({ date, day: d, inMonth: true });
        }
        while (cells.length % 7 !== 0) {
            const d = new Date(year, month + 1, cells.length - daysInMonth - startPad + 1);
            cells.push({ date: d.toISOString().slice(0, 10), day: d.getDate(), inMonth: false });
        }
        return cells;
    }, [year, month]);

    const selectedEvents = selectedDay ? eventsByDate[selectedDay] || [] : [];

    const handleCreateTask = async () => {
        if (!taskForm.title || !taskForm.date) {
            addToast("Título y fecha requeridos", "error");
            return;
        }
        try {
            const scheduledAt = new Date(`${taskForm.date}T${taskForm.time || "09:00"}:00`).toISOString();
            await calendarApi.createTask({
                title: taskForm.title,
                description: taskForm.description || undefined,
                scheduledAt: scheduledAt,
                type: taskForm.type,
                notifyEmail: true,
            });
            addToast("Compromiso agendado con recordatorio WhatsApp", "success");
            setIsModalOpen(false);
            setTaskForm({ title: "", description: "", date: "", time: "09:00", type: "meeting" });
            fetchEvents();
        } catch (e) {
            addToast(e instanceof Error ? e.message : "Error", "error");
        }
    };

    const handleSendSummary = async () => {
        setSendingSummary(true);
        try {
            const res = await calendarApi.sendDailySummary();
            addToast(res.message || "Resumen enviado por WhatsApp con éxito", "success");
        } catch (e) {
            addToast(e instanceof Error ? e.message : "Error al enviar resumen WhatsApp", "error");
        } finally {
            setSendingSummary(false);
        }
    };

    const handlePostpone = async (id: string, minutes: number) => {
        try {
            const res = await calendarApi.postponeTask(id, minutes);
            addToast(res.message || `Pospuesto +${minutes}m`, "success");
            fetchEvents();
        } catch (e) {
            addToast(e instanceof Error ? e.message : "Error al posponer", "error");
        }
    };

    const stats = {
        due: events.filter((e) => e.type === "due").length,
        overdue: events.filter((e) => e.type === "overdue").length,
        tasks: events.filter((e) => e.type === "task" || e.type === "meeting" || e.type === "maintenance").length,
        paid: events.filter((e) => e.type === "paid").length,
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                            <CalendarIcon className="w-5 h-5 text-white" />
                        </div>
                        Agenda & Calendario Inteligente
                    </h2>
                    <p className="text-muted-foreground text-sm mt-1">
                        Sincronización en tiempo real con Evolution API, recordatorios automáticos y agendamiento por IA
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={handleSendSummary}
                        disabled={sendingSummary}
                        className="gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                    >
                        <MessageSquare size={16} className={sendingSummary ? "animate-pulse" : ""} />
                        {sendingSummary ? "Enviando..." : "Resumen WhatsApp"}
                    </Button>
                    <a
                        href={calendarApi.getExportICSUrl()}
                        download="agenda_renace.ics"
                        className="inline-flex"
                    >
                        <Button variant="outline" className="gap-2 border-border/60">
                            <Download size={16} /> Exportar .ics
                        </Button>
                    </a>
                    <Button variant="outline" onClick={fetchEvents} disabled={loading} className="gap-2">
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Actualizar
                    </Button>
                    <Button onClick={() => setIsModalOpen(true)} className="gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-500/25 border-0">
                        <Plus size={16} /> Agendar Compromiso
                    </Button>
                </div>
            </div>

            {/* AI Assistant Banner */}
            <Card className="rounded-2xl border border-violet-500/30 bg-gradient-to-r from-violet-950/40 via-indigo-950/20 to-slate-900/40 p-4 backdrop-blur-md">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0">
                            <Bot className="w-5 h-5 text-violet-400" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-foreground">Asistente IA Conectado a WhatsApp</span>
                                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
                                    Evolution API Online
                                </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Puedes escribirle por WhatsApp: <span className="text-violet-300 font-mono">"Agéndame reunión mañana a las 3pm con Juan para mantenimiento de VPS"</span> y la IA lo creará de inmediato.
                            </p>
                        </div>
                    </div>
                    <Badge variant="outline" className="border-violet-500/30 text-violet-300 text-xs px-3 py-1 shrink-0">
                        <Sparkles size={12} className="mr-1.5 text-violet-400" /> Auto-alertas 10m y 5m
                    </Badge>
                </div>
            </Card>

            {/* Stats */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                    <CardContent className="pt-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <DollarSign className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Cobros del mes</p>
                            <p className="text-xl font-bold text-foreground">{stats.due}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                    <CardContent className="pt-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                            <AlertCircle className="w-5 h-5 text-rose-400" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Vencidos / Mora</p>
                            <p className="text-xl font-bold text-rose-400">{stats.overdue}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                    <CardContent className="pt-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                            <CheckCircle className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Pagados</p>
                            <p className="text-xl font-bold text-emerald-400">{stats.paid}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                    <CardContent className="pt-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                            <Bell className="w-5 h-5 text-violet-400" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Compromisos / Tareas</p>
                            <p className="text-xl font-bold text-violet-400">{stats.tasks}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Calendar Grid & Detail */}
            <div className="grid lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-md shadow-xl">
                    <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/40">
                        <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                            {MONTHS[month]} {year}
                        </CardTitle>
                        <div className="flex items-center gap-1.5">
                            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setViewDate(new Date(year, month - 1, 1))}>
                                <ChevronLeft size={16} />
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 text-xs font-semibold px-3 rounded-lg" onClick={() => setViewDate(new Date())}>
                                Hoy
                            </Button>
                            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setViewDate(new Date(year, month + 1, 1))}>
                                <ChevronRight size={16} />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="grid grid-cols-7 gap-1.5 mb-2">
                            {WEEKDAYS.map((d) => (
                                <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">
                                    {d}
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1.5">
                            {calendarDays.map((cell) => {
                                const dayEvents = eventsByDate[cell.date] || [];
                                const isToday = cell.date === new Date().toISOString().slice(0, 10);
                                const isSelected = cell.date === selectedDay;
                                return (
                                    <button
                                        key={cell.date}
                                        type="button"
                                        onClick={() => setSelectedDay(cell.date)}
                                        className={`min-h-[82px] p-2 rounded-xl border text-left transition-all relative ${
                                            !cell.inMonth ? "opacity-30 border-transparent" : "border-border/40 hover:border-violet-500/50 hover:bg-muted/30"
                                        } ${isSelected ? "border-violet-500 bg-violet-500/10 shadow-md shadow-violet-500/10" : "bg-card/30"} ${
                                            isToday ? "ring-2 ring-violet-500/70" : ""
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className={`text-xs font-bold ${isToday ? "text-violet-400" : "text-muted-foreground"}`}>
                                                {cell.day}
                                            </span>
                                            {dayEvents.length > 0 && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                                            )}
                                        </div>
                                        <div className="space-y-1 mt-1.5">
                                            {dayEvents.slice(0, 2).map((e) => (
                                                <div
                                                    key={e.id}
                                                    className={`text-[10px] px-1.5 py-0.5 rounded-md truncate border font-medium ${eventColors[e.type] || eventColors.task}`}
                                                >
                                                    {e.title}
                                                </div>
                                            ))}
                                            {dayEvents.length > 2 && (
                                                <span className="text-[10px] text-muted-foreground font-semibold pl-1 block">
                                                    +{dayEvents.length - 2} más
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Day Detail View */}
                <Card className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-md shadow-xl flex flex-col">
                    <CardHeader className="border-b border-border/40 pb-4">
                        <CardTitle className="text-base font-bold flex items-center justify-between">
                            <span>{selectedDay ? `Compromisos — ${selectedDay}` : "Selecciona un día"}</span>
                            {selectedDay && (
                                <Badge variant="outline" className="border-violet-500/30 text-violet-400 text-xs">
                                    {selectedEvents.length} {selectedEvents.length === 1 ? "evento" : "eventos"}
                                </Badge>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 flex-1 space-y-3 max-h-[550px] overflow-y-auto">
                        {selectedEvents.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <CalendarIcon className="w-10 h-10 mx-auto opacity-30 mb-2" />
                                <p className="text-sm font-medium">Sin compromisos agendados para este día</p>
                                <p className="text-xs text-muted-foreground/70 mt-1">Haz clic en "Agendar Compromiso" o escribe por WhatsApp a la IA</p>
                            </div>
                        ) : (
                            selectedEvents.map((e) => (
                                <div
                                    key={e.id}
                                    className={`p-4 rounded-xl border transition-all ${eventColors[e.type] || "bg-card/50 border-border/60"}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="font-semibold text-sm text-foreground">{e.title}</p>
                                            {e.clientName && (
                                                <p className="text-xs text-muted-foreground mt-0.5">👤 {e.clientName}</p>
                                            )}
                                            {e.serviceName && (
                                                <p className="text-xs text-muted-foreground">🌐 {e.serviceName}</p>
                                            )}
                                            {e.description && (
                                                <p className="text-xs text-muted-foreground/80 mt-1 italic">{e.description}</p>
                                            )}
                                        </div>
                                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider shrink-0 border-current">
                                            {e.type}
                                        </Badge>
                                    </div>

                                    {e.amount != null && e.amount > 0 && (
                                        <p className="text-sm font-extrabold text-foreground mt-2">
                                            ${e.amount.toFixed(2)} USD
                                        </p>
                                    )}

                                    {/* Action quick buttons for tasks */}
                                    {e.type !== "due" && e.type !== "paid" && (
                                        <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-border/20">
                                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                <Clock size={10} /> Posponer:
                                            </span>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 text-[10px] px-2"
                                                onClick={() => handlePostpone(e.id, 15)}
                                            >
                                                +15m
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 text-[10px] px-2"
                                                onClick={() => handlePostpone(e.id, 30)}
                                            >
                                                +30m
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 text-[10px] px-2"
                                                onClick={() => handlePostpone(e.id, 60)}
                                            >
                                                +1h
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Modal: New Event / Task */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-[440px] rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CalendarIcon className="w-5 h-5 text-violet-500" />
                            Agendar Nuevo Compromiso
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3.5 mt-3">
                        <div>
                            <label className="text-xs font-semibold text-muted-foreground block mb-1">Título del compromiso</label>
                            <Input
                                placeholder="Ej: Mantenimiento Servidor Odoo / Reunión con Cliente"
                                value={taskForm.title}
                                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-muted-foreground block mb-1">Notas / Detalles</label>
                            <Input
                                placeholder="Ej: Revisar latencia y aplicar actualización"
                                value={taskForm.description}
                                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground block mb-1">Fecha</label>
                                <Input
                                    type="date"
                                    value={taskForm.date}
                                    onChange={(e) => setTaskForm({ ...taskForm, date: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground block mb-1">Hora</label>
                                <Input
                                    type="time"
                                    value={taskForm.time}
                                    onChange={(e) => setTaskForm({ ...taskForm, time: e.target.value })}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-muted-foreground block mb-1">Categoría</label>
                            <select
                                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                                value={taskForm.type}
                                onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value })}
                            >
                                <option value="meeting">🤝 Reunión / Cita</option>
                                <option value="maintenance">🔧 Mantenimiento Servidor / VPS</option>
                                <option value="billing">💳 Cobro / Facturación</option>
                                <option value="reminder">⏰ Recordatorio General</option>
                                <option value="follow_up">📋 Seguimiento Cliente</option>
                            </select>
                        </div>
                        <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300 flex items-center gap-2">
                            <Bell size={14} className="shrink-0 text-violet-400" />
                            <span>Se enviará recordatorio automático a WhatsApp 10m y 5m antes.</span>
                        </div>
                    </div>
                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleCreateTask} className="bg-violet-600 hover:bg-violet-500 text-white">
                            Guardar y Agendar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
