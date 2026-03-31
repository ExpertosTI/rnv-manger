"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UsersRound, Plus, Shield, Mail, Clock, MoreVertical,
  Trash2, Edit, Key, CheckCircle, XCircle, RefreshCw, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  role: string;
  avatar: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  _count: { sessions: number; auditLogs: number };
}

const roleColors: Record<string, string> = {
  superadmin: "bg-violet-100 text-violet-700",
  admin: "bg-blue-100 text-blue-700",
  viewer: "bg-gray-100 text-gray-700",
};

const roleLabels: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Administrador",
  viewer: "Solo Lectura",
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({ username: "", email: "", password: "", name: "", role: "admin" });
  const [creating, setCreating] = useState(false);
  const { addToast } = useToast();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (data.success) setUsers(data.data);
    } catch (e) {
      addToast("Error al cargar usuarios", "error");
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        addToast("Usuario creado exitosamente", "success");
        setShowCreate(false);
        setFormData({ username: "", email: "", password: "", name: "", role: "admin" });
        fetchUsers();
      } else {
        addToast(data.error || "Error al crear usuario", "error");
      }
    } catch (e) {
      addToast("Error de conexión", "error");
    }
    setCreating(false);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Nunca";
    return new Date(dateStr).toLocaleDateString("es-ES", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl text-white">
              <UsersRound size={24} />
            </div>
            Gestión de Usuarios
          </h1>
          <p className="text-gray-500 mt-1">Administra los accesos y roles del sistema</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchUsers} variant="outline" className="gap-2">
            <RefreshCw size={16} /> Actualizar
          </Button>
          <Button
            onClick={() => setShowCreate(true)}
            className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white"
          >
            <Plus size={16} /> Nuevo Usuario
          </Button>
        </div>
      </div>

      {/* Users Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-100 rounded-2xl p-6 animate-pulse h-48" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {users.map((user, i) => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="border-2 border-gray-100 hover:border-violet-200 transition-all hover:shadow-lg group">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg shadow-md">
                          {user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{user.name}</h3>
                          <p className="text-sm text-gray-500">@{user.username}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {user.isActive ? (
                          <CheckCircle size={16} className="text-emerald-500" />
                        ) : (
                          <XCircle size={16} className="text-red-400" />
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail size={14} />
                        <span className="truncate">{user.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Clock size={14} />
                        <span>Último acceso: {formatDate(user.lastLoginAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${roleColors[user.role] || "bg-gray-100 text-gray-700"}`}>
                        <Shield size={12} className="inline mr-1" />
                        {roleLabels[user.role] || user.role}
                      </span>
                      <div className="flex gap-1 text-xs text-gray-400">
                        <span>{user._count.sessions} sesiones</span>
                        <span>•</span>
                        <span>{user._count.auditLogs} acciones</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Create User Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl border-2 border-gray-100 w-full max-w-md overflow-hidden"
            >
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-900">Crear Nuevo Usuario</h2>
                <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreate} className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Nombre completo</label>
                  <Input
                    placeholder="Juan Pérez"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Usuario</label>
                  <Input
                    placeholder="juanperez"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <Input
                    type="email"
                    placeholder="juan@renace.tech"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Contraseña</label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Rol</label>
                  <select
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm bg-white focus:border-violet-400 focus:outline-none"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  >
                    <option value="superadmin">Super Admin</option>
                    <option value="admin">Administrador</option>
                    <option value="viewer">Solo Lectura</option>
                  </select>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={creating}
                    className="flex-1 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white"
                  >
                    {creating ? <RefreshCw className="animate-spin mr-2" size={16} /> : <Plus size={16} className="mr-2" />}
                    Crear Usuario
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
