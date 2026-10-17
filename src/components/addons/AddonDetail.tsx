"use client";

import { useEffect, useState } from "react";
import {
    ArchiveRestore,
    Download,
    FolderOpen,
    FolderGit2,
    GitCommitHorizontal,
    Loader2,
    SquareArrowOutUpRight,
    Upload,
} from "lucide-react";
import { GitBadge } from "@/components/addons/GitBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { downloadAddonsZip, fetchAddonsDetail, runAddonsAction } from "@/lib/addons/client";
import { formatBytes } from "@/lib/addons/format";
import { COMMON_AREAS, type ModuleDetail, type ModuleSummary } from "@/lib/addons/types";

type DialogKind = "init" | "commit" | "push" | "move" | "archive" | "restore" | null;

const ESTADO_LABEL: Record<string, string> = {
    keeper: "Keeper",
    archivado: "Archivado",
    merge_candidate: "Candidato a fusionar",
};

function splitClients(value: string): string[] {
    return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

export function AddonDetail({
    root,
    relativePath,
    summary,
    areas,
    tipos,
    clientes,
    onChanged,
}: {
    root: string;
    relativePath: string;
    summary: ModuleSummary | null;
    areas: string[];
    tipos: string[];
    clientes: string[];
    onChanged: () => void;
}) {
    const { addToast } = useToast();
    const [detail, setDetail] = useState<ModuleDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [dialog, setDialog] = useState<DialogKind>(null);
    const [commitMessage, setCommitMessage] = useState("Actualización de addon Odoo");
    const [remote, setRemote] = useState("git@github.com:renace/");
    const [motivo, setMotivo] = useState("");
    const [reemplazadoPor, setReemplazadoPor] = useState("");
    const [destKind, setDestKind] = useState<"comunes" | "clientes" | "revisar">("comunes");
    const [area, setArea] = useState(areas[0] || "pos");
    const [tipo, setTipo] = useState(tipos[0] || "");
    const [cliente, setCliente] = useState(clientes[0] || "");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchAddonsDetail(root, relativePath)
            .then((response) => {
                if (cancelled) return;
                if (!response.available || !response.detail) {
                    setDetail(null);
                    if (response.message) addToast(response.message, "warning");
                    return;
                }
                setDetail(response.detail);
                const mapa = response.detail.module.mapa;
                if (mapa?.reemplazadoPor) setReemplazadoPor(mapa.reemplazadoPor);
            })
            .catch(() => {
                if (!cancelled) addToast("No se pudo leer el módulo", "error");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [root, relativePath, addToast]);

    const run = async (action: string, extra: Record<string, string | boolean | undefined>) => {
        setBusy(true);
        try {
            const result = await runAddonsAction(root, action, {
                relativePath,
                confirm: true,
                ...extra,
            });
            if (!result.ok) {
                addToast(result.message || "La acción no se completó", "error");
                return;
            }
            addToast(result.message, "success");
            setDialog(null);
            onChanged();
        } catch {
            addToast("Error ejecutando la acción", "error");
        } finally {
            setBusy(false);
        }
    };

    const destination = () => {
        if (destKind === "revisar") return "_revisar";
        if (destKind === "comunes") return `comunes/${area.trim()}`;
        return `clientes/${tipo.trim()}/${cliente.trim()}`;
    };

    const addon = detail?.module || summary;
    const areaOptions = areas.length > 0 ? areas : [...COMMON_AREAS];

    return (
        <div className="rounded-2xl border-2 border-gray-100 bg-white shadow-sm p-5 space-y-5 min-h-[420px]">
            {loading && (
                <div className="grid place-items-center py-16 text-violet-600">
                    <Loader2 className="w-6 h-6 animate-spin" />
                </div>
            )}
            {!loading && addon && (
                <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-xs uppercase tracking-wide text-violet-600 font-semibold">
                                {addon.category === "comunes" ? `Común · ${addon.area}` : addon.category === "clientes" ? `${addon.tipoNegocio} · ${addon.cliente}` : addon.category === "archivados" ? "Archivado" : addon.category === "revisar" ? "A revisar" : "Carpeta"}
                            </p>
                            <h2 className="text-2xl font-bold truncate">{addon.manifestName || addon.name}</h2>
                            <p className="text-sm text-muted-foreground break-all">{addon.relativePath || relativePath}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {addon.git && <GitBadge badge={addon.git.badge} label={addon.git.badgeLabel} />}
                            {addon.estado && (
                                <span className="inline-flex items-center rounded-full bg-violet-50 text-violet-800 border border-violet-200 px-2.5 py-1 text-xs font-semibold">
                                    {ESTADO_LABEL[addon.estado] || addon.estado}
                                </span>
                            )}
                        </div>
                    </div>

                    {detail && (
                        <>
                            <div className="grid sm:grid-cols-3 gap-3 text-sm">
                                <div className="rounded-xl bg-gray-50 p-3">
                                    <p className="text-xs text-muted-foreground">Archivos</p>
                                    <p className="font-semibold">{detail.fileCount} · {formatBytes(detail.totalBytes)}</p>
                                </div>
                                <div className="rounded-xl bg-gray-50 p-3">
                                    <p className="text-xs text-muted-foreground">Versiones Odoo</p>
                                    <p className="font-semibold">{addon.versions.join(", ") || "sin versión"}</p>
                                </div>
                                <div className="rounded-xl bg-gray-50 p-3">
                                    <p className="text-xs text-muted-foreground">Licencia / autor</p>
                                    <p className="font-semibold truncate">{detail.manifests[0]?.manifest?.license || "—"} · {detail.manifests[0]?.manifest?.author || "—"}</p>
                                </div>
                            </div>

                            <GitPanel git={detail.git} />

                            {detail.manifests.map((item) => (
                                <div key={item.relativePath} className="rounded-xl border border-gray-100 p-4 space-y-2">
                                    <p className="text-sm font-semibold">
                                        Manifest {item.version || "único"} <span className="text-muted-foreground font-normal">{item.manifest?.version}</span>
                                    </p>
                                    <p className="text-sm">{item.manifest?.summary || item.manifest?.description || "Sin resumen"}</p>
                                    {item.manifest?.description && item.manifest.description !== item.manifest.summary && (
                                        <pre className="text-xs whitespace-pre-wrap bg-gray-50 rounded-lg p-3 max-h-40 overflow-auto">{item.manifest.description}</pre>
                                    )}
                                    <div className="flex flex-wrap gap-1.5">
                                        {(item.manifest?.depends || []).map((dep) => (
                                            <span key={dep} className="text-[11px] rounded-md bg-violet-50 text-violet-800 px-2 py-0.5">{dep}</span>
                                        ))}
                                    </div>
                                    {(item.manifest?.data.length || 0) > 0 && (
                                        <p className="text-xs text-muted-foreground break-all">
                                            Data: {item.manifest?.data.join(", ")}
                                        </p>
                                    )}
                                </div>
                            ))}

                            <MapaBlock addon={addon} />

                            {detail.readme && (
                                <section>
                                    <h3 className="font-semibold mb-2">{detail.readme.name}</h3>
                                    <pre className="text-xs whitespace-pre-wrap bg-gray-50 rounded-xl p-3 max-h-48 overflow-auto">{detail.readme.text}</pre>
                                </section>
                            )}
                            {detail.motivo && (
                                <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                                    <h3 className="font-semibold text-amber-950 mb-1">{detail.motivo.name}</h3>
                                    <pre className="text-xs whitespace-pre-wrap text-amber-950">{detail.motivo.text}</pre>
                                </section>
                            )}
                        </>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => run("open", { confirm: false })}>
                            <FolderOpen className="w-4 h-4 mr-1.5" /> Abrir en Finder
                        </Button>
                        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => run("editor", { confirm: false })}>
                            <SquareArrowOutUpRight className="w-4 h-4 mr-1.5" /> Abrir en editor
                        </Button>
                        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setDialog("init")}>
                            <FolderGit2 className="w-4 h-4 mr-1.5" /> Iniciar Git
                        </Button>
                        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setDialog("commit")}>
                            <GitCommitHorizontal className="w-4 h-4 mr-1.5" /> Commit
                        </Button>
                        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setDialog("push")}>
                            <Upload className="w-4 h-4 mr-1.5" /> Subir a GitHub
                        </Button>
                        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setDialog("move")}>
                            Mover
                        </Button>
                        {addon.category === "archivados" ? (
                            <Button type="button" size="sm" disabled={busy} onClick={() => setDialog("restore")} className="bg-emerald-600 hover:bg-emerald-700">
                                <ArchiveRestore className="w-4 h-4 mr-1.5" /> Restaurar
                            </Button>
                        ) : (
                            <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => setDialog("archive")}>
                                Archivar
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={async () => {
                                setBusy(true);
                                try {
                                    const result = await downloadAddonsZip(root, relativePath);
                                    addToast(result.message, result.ok ? "success" : "error");
                                } finally {
                                    setBusy(false);
                                }
                            }}
                        >
                            <Download className="w-4 h-4 mr-1.5" /> Exportar ZIP
                        </Button>
                    </div>
                </>
            )}

            <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
                <DialogContent className="bg-white">
                    <DialogHeader>
                        <DialogTitle>
                            {dialog === "init" && "Iniciar repositorio Git"}
                            {dialog === "commit" && "Crear commit"}
                            {dialog === "push" && "Subir a GitHub"}
                            {dialog === "move" && "Mover módulo"}
                            {dialog === "archive" && "Archivar módulo"}
                            {dialog === "restore" && "Restaurar módulo"}
                        </DialogTitle>
                        <DialogDescription>
                            {dialog === "push"
                                ? "Se usa el git del sistema y tu clave SSH. RNV Manager no guarda tokens."
                                : "Confirma para aplicar el cambio en la carpeta y en mapa.csv."}
                        </DialogDescription>
                    </DialogHeader>
                    {dialog === "commit" && (
                        <Input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} />
                    )}
                    {dialog === "push" && (
                        <Input value={remote} onChange={(event) => setRemote(event.target.value)} spellCheck={false} placeholder="git@github.com:usuario/repo.git" />
                    )}
                    {(dialog === "move" || dialog === "restore") && (
                        <div className="space-y-3">
                            <select className="h-10 w-full rounded-xl border-2 border-gray-200 px-3 text-sm" value={destKind} onChange={(event) => setDestKind(event.target.value as typeof destKind)}>
                                <option value="comunes">comunes / área</option>
                                <option value="clientes">clientes / tipo / cliente</option>
                                <option value="revisar">_revisar</option>
                            </select>
                            {destKind === "comunes" && (
                                <select className="h-10 w-full rounded-xl border-2 border-gray-200 px-3 text-sm" value={area} onChange={(event) => setArea(event.target.value)}>
                                    {areaOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                                </select>
                            )}
                            {destKind === "clientes" && (
                                <div className="grid grid-cols-2 gap-2">
                                    <Input value={tipo} onChange={(event) => setTipo(event.target.value)} placeholder="tipo de negocio" list="addons-tipos" />
                                    <Input value={cliente} onChange={(event) => setCliente(event.target.value)} placeholder="cliente" list="addons-clientes" />
                                    <datalist id="addons-tipos">{tipos.map((item) => <option key={item} value={item} />)}</datalist>
                                    <datalist id="addons-clientes">{clientes.map((item) => <option key={item} value={item} />)}</datalist>
                                </div>
                            )}
                        </div>
                    )}
                    {dialog === "archive" && (
                        <div className="space-y-2">
                            <textarea
                                className="w-full min-h-24 rounded-xl border-2 border-gray-200 p-3 text-sm"
                                value={motivo}
                                onChange={(event) => setMotivo(event.target.value)}
                                placeholder="Motivo del archivo"
                            />
                            <Input value={reemplazadoPor} onChange={(event) => setReemplazadoPor(event.target.value)} placeholder="Reemplazado por (opcional)" />
                        </div>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
                        <Button
                            type="button"
                            variant={dialog === "archive" ? "destructive" : "default"}
                            disabled={busy}
                            onClick={() => {
                                if (dialog === "init") void run("git_init", {});
                                if (dialog === "commit") void run("commit", { message: commitMessage });
                                if (dialog === "push") void run("push", { remote });
                                if (dialog === "move") void run("move", { destination: destination() });
                                if (dialog === "restore") void run("restore", { destination: destination() });
                                if (dialog === "archive") void run("archive", { motivo, reemplazadoPor });
                            }}
                        >
                            Confirmar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function GitPanel({ git }: { git: ModuleDetail["git"] }) {
    const short = git.lastCommit?.hash.slice(0, 7);
    return (
        <div className="rounded-xl border border-gray-100 p-4 text-sm space-y-1">
            <p className="font-semibold flex items-center gap-2">
                Estado Git
                <GitBadge badge={git.badge} label={git.badgeLabel} compact />
            </p>
            <p>{git.inRepo ? `Repositorio: ${git.repoRoot}` : "Todavía no hay un repositorio Git en esta carpeta ni en sus padres."}</p>
            <p>{git.hasRemote ? `Remoto: ${git.remoteUrl}` : "Sin remoto"}</p>
            {git.inRepo && (
                <p>
                    {git.hasUpstream ? `Adelantado ${git.ahead} · detrás ${git.behind}` : "Sin upstream: no consta como subido"}
                    {git.dirty ? " · hay cambios sin commit" : ""}
                </p>
            )}
            {git.lastCommit && (
                <p className="text-muted-foreground">
                    Último commit {short} · {git.lastCommit.date} · {git.lastCommit.message}
                </p>
            )}
        </div>
    );
}

function MapaBlock({ addon }: { addon: ModuleSummary }) {
    const mapa = addon.mapa;
    if (!mapa) {
        return <p className="text-sm text-muted-foreground">Este módulo no tiene fila en mapa.csv.</p>;
    }
    const clients = splitClients(mapa.clientsUsing);
    return (
        <div className="rounded-xl bg-violet-50/60 border border-violet-100 p-4 text-sm space-y-2">
            <p className="font-semibold">mapa.csv</p>
            <p>Clientes que lo usan: {clients.length > 0 ? clients.join(", ") : "—"}</p>
            {mapa.instaladoEnClientes && <p>Instalado en: {mapa.instaladoEnClientes}</p>}
            {mapa.reemplazadoPor && <p>Reemplazado por: {mapa.reemplazadoPor}</p>}
            {mapa.clientesAMigrar && <p>Clientes a migrar: {mapa.clientesAMigrar}</p>}
            {mapa.familia && <p>Familia: {mapa.familia}</p>}
        </div>
    );
}
