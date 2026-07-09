"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    ListTodo, RefreshCw, CheckCircle2, Circle, Network, ExternalLink,
    Calendar, Sparkles,
} from "lucide-react";
import { calendar as calendarApi, type ScheduledTask } from "@/lib/api";
import { ServiceTaskPanel, type ServiceTaskTarget } from "@/components/ServiceTaskPanel";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useToast } from "@/components/ui/toast";

export default function WorkflowPage() {
    const [tasks, setTasks] = useState<ScheduledTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [taskTarget, setTaskTarget] = useState<ServiceTaskTarget | null>(null);
    const { addToast } = useToast();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await calendarApi.listTasks({ status: "pending", type: "work" });
            setTasks(res.data || []);
        } catch {
            addToast("Error al cargar cola de trabajo", "error");
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => { load(); }, [load]);

    const grouped = useMemo(() => {
        const map = new Map<string, { serviceName: string; url?: string; faviconUrl?: string; type?: string; tasks: ScheduledTask[] }>();
        const orphan: ScheduledTask[] = [];
        for (const t of tasks) {
            if (t.serviceId && t.service) {
                const key = t.serviceId;
                if (!map.has(key)) {
                    map.set(key, {
                        serviceName: t.service.name,
                        url: t.service.url,
                        faviconUrl: (t.service as { faviconUrl?: string }).faviconUrl,
                        type: t.service.type,
                        tasks: [],
                    });
                }
                map.get(key)!.tasks.push(t);
            } else {
                orphan.push(t);
            }
        }
        return { byService: Array.from(map.entries()), orphan };
    }, [tasks]);

    const markDone = async (id: string) => {
        try {
            await calendarApi.updateTask(id, { status: "done" });
            setTasks((prev) => prev.filter((t) => t.id !== id));
            addToast("Tarea completada", "success");
        } catch {
            addToast("Error", "error");
        }
    };

    const openServiceTasks = (t: ScheduledTask) => {
        if (!t.serviceId || !t.service) return;
        setTaskTarget({
            serviceId: t.serviceId,
            serviceName: t.service.name,
            clientId: t.clientId,
            clientName: t.client?.name,
            url: t.service.url,
        });
    };

    const todayCount = tasks.filter((t) => {
        const d = new Date(t.scheduledAt);
        const now = new Date();
        return d.toDateString() === now.toDateString() || d < now;
    }).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <ListTodo className="h-8 w-8 text-violet-600" />
                        Mi Flujo de Trabajo
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Tu imperio en una cola — tareas por app para cuando te sientes a trabajar
                    </p>
                </div>
                <div className="flex gap-2">
                    <Badge className="bg-violet-100 text-violet-800 border-violet-200 gap-1 px-3 py-1">
                        <Sparkles className="h-3.5 w-3.5" />
                        {tasks.length} pendientes
                    </Badge>
                    {todayCount > 0 && (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                            {todayCount} para hoy
                        </Badge>
                    )}
                    <Button variant="outline" onClick={load} disabled={loading} className="gap-2 rounded-xl border-2">
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        Actualizar
                    </Button>
                    <Link href="/map">
                        <Button className="gap-2 rounded-xl">
                            <Network className="h-4 w-4" />
                            Neural Map
                        </Button>
                    </Link>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-16">
                    <RefreshCw className="h-8 w-8 text-violet-500 animate-spin" />
                </div>
            ) : tasks.length === 0 ? (
                <Card className="rounded-2xl border-2 border-dashed p-12 text-center">
                    <ListTodo className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">Sin tareas de trabajo</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-4">
                        Ve al Neural Map, haz click en una app y asigna qué hacer
                    </p>
                    <Link href="/map">
                        <Button className="rounded-xl">Abrir mapa →</Button>
                    </Link>
                </Card>
            ) : (
                <div className="space-y-4">
                    {grouped.byService.map(([serviceId, group]) => (
                        <Card key={serviceId} className="rounded-2xl border-2 border-gray-100 overflow-hidden">
                            <CardHeader className="bg-gradient-to-r from-violet-50/80 to-transparent pb-3">
                                <div className="flex items-center justify-between gap-2">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <ServiceIcon
                                            name={group.serviceName}
                                            type={group.type}
                                            url={group.url}
                                            faviconUrl={group.faviconUrl}
                                            size="sm"
                                            online
                                        />
                                        {group.serviceName}
                                        <Badge variant="outline" className="text-xs">{group.tasks.length}</Badge>
                                    </CardTitle>
                                    <div className="flex gap-2">
                                        {group.url && (
                                            <a href={group.url} target="_blank" rel="noopener noreferrer"
                                                className="text-violet-600 hover:underline text-xs flex items-center gap-1">
                                                <ExternalLink className="h-3 w-3" />
                                            </a>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs rounded-lg"
                                            onClick={() => openServiceTasks(group.tasks[0])}
                                        >
                                            + Tarea
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0 divide-y divide-gray-50">
                                {group.tasks.map((t) => (
                                    <div key={t.id} className="flex items-start gap-3 p-4 hover:bg-violet-50/30">
                                        <button
                                            type="button"
                                            onClick={() => markDone(t.id)}
                                            className="mt-0.5 text-gray-400 hover:text-emerald-600"
                                        >
                                            <Circle className="h-5 w-5" />
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-900">{t.title}</p>
                                            {t.description && (
                                                <p className="text-sm text-muted-foreground mt-0.5">{t.description}</p>
                                            )}
                                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                                <Calendar className="h-3 w-3" />
                                                {new Date(t.scheduledAt).toLocaleString("es")}
                                            </p>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="shrink-0 text-emerald-600"
                                            onClick={() => markDone(t.id)}
                                        >
                                            <CheckCircle2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <ServiceTaskPanel
                target={taskTarget}
                open={!!taskTarget}
                onOpenChange={(o) => !o && setTaskTarget(null)}
                onTasksChange={load}
            />
        </div>
    );
}
