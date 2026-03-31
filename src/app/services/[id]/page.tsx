"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Service {
    id: string;
    name: string;
    type: string;
    port?: number;
    url?: string;
    configFile?: string;
    monthlyCost: number;
    status: string;
    resourceUsage?: any;
    vps?: { id: string; name: string; ipAddress: string } | null;
    client?: { id: string; name: string } | null;
    createdAt: string;
    updatedAt: string;
}

interface Client {
    id: string;
    name: string;
}

interface VPS {
    id: string;
    name: string;
    ipAddress: string;
}

export default function ServiceDetailPage() {
    const params = useParams();
    const router = useRouter();
    const serviceId = params.id as string;

    const [service, setService] = useState<Service | null>(null);
    const [clients, setClients] = useState<Client[]>([]);
    const [vpsList, setVpsList] = useState<VPS[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        name: "",
        type: "odoo",
        url: "",
        port: 0,
        monthlyCost: 0,
        configFile: "",
        clientId: "",
        vpsId: "",
        status: "running",
    });

    useEffect(() => {
        fetchService();
        fetchClients();
        fetchVPS();
    }, [serviceId]);

    const fetchService = async () => {
        try {
            const res = await fetch(`/api/services/${serviceId}`);
            const data = await res.json();
            if (data.success) {
                setService(data.data);
                setForm({
                    name: data.data.name,
                    type: data.data.type,
                    url: data.data.url || "",
                    port: data.data.port || 0,
                    monthlyCost: data.data.monthlyCost || 0,
                    configFile: data.data.configFile || "",
                    clientId: data.data.client?.id || "",
                    vpsId: data.data.vps?.id || "",
                    status: data.data.status || "running",
                });
            }
        } catch (err) {
            console.error("Error fetching service:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchClients = async () => {
        try {
            const res = await fetch("/api/clients");
            const data = await res.json();
            if (data.success) {
                setClients(data.data);
            }
        } catch (err) {
            console.error("Error fetching clients:", err);
        }
    };

    const fetchVPS = async () => {
        try {
            const res = await fetch("/api/vps");
            const data = await res.json();
            if (data.success) {
                setVpsList(data.data);
            }
        } catch (err) {
            console.error("Error fetching VPS:", err);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/services/${serviceId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (data.success) {
                setService(data.data);
                setEditing(false);
                fetchService(); // Reload with relations
            }
        } catch (err) {
            console.error("Error saving service:", err);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this service?")) return;

        try {
            const res = await fetch(`/api/services/${serviceId}`, {
                method: "DELETE",
            });
            const data = await res.json();
            if (data.success) {
                router.push(service?.vps ? `/vps/${service.vps.id}` : "/services");
            }
        } catch (err) {
            console.error("Error deleting service:", err);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 text-white p-8 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-cyan-500 border-t-transparent"></div>
            </div>
        );
    }

    if (!service) {
        return (
            <div className="min-h-screen bg-gray-900 text-white p-8">
                <p>Service not found</p>
                <Link href="/services" className="text-cyan-400 hover:underline">← Back to Services</Link>
            </div>
        );
    }

    const serviceUrl = service.url || `https://${service.name}.renace.tech`;

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <Link href={service.vps ? `/vps/${service.vps.id}` : "/services"} className="text-gray-400 hover:text-white">
                        ← Back
                    </Link>
                    <h1 className="text-3xl font-bold">{service.name}</h1>
                    <span className={`px-3 py-1 text-xs rounded-full ${service.type === "odoo" ? "bg-purple-500/20 text-purple-400" :
                            service.type === "web" ? "bg-blue-500/20 text-blue-400" :
                                service.type === "api" ? "bg-orange-500/20 text-orange-400" :
                                    service.type === "database" ? "bg-green-500/20 text-green-400" :
                                        "bg-gray-500/20 text-gray-400"
                        }`}>
                        {service.type.toUpperCase()}
                    </span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setEditing(!editing)}
                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg transition"
                    >
                        {editing ? "Cancel" : "Edit"}
                    </button>
                    <button
                        onClick={handleDelete}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition"
                    >
                        Delete
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Service Info */}
                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <h2 className="text-xl font-semibold mb-4">Service Details</h2>

                    {editing ? (
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-gray-400">Name (Subdomain)</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                                />
                                <p className="text-xs text-gray-500 mt-1">→ {form.name}.renace.tech</p>
                            </div>
                            <div>
                                <label className="text-sm text-gray-400">Type</label>
                                <select
                                    value={form.type}
                                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                                >
                                    <option value="odoo">Odoo</option>
                                    <option value="web">Web</option>
                                    <option value="api">API</option>
                                    <option value="database">Database</option>
                                    <option value="storage">Storage</option>
                                    <option value="ai">AI</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm text-gray-400">Custom URL (optional)</label>
                                <input
                                    type="url"
                                    value={form.url}
                                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                                    placeholder="https://..."
                                    className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-gray-400">Port</label>
                                    <input
                                        type="number"
                                        value={form.port || ""}
                                        onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 0 })}
                                        className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-400">Cost ($/mo)</label>
                                    <input
                                        type="number"
                                        value={form.monthlyCost || ""}
                                        onChange={(e) => setForm({ ...form, monthlyCost: parseFloat(e.target.value) || 0 })}
                                        className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-sm text-gray-400">Config File Path</label>
                                <input
                                    type="text"
                                    value={form.configFile}
                                    onChange={(e) => setForm({ ...form, configFile: e.target.value })}
                                    placeholder="/etc/nginx/sites-available/..."
                                    className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-sm text-gray-400">Assign to VPS</label>
                                <select
                                    value={form.vpsId}
                                    onChange={(e) => setForm({ ...form, vpsId: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                                >
                                    <option value="">-- No VPS --</option>
                                    {vpsList.map((v) => (
                                        <option key={v.id} value={v.id}>{v.name} ({v.ipAddress})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm text-gray-400">Assign to Client</label>
                                <select
                                    value={form.clientId}
                                    onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                                >
                                    <option value="">-- No Client --</option>
                                    {clients.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="w-full py-2 bg-green-600 hover:bg-green-700 rounded-lg transition disabled:opacity-50"
                            >
                                {saving ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* URL Link */}
                            <a
                                href={serviceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-center py-3 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-lg hover:opacity-90 transition font-semibold"
                            >
                                🔗 Open {serviceUrl}
                            </a>

                            <div className="space-y-3 mt-6">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Type</span>
                                    <span className="capitalize">{service.type}</span>
                                </div>
                                {service.port && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Port</span>
                                        <span className="font-mono">{service.port}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Status</span>
                                    <span className={`${service.status === "running" ? "text-green-400" :
                                            service.status === "stopped" ? "text-red-400" :
                                                "text-yellow-400"
                                        }`}>
                                        {service.status}
                                    </span>
                                </div>
                                <hr className="border-gray-700" />
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Monthly Cost</span>
                                    <span className="text-green-400 font-semibold">${service.monthlyCost}/mo</span>
                                </div>
                                <hr className="border-gray-700" />
                                <div className="flex justify-between">
                                    <span className="text-gray-400">VPS</span>
                                    {service.vps ? (
                                        <Link href={`/vps/${service.vps.id}`} className="text-cyan-400 hover:underline">
                                            {service.vps.name}
                                        </Link>
                                    ) : (
                                        <span className="text-yellow-400">Not assigned</span>
                                    )}
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Client</span>
                                    {service.client ? (
                                        <Link href={`/clients/${service.client.id}`} className="text-cyan-400 hover:underline">
                                            {service.client.name}
                                        </Link>
                                    ) : (
                                        <span className="text-yellow-400">Not assigned</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Config File */}
                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <h2 className="text-xl font-semibold mb-4">Configuration</h2>

                    {service.configFile ? (
                        <div className="space-y-4">
                            <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
                                <p className="text-gray-400 text-xs mb-2">Config Path:</p>
                                <p className="text-cyan-400 break-all">{service.configFile}</p>
                            </div>
                            <Link
                                href={`/config-editor?path=${encodeURIComponent(service.configFile)}&vps=${service.vps?.id}`}
                                className="block text-center py-2 border border-cyan-500 text-cyan-400 rounded-lg hover:bg-cyan-500/10 transition"
                            >
                                📝 Open Config Editor
                            </Link>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            <p>No config file attached</p>
                            <button
                                onClick={() => setEditing(true)}
                                className="mt-4 text-cyan-400 hover:underline"
                            >
                                + Add config path
                            </button>
                        </div>
                    )}

                    {/* Quick Info */}
                    <div className="mt-6 pt-6 border-t border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-400 mb-3">Quick SSH Commands</h3>
                        {service.vps && (
                            <div className="space-y-2">
                                <div className="bg-gray-900 rounded p-2 font-mono text-xs text-gray-300">
                                    ssh root@{service.vps.ipAddress}
                                </div>
                                {service.type === "odoo" && (
                                    <div className="bg-gray-900 rounded p-2 font-mono text-xs text-gray-300">
                                        docker logs {service.name}_odoo
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
