"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Save, RefreshCw, FileCode, ChevronRight, Server } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

const mockOdooConfig = `[options]
; This is the password that allows database operations:
admin_passwd = admin
db_host = localhost
db_port = 5432
db_user = odoo
db_password = odoo_password
db_name = production_db

; Addons path
addons_path = /opt/odoo/addons,/opt/odoo/custom_addons

; Server configuration
http_port = 8069
longpolling_port = 8072
proxy_mode = True

; Workers (for production)
workers = 4
max_cron_threads = 2

; Memory limits
limit_memory_hard = 2684354560
limit_memory_soft = 2147483648
limit_request = 8192
limit_time_cpu = 600
limit_time_real = 1200

; Logging
log_level = info
log_handler = :INFO
logfile = /var/log/odoo/odoo.log

; Data directory
data_dir = /var/lib/odoo/.local/share/Odoo
`;

const configFiles = [
    { id: "1", name: "odoo.conf", vps: "VPS-Production-01", path: "/etc/odoo/odoo.conf", modified: "2024-12-18" },
    { id: "2", name: "odoo-staging.conf", vps: "VPS-Staging-01", path: "/etc/odoo/odoo-staging.conf", modified: "2024-12-15" },
    { id: "3", name: "client-erp.conf", vps: "VPS-Client-Odoo", path: "/etc/odoo/client-erp.conf", modified: "2024-12-10" },
];

export default function ConfigEditorPage() {
    const [selectedFile, setSelectedFile] = useState(configFiles[0]);
    const [configContent, setConfigContent] = useState(mockOdooConfig);
    const [hasChanges, setHasChanges] = useState(false);

    const handleContentChange = (value: string) => {
        setConfigContent(value);
        setHasChanges(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Editor de Configuración</h2>
                    <p className="text-muted-foreground">Edita archivos de configuración de Odoo de forma remota</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="gap-2">
                        <RefreshCw size={14} />
                        Sincronizar Archivos
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-4">
                {/* File List */}
                <div className="lg:col-span-1 space-y-4">
                    <Card className="bg-card/50 backdrop-blur">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm">Archivos de Configuración</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {configFiles.map((file) => (
                                <motion.div
                                    key={file.id}
                                    whileHover={{ x: 4 }}
                                    onClick={() => {
                                        setSelectedFile(file);
                                        setHasChanges(false);
                                    }}
                                    className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedFile.id === file.id
                                        ? "bg-primary/20 border border-primary/50"
                                        : "bg-secondary/30 hover:bg-secondary/50"
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <FileCode size={16} className="text-purple-400" />
                                        <span className="font-medium text-sm">{file.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                        <Server size={10} />
                                        <span>{file.vps}</span>
                                    </div>
                                </motion.div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                {/* Editor */}
                <div className="lg:col-span-3">
                    <Card className="bg-card/50 backdrop-blur">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <FileCode size={18} className="text-purple-400" />
                                    {selectedFile.name}
                                </CardTitle>
                                {hasChanges && (
                                    <Badge variant="warning" className="ml-2">Sin guardar</Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span>{selectedFile.path}</span>
                                <ChevronRight size={14} />
                                <span>{selectedFile.vps}</span>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="relative">
                                <Textarea
                                    value={configContent}
                                    onChange={(e) => handleContentChange(e.target.value)}
                                    className="font-mono text-sm min-h-[500px] bg-black/30 border-border/50 resize-none"
                                    placeholder="Cargando configuración..."
                                />
                                <div className="absolute top-2 right-2 flex gap-2">
                                    <Badge variant="outline" className="text-xs bg-black/50">INI</Badge>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-border/50">
                                <div className="text-sm text-muted-foreground">
                                    Última modificación: {selectedFile.modified}
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={() => { setConfigContent(mockOdooConfig); setHasChanges(false); }}>
                                        Descartar Cambios
                                    </Button>
                                    <Button className="gap-2" disabled={!hasChanges}>
                                        <Save size={14} />
                                        Guardar y Desplegar
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Quick Reference */}
                    <Card className="bg-card/50 backdrop-blur mt-4">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm">Referencia Rápida</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div className="p-2 rounded bg-secondary/30">
                                    <code className="text-primary">http_port</code>
                                    <p className="text-xs text-muted-foreground mt-1">Puerto del servidor web</p>
                                </div>
                                <div className="p-2 rounded bg-secondary/30">
                                    <code className="text-primary">workers</code>
                                    <p className="text-xs text-muted-foreground mt-1">Número de procesos hijos</p>
                                </div>
                                <div className="p-2 rounded bg-secondary/30">
                                    <code className="text-primary">db_name</code>
                                    <p className="text-xs text-muted-foreground mt-1">Nombre de la base de datos</p>
                                </div>
                                <div className="p-2 rounded bg-secondary/30">
                                    <code className="text-primary">proxy_mode</code>
                                    <p className="text-xs text-muted-foreground mt-1">Modo detrás de Nginx</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
