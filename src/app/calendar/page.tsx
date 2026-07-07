"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
    ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, RefreshCw,
    DollarSign, AlertCircle, CheckCircle, Bell
} from "lucide-react";
import { calendar as calendarApi, type CalendarEvent } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const eventColors: Record<string, string> = {
    due: "bg-blue-100 text-blue-800 border-blue-200",
    overdue: "bg-red-100 text-red-800 border-red-200",
    paid: "bg-green-100 text-green-800 border-green-200",
    task: "bg-violet-100 text-violet-800 border-violet-200",
    reminder: "bg-amber-100 text-amber-800 border-amber-200",
};

export default function CalendarPage() {
    const [viewDate, setViewDate] = useState(() => new Date());
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [taskForm, setTaskForm] = useState({ title: "", description: "", date: "", type: "reminder" });
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
            await calendarApi.createTask({
                title: taskForm.title,
                description: taskForm.description || undefined,
                scheduledAt: new Date(taskForm.date + "T09:00:00").toISOString(),
                type: taskForm.type,
                notifyEmail: true,
            });
            addToast("Recordatorio creado", "success");
            setIsModalOpen(false);
            setTaskForm({ title: "", description: "", date: "", type: "reminder" });
            fetchEvents();
        } catch (e) {
            addToast(e instanceof Error ? e.message : "Error", "error");
        }
    };

    const stats = {
        due: events.filter((e) => e.type === "due").length,
        overdue: events.filter((e) => e.type === "overdue").length,
        tasks: events.filter((e) => e.type === "task").length,
        paid: events.filter((e) => e.type === "paid").length,
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <CalendarIcon className="w-8 h-8 text-violet-600" />
                        Calendario
                    </h2>
                    <p className="text-muted-foreground">Cobros, mora, recordatorios y tareas programadas</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={fetchEvents} disabled={loading} className="gap-2">
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Actualizar
                    </Button>
                    <Button onClick={() => setIsModalOpen(true)} className="gap-2 bg-violet-600">
                        <Plus size={16} /> Nuevo recordatorio
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card><CardContent className="pt-4 flex items-center gap-3">
                    <DollarSign className="w-5 h-5 text-blue-500" />
                    <div><p className="text-xs text-muted-foreground">Cobros del mes</p><p className="text-xl font-bold">{stats.due}</p></div>
                </CardContent></Card>
                <Card><CardContent className="pt-4 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <div><p className="text-xs text-muted-foreground">Vencidos</p><p className="text-xl font-bold text-red-600">{stats.overdue}</p></div>
                </CardContent></Card>
                <Card><CardContent className="pt-4 flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <div><p className="text-xs text-muted-foreground">Pagados</p><p className="text-xl font-bold text-green-600">{stats.paid}</p></div>
                </CardContent></Card>
                <Card><CardContent className="pt-4 flex items-center gap-3">
                    <Bell className="w-5 h-5 text-violet-500" />
                    <div><p className="text-xs text-muted-foreground">Tareas</p><p className="text-xl font-bold">{stats.tasks}</p></div>
                </CardContent></Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 rounded-2xl border-2">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle>{MONTHS[month]} {year}</CardTitle>
                        <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month - 1, 1))}>
                                <ChevronLeft size={18} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setViewDate(new Date())}>Hoy</Button>
                            <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month + 1, 1))}>
                                <ChevronRight size={18} />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-7 gap-1 mb-1">
                            {WEEKDAYS.map((d) => (
                                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {calendarDays.map((cell) => {
                                const dayEvents = eventsByDate[cell.date] || [];
                                const isToday = cell.date === new Date().toISOString().slice(0, 10);
                                const isSelected = cell.date === selectedDay;
                                return (
                                    <button
                                        key={cell.date}
                                        type="button"
                                        onClick={() => setSelectedDay(cell.date)}
                                        className={`min-h-[72px] p-1 rounded-lg border text-left transition-colors ${
                                            !cell.inMonth ? "opacity-40" : ""
                                        } ${isSelected ? "border-violet-500 bg-violet-50" : "border-gray-100 hover:bg-gray-50"} ${
                                            isToday ? "ring-2 ring-violet-300" : ""
                                        }`}
                                    >
                                        <span className={`text-sm font-medium ${isToday ? "text-violet-600" : ""}`}>{cell.day}</span>
                                        <div className="space-y-0.5 mt-0.5">
                                            {dayEvents.slice(0, 2).map((e) => (
                                                <div key={e.id} className={`text-[9px] px-1 rounded truncate border ${eventColors[e.type] || eventColors.task}`}>
                                                    {e.title.slice(0, 12)}
                                                </div>
                                            ))}
                                            {dayEvents.length > 2 && (
                                                <span className="text-[9px] text-muted-foreground">+{dayEvents.length - 2}</span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-2xl border-2">
                    <CardHeader>
                        <CardTitle className="text-base">
                            {selectedDay ? `Eventos — ${selectedDay}` : "Selecciona un día"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
                        {selectedEvents.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">Sin eventos este día</p>
                        ) : (
                            selectedEvents.map((e) => (
                                <div key={e.id} className={`p-3 rounded-xl border ${eventColors[e.type] || ""}`}>
                                    <p className="font-medium text-sm">{e.title}</p>
                                    {e.clientName && <p className="text-xs opacity-80">{e.clientName}</p>}
                                    {e.amount != null && e.amount > 0 && (
                                        <p className="text-sm font-bold mt-1">${e.amount.toFixed(2)}</p>
                                    )}
                                    {e.billingCycle && (
                                        <Badge variant="outline" className="mt-1 text-[10px]">{e.billingCycle}</Badge>
                                    )}
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Nuevo recordatorio</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 mt-2">
                        <Input placeholder="Título (ej: Reactivar Yeuri)" value={taskForm.title}
                            onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
                        <Input placeholder="Descripción opcional" value={taskForm.description}
                            onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
                        <Input type="date" value={taskForm.date}
                            onChange={(e) => setTaskForm({ ...taskForm, date: e.target.value })} />
                        <select className="w-full rounded-xl border-2 px-3 py-2 text-sm"
                            value={taskForm.type} onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value })}>
                            <option value="reminder">Recordatorio</option>
                            <option value="reactivation">Reactivación cliente</option>
                            <option value="billing">Cobro</option>
                            <option value="follow_up">Seguimiento</option>
                        </select>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleCreateTask}>Programar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
