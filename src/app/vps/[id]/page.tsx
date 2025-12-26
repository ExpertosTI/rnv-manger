"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Terminal } from "lucide-react";

const SSHConsole = dynamic(() => import("@/components/SSHConsole"), { ssr: false });

interface Service {
    id: string;
    name: string;
    type: string;
    port?: number;
    url?: string;
    configFile?: string;
    monthlyCost: number;
    status: string;
    client?: { id: string; name: string } | null;
}

interface VPS {
    id: string;
    name: string;
    ipAddress: string;
    provider: string;
    hostingerId?: string;
    status: string;
    monthlyCost: number;
    sshUser: string;
    sshPort: number;
    client?: { id: string; name: string; email?: string } | null;
    services: Service[];
    totalServiceCost?: number;
    totalMonthlyCost?: number;
}

interface Client {
    id: string;
    name: string;
}

export default function VPSDetailPage() {
    const params = useParams();
    const router = useRouter();
    const vpsId = params.id as string;

    const [vps, setVps] = useState<VPS | null>(null);
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [showAddService, setShowAddService] = useState(false);
    const [showTerminal, setShowTerminal] = useState(false);

    // Edit form state
    const [editForm, setEditForm] = useState({
        name: "",
        monthlyCost: 0,
        clientId: "",
    });

    // New service form
    const [newService, setNewService] = useState({
        name: "",
        type: "odoo",
        url: "",
        port: 0,
        monthlyCost: 0,
        configFile: "",
    });

    useEffect(() => {
        fetchVPS();
        fetchClients();
    }, [vpsId]);

    const fetchVPS = async () => {
        try {
            const res = await fetch(`/api/vps/${vpsId}`);
            const data = await res.json();
            if (data.success) {
                setVps(data.data);
                setEditForm({
                    name: data.data.name,
                    monthlyCost: data.data.monthlyCost || 0,
                    clientId: data.data.client?.id || "",
                });
            }
        } catch (err) {
            console.error("Error fetching VPS:", err);
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

    const handleSaveVPS = async () => {
        try {
            const res = await fetch(`/api/vps/${vpsId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editForm),
            });
            const data = await res.json();
            if (data.success) {
                setVps(data.data);
                setEditing(false);
                fetchVPS(); // Reload to get updated relations
            }
        } catch (err) {
            console.error("Error saving VPS:", err);
        }
    };

    const handleAddService = async () => {
        try {
            const res = await fetch(`/api/vps/${vpsId}/services`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...newService,
                    url: newService.url || `https://${newService.name}.renace.tech`,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setShowAddService(false);
                setNewService({ name: "", type: "odoo", url: "", port: 0, monthlyCost: 0, configFile: "" });
                fetchVPS();
            }
        } catch (err) {
            console.error("Error adding service:", err);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 text-white p-8 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-cyan-500 border-t-transparent"></div>
            </div>
        );
    }

    if (!vps) {
        return (
            <div className="min-h-screen bg-gray-900 text-white p-8">
                <p>VPS not found</p>
                <Link href="/vps" className="text-cyan-400 hover:underline">← Back to VPS list</Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <Link href="/vps" className="text-gray-400 hover:text-white">
                        ← Back
                    </Link>
                    <h1 className="text-3xl font-bold">{vps.name}</h1>
                    <span className={`px-3 py-1 rounded-full text-sm ${vps.status === "running" ? "bg-green-500/20 text-green-400" :
                        vps.status === "stopped" ? "bg-red-500/20 text-red-400" :
                            "bg-yellow-500/20 text-yellow-400"
                        }`}>
                        {vps.status}
                    </span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowTerminal(!showTerminal)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition flex items-center gap-2"
                    >
                        <Terminal className="w-4 h-4" />
                        {showTerminal ? "Cerrar Terminal" : "SSH Terminal"}
                    </button>
                    <button
                        onClick={() => setEditing(!editing)}
                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg transition"
                    >
                        {editing ? "Cancel" : "Edit VPS"}
                    </button>
                </div>
            </div>

            {/* SSH Terminal */}
            {showTerminal && (
                <div className="mb-6">
                    <SSHConsole
                        host={vps.ipAddress}
                        port={vps.sshPort || 22}
                        username={vps.sshUser || "root"}
                        onClose={() => setShowTerminal(false)}
                    />
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* VPS Info Card */}
                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <h2 className="text-xl font-semibold mb-4">VPS Information</h2>

                    {editing ? (
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-gray-400">Name</label>
                                <input
                                    type="text"
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-sm text-gray-400">Monthly Cost ($)</label>
                                <input
                                    type="number"
                                    value={editForm.monthlyCost}
                                    onChange={(e) => setEditForm({ ...editForm, monthlyCost: parseFloat(e.target.value) || 0 })}
                                    className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-sm text-gray-400">Assign to Client</label>
                                <select
                                    value={editForm.clientId}
                                    onChange={(e) => setEditForm({ ...editForm, clientId: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                                >
                                    <option value="">-- No Client --</option>
                                    {clients.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <button
                                onClick={handleSaveVPS}
                                className="w-full py-2 bg-green-600 hover:bg-green-700 rounded-lg transition"
                            >
                                Save Changes
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-gray-400">IP Address</span>
                                <span className="font-mono text-cyan-400">{vps.ipAddress}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Provider</span>
                                <span>{vps.provider}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">SSH</span>
                                <span className="font-mono">{vps.sshUser}@{vps.ipAddress}:{vps.sshPort}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Hostinger ID</span>
                                <span className="font-mono text-sm">{vps.hostingerId || "N/A"}</span>
                            </div>
                            <hr className="border-gray-700 my-4" />
                            <div className="flex justify-between">
                                <span className="text-gray-400">VPS Cost</span>
                                <span className="text-green-400">${vps.monthlyCost}/mo</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Services Cost</span>
                                <span className="text-green-400">${vps.totalServiceCost || 0}/mo</span>
                            </div>
                            <div className="flex justify-between font-bold">
                                <span>Total</span>
                                <span className="text-green-400">${vps.totalMonthlyCost || vps.monthlyCost}/mo</span>
                            </div>
                            <hr className="border-gray-700 my-4" />
                            <div className="flex justify-between">
                                <span className="text-gray-400">Client</span>
                                {vps.client ? (
                                    <Link href={`/clients/${vps.client.id}`} className="text-cyan-400 hover:underline">
                                        {vps.client.name}
                                    </Link>
                                ) : (
                                    <span className="text-yellow-400">Not assigned</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Services List */}
                <div className="lg:col-span-2 bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold">Services ({vps.services?.length || 0})</h2>
                        <button
                            onClick={() => setShowAddService(!showAddService)}
                            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg transition text-sm"
                        >
                            {showAddService ? "Cancel" : "+ Add Service"}
                        </button>
                    </div>

                    {/* Add Service Form */}
                    {showAddService && (
                        <div className="bg-gray-700 rounded-lg p-4 mb-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-gray-400">Subdomain Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g., myapp"
                                        value={newService.name}
                                        onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-lg border border-gray-500 focus:border-cyan-500 focus:outline-none"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">→ {newService.name || "subdomain"}.renace.tech</p>
                                </div>
                                <div>
                                    <label className="text-sm text-gray-400">Type</label>
                                    <select
                                        value={newService.type}
                                        onChange={(e) => setNewService({ ...newService, type: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-lg border border-gray-500 focus:border-cyan-500 focus:outline-none"
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
                                    <label className="text-sm text-gray-400">Port (optional)</label>
                                    <input
                                        type="number"
                                        value={newService.port || ""}
                                        onChange={(e) => setNewService({ ...newService, port: parseInt(e.target.value) || 0 })}
                                        className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-lg border border-gray-500 focus:border-cyan-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-400">Monthly Cost ($)</label>
                                    <input
                                        type="number"
                                        value={newService.monthlyCost || ""}
                                        onChange={(e) => setNewService({ ...newService, monthlyCost: parseFloat(e.target.value) || 0 })}
                                        className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-lg border border-gray-500 focus:border-cyan-500 focus:outline-none"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-sm text-gray-400">Config File Path (optional)</label>
                                    <input
                                        type="text"
                                        placeholder="/etc/nginx/sites-available/..."
                                        value={newService.configFile}
                                        onChange={(e) => setNewService({ ...newService, configFile: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-lg border border-gray-500 focus:border-cyan-500 focus:outline-none"
                                    />
                                </div>
                            </div>
                            <button
                                onClick={handleAddService}
                                className="mt-4 w-full py-2 bg-green-600 hover:bg-green-700 rounded-lg transition"
                            >
                                Create Service
                            </button>
                        </div>
                    )}

                    {/* Services Grid */}
                    <div className="grid gap-4">
                        {vps.services?.length === 0 ? (
                            <p className="text-gray-500 text-center py-8">No services configured</p>
                        ) : (
                            vps.services?.map((service) => (
                                <div key={service.id} className="bg-gray-700/50 rounded-lg p-4 border border-gray-600 hover:border-cyan-500/50 transition">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <Link
                                                    href={`/services/${service.id}`}
                                                    className="text-lg font-semibold text-cyan-400 hover:underline"
                                                >
                                                    {service.name}
                                                </Link>
                                                <span className={`px-2 py-0.5 text-xs rounded-full ${service.type === "odoo" ? "bg-purple-500/20 text-purple-400" :
                                                    service.type === "web" ? "bg-blue-500/20 text-blue-400" :
                                                        service.type === "api" ? "bg-orange-500/20 text-orange-400" :
                                                            "bg-gray-500/20 text-gray-400"
                                                    }`}>
                                                    {service.type}
                                                </span>
                                            </div>
                                            {service.url && (
                                                <a
                                                    href={service.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm text-gray-400 hover:text-cyan-400 flex items-center gap-1 mt-1"
                                                >
                                                    🔗 {service.url}
                                                </a>
                                            )}
                                            {service.configFile && (
                                                <p className="text-xs text-gray-500 mt-1 font-mono">📄 {service.configFile}</p>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-green-400 font-semibold">${service.monthlyCost}/mo</p>
                                            {service.client ? (
                                                <p className="text-xs text-gray-400">→ {service.client.name}</p>
                                            ) : (
                                                <p className="text-xs text-yellow-400">No client</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
