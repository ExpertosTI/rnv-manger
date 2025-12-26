"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
    DollarSign, FileText, Search, RefreshCw, Users, Server,
    Database, Send, CheckCircle, AlertCircle, Calendar
} from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/toast";

interface ClientBilling {
    id: string;
    name: string;
    odooPartnerId: number | null;
    vpsCost: number;
    serviceCost: number;
    baseFee: number;
    totalMonthlyCost: number;
    vpsCount: number;
    serviceCount: number;
    canInvoice: boolean;
}

interface BillingTotals {
    clients: number;
    totalMonthlyRevenue: number;
    clientsWithOdoo: number;
}

export default function BillingPage() {
    const [clients, setClients] = useState<ClientBilling[]>([]);
    const [totals, setTotals] = useState<BillingTotals | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedClient, setSelectedClient] = useState<ClientBilling | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const { addToast } = useToast();

    useEffect(() => {
        fetchBilling();
    }, []);

    const fetchBilling = async () => {
        setIsLoading(true);
        try {
            const response = await fetch("/api/billing");
            const result = await response.json();
            if (result.success) {
                setClients(result.data);
                setTotals(result.totals);
            }
        } catch (error) {
            addToast("Error al cargar datos de facturación", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateInvoice = async () => {
        if (!selectedClient) return;

        setIsGenerating(true);
        try {
            const response = await fetch("/api/billing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clientId: selectedClient.id }),
            });

            const result = await response.json();
            if (result.success) {
                addToast(`Factura ${result.invoiceName} generada por $${result.totalAmount}`, "success");
                setSelectedClient(null);
                fetchBilling();
            } else {
                addToast(result.error || "Error al generar factura", "error");
            }
        } catch (error) {
            addToast("Error de conexión", "error");
        } finally {
            setIsGenerating(false);
        }
    };

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const billableClients = clients.filter(c => c.canInvoice);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Facturación</h2>
                    <p className="text-muted-foreground">Gestiona costos y genera facturas en Odoo</p>
                </div>
                <Button onClick={fetchBilling} variant="outline" className="gap-2">
                    <RefreshCw size={16} /> Actualizar
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-2xl border-0 shadow-lg">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <DollarSign className="h-8 w-8 opacity-80" />
                            <div>
                                <p className="text-sm opacity-80">Ingresos Mensuales</p>
                                <p className="text-2xl font-bold">
                                    ${totals?.totalMonthlyRevenue.toFixed(2) || "0.00"}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white/70 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <Users className="h-6 w-6 text-blue-500" />
                            <div>
                                <p className="text-sm text-muted-foreground">Clientes Activos</p>
                                <p className="text-2xl font-bold">{totals?.clients || 0}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white/70 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <CheckCircle className="h-6 w-6 text-green-500" />
                            <div>
                                <p className="text-sm text-muted-foreground">Con Odoo</p>
                                <p className="text-2xl font-bold">{totals?.clientsWithOdoo || 0}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white/70 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <FileText className="h-6 w-6 text-violet-500" />
                            <div>
                                <p className="text-sm text-muted-foreground">Facturables</p>
                                <p className="text-2xl font-bold">{billableClients.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Search */}
            <div className="flex gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar cliente..."
                        className="pl-9 rounded-xl border-2"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Clients Table */}
            <Card className="bg-white/70 backdrop-blur rounded-2xl border-2 border-gray-100 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-green-500" />
                        Resumen de Facturación ({clients.length} clientes)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
                        </div>
                    ) : filteredClients.length === 0 ? (
                        <div className="py-12 text-center">
                            <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                            <p className="text-gray-500">No hay clientes para facturar</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left py-3 px-4 font-medium text-gray-500">Cliente</th>
                                        <th className="text-center py-3 px-4 font-medium text-gray-500">VPS</th>
                                        <th className="text-center py-3 px-4 font-medium text-gray-500">Servicios</th>
                                        <th className="text-right py-3 px-4 font-medium text-gray-500">Costo VPS</th>
                                        <th className="text-right py-3 px-4 font-medium text-gray-500">Costo Servicios</th>
                                        <th className="text-right py-3 px-4 font-medium text-gray-500">Tarifa Base</th>
                                        <th className="text-right py-3 px-4 font-medium text-gray-500">Total</th>
                                        <th className="text-center py-3 px-4 font-medium text-gray-500">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredClients.map((client, index) => (
                                        <motion.tr
                                            key={client.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.03 }}
                                            className="border-b border-gray-100 hover:bg-violet-50/50 transition-colors"
                                        >
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-2">
                                                    <Link href={`/clients/${client.id}`} className="font-medium hover:text-violet-600">
                                                        {client.name}
                                                    </Link>
                                                    {client.odooPartnerId ? (
                                                        <Badge variant="outline" className="text-xs text-green-600 bg-green-50">Odoo</Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-xs text-orange-600 bg-orange-50">Sin Odoo</Badge>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <span className="flex items-center justify-center gap-1">
                                                    <Server size={14} className="text-blue-500" />
                                                    {client.vpsCount}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <span className="flex items-center justify-center gap-1">
                                                    <Database size={14} className="text-purple-500" />
                                                    {client.serviceCount}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono text-sm">
                                                ${client.vpsCost.toFixed(2)}
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono text-sm">
                                                ${client.serviceCost.toFixed(2)}
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono text-sm">
                                                ${client.baseFee.toFixed(2)}
                                            </td>
                                            <td className="py-3 px-4 text-right font-bold text-green-600">
                                                ${client.totalMonthlyCost.toFixed(2)}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                {client.canInvoice ? (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => setSelectedClient(client)}
                                                        className="gap-1 bg-violet-500 hover:bg-violet-600"
                                                    >
                                                        <Send size={14} /> Facturar
                                                    </Button>
                                                ) : (
                                                    <Badge variant="outline" className="text-gray-400">
                                                        {!client.odooPartnerId ? "Sync Odoo" : "Sin costos"}
                                                    </Badge>
                                                )}
                                            </td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-50 font-bold">
                                        <td className="py-3 px-4">Total</td>
                                        <td className="py-3 px-4 text-center">
                                            {clients.reduce((sum, c) => sum + c.vpsCount, 0)}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            {clients.reduce((sum, c) => sum + c.serviceCount, 0)}
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono">
                                            ${clients.reduce((sum, c) => sum + c.vpsCost, 0).toFixed(2)}
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono">
                                            ${clients.reduce((sum, c) => sum + c.serviceCost, 0).toFixed(2)}
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono">
                                            ${clients.reduce((sum, c) => sum + c.baseFee, 0).toFixed(2)}
                                        </td>
                                        <td className="py-3 px-4 text-right text-green-600">
                                            ${totals?.totalMonthlyRevenue.toFixed(2) || "0.00"}
                                        </td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Generate Invoice Modal */}
            <Dialog open={!!selectedClient} onOpenChange={() => setSelectedClient(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-violet-500" />
                            Generar Factura
                        </DialogTitle>
                        <DialogDescription>
                            Se creará una factura en Odoo para {selectedClient?.name}
                        </DialogDescription>
                    </DialogHeader>

                    {selectedClient && (
                        <div className="space-y-4 mt-4">
                            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Cliente:</span>
                                    <span className="font-medium">{selectedClient.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">VPS ({selectedClient.vpsCount}):</span>
                                    <span className="font-mono">${selectedClient.vpsCost.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Servicios ({selectedClient.serviceCount}):</span>
                                    <span className="font-mono">${selectedClient.serviceCost.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Tarifa Base:</span>
                                    <span className="font-mono">${selectedClient.baseFee.toFixed(2)}</span>
                                </div>
                                <hr />
                                <div className="flex justify-between text-lg font-bold">
                                    <span>Total:</span>
                                    <span className="text-green-600">${selectedClient.totalMonthlyCost.toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-xl">
                                <AlertCircle size={16} />
                                <span>La factura se creará en Odoo con estado "Borrador"</span>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedClient(null)} className="rounded-xl">
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleGenerateInvoice}
                            disabled={isGenerating}
                            className="rounded-xl bg-gradient-to-r from-violet-500 to-purple-600"
                        >
                            {isGenerating ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                                    Generando...
                                </>
                            ) : (
                                <>
                                    <Send className="w-4 h-4 mr-2" />
                                    Generar Factura
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
