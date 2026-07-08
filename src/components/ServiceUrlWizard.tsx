"use client";

import { useState, useEffect } from "react";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Globe, Radar, Server, Users, Sparkles, RotateCw } from "lucide-react";
import { services as servicesApi, type ProbeResult } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

type VpsOption = { id: string; name: string; ipAddress?: string; clientId?: string };
type ClientOption = { id: string; name: string };

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    vpsList: VpsOption[];
    clients: ClientOption[];
    onCreated?: () => void;
    initialUrl?: string;
};

export function ServiceUrlWizard({ open, onOpenChange, vpsList, clients, onCreated, initialUrl = "" }: Props) {
    const { addToast } = useToast();
    const [url, setUrl] = useState(initialUrl);
    const [probing, setProbing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [probe, setProbe] = useState<ProbeResult | null>(null);
    const [vpsId, setVpsId] = useState("");
    const [clientId, setClientId] = useState("");

    useEffect(() => {
        if (open) {
            setUrl(initialUrl);
            setProbe(null);
            setVpsId("");
            setClientId("");
        }
    }, [open, initialUrl]);

    const runProbe = async () => {
        if (!url.trim()) {
            addToast("Escribe una URL", "error");
            return;
        }
        setProbing(true);
        try {
            const res = await servicesApi.probe(url.trim());
            const d = res.data;
            setProbe(d);
            if (d.suggestedVpsId) setVpsId(d.suggestedVpsId);
            if (d.suggestedClientId) setClientId(d.suggestedClientId);
            else if (d.suggestedVpsId) {
                const v = vpsList.find((x) => x.id === d.suggestedVpsId);
                if (v?.clientId) setClientId(v.clientId);
            }
            addToast(
                d.reachable ? `Detectado: ${d.title || d.suggestedName}` : "URL no responde — revisa el dominio",
                d.reachable ? "success" : "error"
            );
        } catch (e) {
            addToast(e instanceof Error ? e.message : "Error al detectar", "error");
        } finally {
            setProbing(false);
        }
    };

    const handleCreate = async () => {
        if (!probe) {
            addToast("Detecta la URL primero", "error");
            return;
        }
        if (!vpsId) {
            addToast("Selecciona en qué VPS está el servicio", "error");
            return;
        }
        setSaving(true);
        try {
            await servicesApi.create({
                name: probe.suggestedName,
                type: probe.suggestedType,
                url: probe.url,
                status: probe.status,
                vpsId,
                clientId: clientId || null,
            });
            addToast("Servicio registrado", "success");
            onOpenChange(false);
            onCreated?.();
        } catch (e) {
            addToast(e instanceof Error ? e.message : "Error al crear", "error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Globe className="h-5 w-5 text-violet-500" />
                        Detectar servicio desde URL
                    </DialogTitle>
                    <DialogDescription>
                        Pega una dirección web (ej. zavinteriorclean.com o ai.renace.tech). Detectamos nombre, tipo y sugerimos cliente/VPS.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="https://ejemplo.com"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && runProbe()}
                            className="rounded-xl border-2"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            disabled={probing}
                            onClick={runProbe}
                            className="shrink-0 rounded-xl border-2 gap-1"
                        >
                            {probing ? <RotateCw className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
                            Detectar
                        </Button>
                    </div>

                    {probe && (
                        <div className="rounded-2xl border-2 border-violet-100 bg-gradient-to-br from-violet-50/80 to-white p-4 space-y-3">
                            <div className="flex gap-3">
                                {probe.faviconUrl ? (
                                    <img
                                        src={probe.faviconUrl}
                                        alt=""
                                        className="h-12 w-12 rounded-xl border bg-white object-contain p-1"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                    />
                                ) : (
                                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100">
                                        <Globe className="h-6 w-6 text-violet-600" />
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-gray-900 truncate">{probe.title || probe.suggestedName}</p>
                                    <p className="text-xs text-muted-foreground truncate">{probe.hostname}</p>
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        <Badge variant="outline" className="text-[10px] uppercase">{probe.suggestedType}</Badge>
                                        <Badge variant={probe.reachable ? "success" : "destructive"} className="text-[10px]">
                                            {probe.reachable ? `ON · ${probe.statusCode}` : "OFF"}
                                        </Badge>
                                        {probe.isRenaceApp && (
                                            <Badge className="text-[10px] bg-violet-600 text-white border-0">Renace</Badge>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {probe.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2">{probe.description}</p>
                            )}
                            {(probe.clientMatchReason || probe.vpsMatchReason) && (
                                <div className="flex items-start gap-2 rounded-xl bg-white/80 border border-violet-100 px-3 py-2 text-xs text-violet-800">
                                    <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                    <div className="space-y-0.5">
                                        {probe.clientMatchReason && <p>{probe.clientMatchReason}</p>}
                                        {probe.vpsMatchReason && <p>{probe.vpsMatchReason}</p>}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {probe && (
                        <>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium flex items-center gap-1">
                                    <Server className="h-3.5 w-3.5" /> ¿En qué VPS está? *
                                </label>
                                <select
                                    value={vpsId}
                                    onChange={(e) => {
                                        setVpsId(e.target.value);
                                        const v = vpsList.find((x) => x.id === e.target.value);
                                        if (v?.clientId && !clientId) setClientId(v.clientId);
                                    }}
                                    className="w-full rounded-xl border-2 px-3 py-2 text-sm bg-white"
                                >
                                    <option value="">— Seleccionar servidor —</option>
                                    {vpsList.map((v) => (
                                        <option key={v.id} value={v.id}>
                                            {v.name} {v.ipAddress ? `(${v.ipAddress})` : ""}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium flex items-center gap-1">
                                    <Users className="h-3.5 w-3.5" /> Cliente
                                </label>
                                <select
                                    value={clientId}
                                    onChange={(e) => setClientId(e.target.value)}
                                    className="w-full rounded-xl border-2 px-3 py-2 text-sm bg-white"
                                >
                                    <option value="">— Sin cliente / inferir después —</option>
                                    {clients.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleCreate}
                        disabled={!probe || saving}
                        className="rounded-xl bg-gradient-to-r from-violet-500 to-purple-600"
                    >
                        {saving ? <RotateCw className="h-4 w-4 animate-spin mr-2" /> : null}
                        Registrar servicio
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
