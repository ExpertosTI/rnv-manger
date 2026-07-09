"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Bell, X, CheckCheck, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { notifications as notificationsApi, type Notification } from "@/lib/api";

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const data = await notificationsApi.list();
      if (data.success) {
        setNotifications(data.data);
        setUnreadCount(data.unreadCount);
      }
    } catch (e) {
      console.error("Error fetching notifications:", e);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAllRead = async () => {
    try {
      await notificationsApi.markRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error("Error marking notifications as read:", e);
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Ahora";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  const typeColors: Record<string, string> = {
    alert: "bg-red-500",
    warning: "bg-amber-500",
    success: "bg-emerald-500",
    info: "bg-blue-500",
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors"
      >
        <Bell size={20} className="text-gray-600" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-2xl border-2 border-gray-100 z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Notificaciones</h3>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                    title="Marcar todas como leídas"
                  >
                    <CheckCheck size={16} className="text-gray-500" />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X size={16} className="text-gray-500" />
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <Bell className="mx-auto mb-2 opacity-50" size={32} />
                  <p className="text-sm">Sin notificaciones</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const serviceId = n.metadata?.serviceId as string | undefined;
                  const vpsId = n.metadata?.vpsId as string | undefined;
                  const href = serviceId ? `/services/${serviceId}` : vpsId ? `/vps/${vpsId}` : null;
                  const inner = (
                    <>
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${typeColors[n.type] || "bg-gray-400"}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm flex items-center gap-1 ${!n.isRead ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                          {n.type === "alert" && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                          {n.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(n.createdAt)}</span>
                    </>
                  );
                  return href ? (
                    <Link
                      key={n.id}
                      href={href}
                      onClick={() => setIsOpen(false)}
                      className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-violet-50/50 transition-colors ${!n.isRead ? "bg-red-50/20" : ""}`}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${!n.isRead ? "bg-violet-50/30" : ""}`}
                    >
                      {inner}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
