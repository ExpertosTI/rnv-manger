"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderGit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { readAddonsRoot, writeAddonsRoot } from "@/lib/addons/storage";
import { DEFAULT_ADDONS_ROOT } from "@/lib/addons/types";

export function AddonsRootSetting() {
    const { addToast } = useToast();
    const [path, setPath] = useState(DEFAULT_ADDONS_ROOT);

    useEffect(() => {
        setPath(readAddonsRoot());
    }, []);

    const save = () => {
        const next = writeAddonsRoot(path);
        setPath(next);
        addToast("Ruta de Addons guardada en este equipo", "success");
    };

    return (
        <Card className="rounded-2xl border-2 border-violet-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-violet-50 to-transparent border-b border-violet-100">
                <CardTitle className="text-base flex items-center gap-2">
                    <FolderGit2 className="w-5 h-5 text-violet-600" />
                    Addons Odoo
                </CardTitle>
                <p className="text-sm text-muted-foreground font-normal">
                    Carpeta raíz de los módulos propios. Se guarda solo en este navegador o en la app de escritorio, no en el servidor.
                </p>
            </CardHeader>
            <CardContent className="pt-6 space-y-3">
                <label className="text-sm font-medium text-gray-700" htmlFor="addons-root">
                    Ruta en este equipo
                </label>
                <Input
                    id="addons-root"
                    value={path}
                    onChange={(event) => setPath(event.target.value)}
                    placeholder={DEFAULT_ADDONS_ROOT}
                    spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                    Por defecto <code className="text-violet-700">{DEFAULT_ADDONS_ROOT}</code>. En el sitio web la sección indica que solo está disponible en escritorio.
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={save} className="rounded-xl bg-violet-600 hover:bg-violet-700">
                        Guardar ruta local
                    </Button>
                    <Link
                        href="/addons"
                        className="inline-flex items-center justify-center h-10 px-4 rounded-xl border-2 border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                        Abrir Addons
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}
