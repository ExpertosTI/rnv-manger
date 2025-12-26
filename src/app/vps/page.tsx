"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Server, Plus, Search, RefreshCw, Copy, MoreHorizontal, Check, AlertCircle, Clock, Zap, Terminal, Power, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";

interface VPSItem {
    id: string;
    name: string;
    ipAddress: string;
    provider: string;
    status: string;
    plan?: string;
    datacenter?: string;
}

export default function VPSPage() {
    const [vpsList, setVpsList] = useState<VPSItem[]>([]);
    const [filteredList, setFilteredList] = useState<VPSItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [lastSync, setLastSync] = useState<Date | null>(null);
    const { addToast } = useToast();

    const fetchVPS = useCallback(async (forceRefresh = false) => {
        setIsLoading(true);
        setError(null);

        try {
            const url = forceRefresh ? "/api/hostinger/vps?refresh=true" : "/api/hostinger/vps";
            const res = await fetch(url);
            const data = await res.json();

            if (data.success && data.data) {
                setVpsList(data.data);
                setFilteredList(data.data);
                setLastSync(new Date());
                addToast(`${data.data.length} servidores cargados`, "success");
            } else {
                setError(data.error);
                addToast(data.error || "Error al cargar", "error");
            }
        } catch (err: any) {
            setError(err.message);
            addToast("Error de conexión", "error");
        } finally {
            setIsLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        fetchVPS();
    }, [fetchVPS]);

    useEffect(() => {
        if (searchTerm) {
            setFilteredList(vpsList.filter(vps =>
                vps.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                vps.ipAddress.includes(searchTerm)
            ));
        } else {
            setFilteredList(vpsList);
        }
    }, [searchTerm, vpsList]);

    const copyIP = (ip: string, id: string) => {
        navigator.clipboard.writeText(ip);
        setCopiedId(id);
        addToast("IP copiada", "success", 2000);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const runningCount = vpsList.filter(v => v.status === "running").length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Servidores VPS</h1>
                    <p className="text-gray-500 mt-1">
                        {isLoading ? "Cargando..." : `${vpsList.length} servidores • ${runningCount} activos`}
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button
                        variant="outline"
                        className="gap-2 border-2 hover:border-violet-300 hover:bg-violet-50 rounded-xl"
                        onClick={() => fetchVPS(true)}
                        disabled={isLoading}
                    >
                        <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
                        {isLoading ? "Sincronizando..." : "Sincronizar"}
                    </Button>
                    <Button className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg shadow-purple-200 rounded-xl">
                        <Plus size={16} />
                        Agregar VPS
                    </Button>
                </div>
            </div>

            {/* Status Bar */}
            {lastSync && (
                <div className="flex items-center justify-between bg-white rounded-xl border-2 border-gray-100 px-5 py-3 shadow-sm">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2 text-gray-500">
                            <Clock size={14} />
                            <span className="text-sm">Última sync: {lastSync.toLocaleTimeString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1.5 text-green-600 bg-green-50 px-3 py-1 rounded-full text-sm font-medium">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                {runningCount} activos
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Search */}
            <div className="flex gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Buscar por nombre o IP..."
                        className="pl-11 h-12 border-2 border-gray-200 focus:border-violet-400 rounded-xl bg-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Main Content */}
            <AnimatePresence mode="wait">
                {isLoading && vpsList.length === 0 ? (
                    <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="bg-white rounded-2xl border-2 border-gray-100 p-16 text-center"
                    >
                        <RefreshCw className="w-12 h-12 text-violet-500 animate-spin mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Cargando servidores...</h3>
                        <p className="text-gray-500">Conectando con Hostinger API</p>
                    </motion.div>
                ) : error && vpsList.length === 0 ? (
                    <motion.div
                        key="error"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="bg-red-50 rounded-2xl border-2 border-red-200 p-12 text-center"
                    >
                        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-red-900 mb-2">Error al cargar</h3>
                        <p className="text-red-600 mb-6">{error}</p>
                        <Button onClick={() => fetchVPS(true)} className="bg-red-500 hover:bg-red-600 rounded-xl">
                            Reintentar
                        </Button>
                    </motion.div>
                ) : filteredList.length > 0 ? (
                    <motion.div
                        key="grid"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                    >
                        {filteredList.map((vps, index) => (
                            <motion.div
                                key={vps.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.03 }}
                                className="bg-white rounded-2xl border-2 border-gray-100 p-6 hover:border-violet-200 hover:shadow-xl hover:shadow-violet-50 transition-all group"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <span className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${vps.status === "running" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                                        <span className={`w-2 h-2 rounded-full ${vps.status === "running" ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
                                        {vps.status === "running" ? "Ejecutando" : vps.status}
                                    </span>
                                    <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <MoreHorizontal size={16} />
                                    </button>
                                </div>

                                <div className="flex items-center gap-4 mb-6">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${vps.status === "running" ? "bg-violet-100" : "bg-gray-100"}`}>
                                        <Server className={`w-6 h-6 ${vps.status === "running" ? "text-violet-600" : "text-gray-400"}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-gray-900 truncate">{vps.name}</h3>
                                        <p className="text-sm text-gray-500">{vps.plan || "KVM"} • {vps.datacenter || "España"}</p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 mb-6">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase font-bold text-gray-400">Dirección IP</span>
                                        <code className="text-sm font-mono text-gray-700">{vps.ipAddress}</code>
                                    </div>
                                    <button
                                        onClick={() => copyIP(vps.ipAddress, vps.id)}
                                        className="p-2 rounded-lg hover:bg-violet-100 text-gray-400 hover:text-violet-600 transition-colors"
                                    >
                                        {copiedId === vps.id ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                                    </button>
                                </div>

                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" className="flex-1 gap-2 text-xs rounded-xl border-2 hover:border-violet-300">
                                        <Terminal size={14} />
                                        SSH
                                    </Button>
                                    <Button variant="outline" size="sm" className="flex-1 gap-2 text-xs rounded-xl border-2 hover:border-violet-300">
                                        <Power size={14} />
                                        Reiniciar
                                    </Button>
                                    <Button variant="outline" size="sm" className="gap-2 text-xs rounded-xl border-2 hover:border-violet-300">
                                        <ExternalLink size={14} />
                                    </Button>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                ) : !isLoading && vpsList.length > 0 && (
                    <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="bg-white rounded-3xl border-2 border-dashed border-gray-200 p-16 text-center"
                    >
                        <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-gray-700 mb-2">Sin resultados</h3>
                        <p className="text-gray-500">No hay servidores que coincidan con &quot;{searchTerm}&quot;</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
