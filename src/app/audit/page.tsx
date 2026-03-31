"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Activity, Clock, Search, Filter, RefreshCw,
  ChevronLeft, ChevronRight, User, Server, Database,
  CreditCard, Settings, Terminal, Download, AlertTriangle,
  CheckCircle, XCircle, LogIn, LogOut, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userId: string | null;
  user: { id: string; name: string; username: string; avatar: string | null } | null;
  createdAt: string;
}

interface AuditStats {
  totals: { total: number; today: number; week: number; month: number };
  actionBreakdown: { action: string; count: number }[];
  entityBreakdown: { entity: string; count: number }[];
  recentActivity: AuditLog[];
}

const actionIcons: Record<string, React.ElementType> = {
  CREATE: CheckCircle,
  UPDATE: RefreshCw,
  DELETE: XCircle,
  LOGIN: LogIn,
  LOGOUT: LogOut,
  SSH_COMMAND: Terminal,
  BACKUP: Download,
  SYNC: RefreshCw,
  SETTINGS_CHANGE: Settings,
  MONITOR: Eye,
  API_ACCESS: Activity,
};

const actionColors: Record<string, string> = {
  CREATE: "text-emerald-600 bg-emerald-50",
  UPDATE: "text-blue-600 bg-blue-50",
  DELETE: "text-red-600 bg-red-50",
  LOGIN: "text-violet-600 bg-violet-50",
  LOGOUT: "text-gray-600 bg-gray-50",
  SSH_COMMAND: "text-amber-600 bg-amber-50",
  BACKUP: "text-cyan-600 bg-cyan-50",
  SYNC: "text-indigo-600 bg-indigo-50",
  SETTINGS_CHANGE: "text-orange-600 bg-orange-50",
  MONITOR: "text-teal-600 bg-teal-50",
};

const entityIcons: Record<string, React.ElementType> = {
  client: User,
  vps: Server,
  service: Database,
  payment: CreditCard,
  user: User,
  system: Terminal,
  backup: Download,
  invoice: CreditCard,
  settings: Settings,
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterEntity, setFilterEntity] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "30" });
    if (search) params.set("search", search);
    if (filterAction) params.set("action", filterAction);
    if (filterEntity) params.set("entity", filterEntity);

    try {
      const res = await fetch(`/api/audit?${params}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.data);
        setTotalPages(data.pagination.pages);
      }
    } catch (e) {
      console.error("Error fetching audit logs:", e);
    }
    setLoading(false);
  }, [page, search, filterAction, filterEntity]);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/audit/stats");
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (e) {
      console.error("Error fetching audit stats:", e);
    }
  };

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { fetchStats(); }, []);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Ahora mismo";
    if (mins < 60) return `Hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Hace ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `Hace ${days}d`;
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl text-white">
              <Shield size={24} />
            </div>
            Auditoría Global
          </h1>
          <p className="text-gray-500 mt-1">Registro completo de todas las acciones del sistema</p>
        </div>
        <Button onClick={() => { fetchLogs(); fetchStats(); }} variant="outline" className="gap-2">
          <RefreshCw size={16} /> Actualizar
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total de Eventos", value: stats.totals.total, icon: Activity, color: "violet" },
            { label: "Hoy", value: stats.totals.today, icon: Clock, color: "emerald" },
            { label: "Esta Semana", value: stats.totals.week, icon: AlertTriangle, color: "blue" },
            { label: "Este Mes", value: stats.totals.month, icon: Shield, color: "amber" },
          ].map((stat, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <Card className="border-2 border-gray-100 hover:border-gray-200 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-gray-500">{stat.label}</p>
                      <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value.toLocaleString()}</p>
                    </div>
                    <div className={`p-2.5 rounded-xl bg-${stat.color}-50`}>
                      <stat.icon size={20} className={`text-${stat.color}-600`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="border-2 border-gray-100">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <Input
                placeholder="Buscar en logs..."
                className="pl-10"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select
              className="px-3 py-2 border-2 border-gray-200 rounded-lg text-sm bg-white focus:border-violet-400 focus:outline-none"
              value={filterAction}
              onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
            >
              <option value="">Todas las acciones</option>
              {["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "SSH_COMMAND", "BACKUP", "SYNC", "SETTINGS_CHANGE"].map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select
              className="px-3 py-2 border-2 border-gray-200 rounded-lg text-sm bg-white focus:border-violet-400 focus:outline-none"
              value={filterEntity}
              onChange={(e) => { setFilterEntity(e.target.value); setPage(1); }}
            >
              <option value="">Todas las entidades</option>
              {["client", "vps", "service", "payment", "user", "system", "backup", "invoice", "settings"].map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card className="border-2 border-gray-100">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-gray-400">
              <RefreshCw className="animate-spin mx-auto mb-3" size={32} />
              <p>Cargando logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Shield className="mx-auto mb-3 opacity-50" size={48} />
              <p className="text-lg font-medium">Sin registros de auditoría</p>
              <p className="text-sm">Las acciones del sistema aparecerán aquí</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              <AnimatePresence>
                {logs.map((log, i) => {
                  const ActionIcon = actionIcons[log.action] || Activity;
                  const EntityIcon = entityIcons[log.entity] || Activity;
                  const colorClass = actionColors[log.action] || "text-gray-600 bg-gray-50";
                  return (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="flex items-center gap-4 p-4 hover:bg-gray-50/50 transition-colors"
                    >
                      <div className={`p-2 rounded-lg ${colorClass}`}>
                        <ActionIcon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{log.description}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <EntityIcon size={12} />
                            {log.entity}
                          </span>
                          {log.user && (
                            <span className="text-xs text-gray-500">por {log.user.name}</span>
                          )}
                          {log.ipAddress && log.ipAddress !== "unknown" && (
                            <span className="text-xs text-gray-400">{log.ipAddress}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
                          {log.action}
                        </span>
                        <p className="text-xs text-gray-400 mt-1">{formatDate(log.createdAt)}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <span className="text-sm text-gray-600">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}
