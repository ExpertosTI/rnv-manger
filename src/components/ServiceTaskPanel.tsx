"use client";

import { useCallback, useEffect, useState } from "react";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Circle, ListTodo, Plus, RotateCw, Trash2, Calendar, AlertTriangle,
} from "lucide-react";
import { calendar as calendarApi, type ScheduledTask } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type ServiceTaskTarget = {
    serviceId: string;
    serviceName: string;
    clientId?: string;
    clientName?: string;
    url?: string;
};

type Props = {
    target: ServiceTaskTarget | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onTasksChange?: () => void;
    dark?: boolean;
};

function defaultScheduledAt() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16);
}

function isOverdue(scheduledAt: string) {
    return new Date(scheduledAt) < new Date();
}

export function ServiceTaskPanel({ target, open, onOpenChange, onTasksChange, dark }: Props) {
    const { addToast } = useToast();
    const [tasks, setTasks] = useState<ScheduledTask[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt);

    const load = useCallback(async () => {
        if (!target?.serviceId) return;
        setLoading(true);
        try {
            const res = await calendarApi.listTasks({ serviceId: target.serviceId, status: "pending" });
            setTasks(res.data || []);
        } catch {
            addToast("Error al cargar tareas", "error");
        } finally {
            setLoading(false);
        }
    }, [target?.serviceId, addToast]);

    useEffect(() => {
        if (open && target) {
            setTitle("");
            setDescription("");
            setScheduledAt(defaultScheduledAt());
            load();
        }
    }, [open, target?.serviceId, load]);

    const addTask = async () => {
        if (!target || !title.trim()) {
            addToast("Escribe qué hay que hacer", "error");
            return;
        }
        const parsed = new Date(scheduledAt);
        if (Number.isNaN(parsed.getTime())) {
            addToast("Fecha inválida", "error");
            return;
        }
        setSaving(true);
        try {
            const res = await calendarApi.createTask({
                title: title.trim(),
                description: description.trim() || undefined,
                type: "work",
                scheduledAt: parsed.toISOString(),
                serviceId: target.serviceId,
                clientId: target.clientId || undefined,
                status: "pending",
            });
            const created = res.data;
            if (created) {
                setTasks((prev) => [...prev, created].sort(
                    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
                ));
            } else {
                await load();
            }
            addToast("Tarea guardada", "success");
            setTitle("");
            setDescription("");
            onTasksChange?.();
        } catch (e) {
            addToast(e instanceof Error ? e.message : "Error al guardar tarea", "error");
        } finally {
            setSaving(false);
        }
    };

    const markDone = async (id: string) => {
        try {
            await calendarApi.updateTask(id, { status: "done" });
            setTasks((prev) => prev.filter((t) => t.id !== id));
            addToast("Tarea completada", "success");
            onTasksChange?.();
        } catch {
            addToast("Error al completar", "error");
        }
    };

    const cancelTask = async (id: string) => {
        try {
            await calendarApi.cancelTask(id);
            setTasks((prev) => prev.filter((t) => t.id !== id));
            onTasksChange?.();
        } catch {
            addToast("Error al cancelar", "error");
        }
    };

    const inputCls = dark
        ? "rounded-xl border border-zinc-600 bg-zinc-900 text-white placeholder:text-zinc-400 focus:border-violet-400 focus:ring-violet-500/30 [color-scheme:dark]"
        : "rounded-xl border-2";
    const card = dark
        ? "border-zinc-700 bg-zinc-900/80"
        : "border-gray-100 bg-gray-50/80";
    const textMuted = dark ? "text-zinc-300" : "text-muted-foreground";
    const textMain = dark ? "text-white" : "text-gray-900";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    "max-w-md",
                    dark && "bg-[#12121c] border-zinc-700 text-white [&>button]:text-zinc-300 [&>button]:hover:text-white"
                )}
            >
                <DialogHeader>
                    <DialogTitle className={cn("flex items-center gap-2", textMain)}>
                        <ListTodo className="h-5 w-5 text-violet-400" />
                        Tareas — {target?.serviceName}
                    </DialogTitle>
                    <DialogDescription className={textMuted}>
                        Tu cola de trabajo para esta app. Cuando te sientes a trabajar, aquí está lo pendiente.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className={cn("rounded-xl border p-3 space-y-2", card)}>
                        <p className={cn("text-xs font-semibold uppercase tracking-wider", textMuted)}>Nueva tarea</p>
                        <Input
                            placeholder="Ej: Actualizar módulo de facturación, revisar logs..."
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && addTask()}
                            className={inputCls}
                        />
                        <Input
                            placeholder="Notas (opcional)"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className={inputCls}
                        />
                        <div className="flex gap-2">
                            <Input
                                type="datetime-local"
                                value={scheduledAt}
                                onChange={(e) => setScheduledAt(e.target.value)}
                                className={cn("flex-1 text-sm", inputCls)}
                            />
                            <Button onClick={addTask} disabled={saving} className="shrink-0 gap-1 rounded-xl">
                                {saving ? <RotateCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                Añadir
                            </Button>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <p className={cn("text-xs font-semibold uppercase tracking-wider", textMuted)}>
                                Pendientes ({tasks.length})
                            </p>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={load}
                                disabled={loading}
                                className={cn("h-7 px-2", dark && "text-zinc-300 hover:text-white hover:bg-white/10")}
                            >
                                <RotateCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                            </Button>
                        </div>
                        {loading && tasks.length === 0 ? (
                            <p className={cn("text-sm text-center py-6", textMuted)}>Cargando…</p>
                        ) : tasks.length === 0 ? (
                            <p className={cn("text-sm text-center py-6", textMuted)}>
                                Sin tareas — asigna la primera arriba
                            </p>
                        ) : (
                            <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                {tasks.map((t) => {
                                    const overdue = isOverdue(t.scheduledAt);
                                    return (
                                        <li
                                            key={t.id}
                                            className={cn(
                                                "flex items-start gap-2 rounded-xl border p-2.5",
                                                card,
                                                overdue && dark && "border-amber-500/40 bg-amber-950/20"
                                            )}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => markDone(t.id)}
                                                className="mt-0.5 text-zinc-400 hover:text-emerald-400 shrink-0"
                                                title="Marcar hecho"
                                            >
                                                <Circle className="h-4 w-4" />
                                            </button>
                                            <div className="min-w-0 flex-1">
                                                <p className={cn("text-sm font-medium", textMain)}>{t.title}</p>
                                                {t.description && (
                                                    <p className={cn("text-xs mt-0.5", textMuted)}>{t.description}</p>
                                                )}
                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            "text-[10px] gap-1",
                                                            dark && "border-zinc-600 text-zinc-200 bg-zinc-800",
                                                            overdue && "border-amber-500/50 text-amber-200 bg-amber-950/40"
                                                        )}
                                                    >
                                                        {overdue ? (
                                                            <AlertTriangle className="h-3 w-3" />
                                                        ) : (
                                                            <Calendar className="h-3 w-3" />
                                                        )}
                                                        {new Date(t.scheduledAt).toLocaleString("es", {
                                                            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                                                        })}
                                                    </Badge>
                                                    {overdue && (
                                                        <span className="text-[10px] text-amber-400 font-medium">Vencida</span>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => cancelTask(t.id)}
                                                className="text-zinc-400 hover:text-red-400 shrink-0"
                                                title="Cancelar"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
