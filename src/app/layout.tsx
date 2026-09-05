import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ToastProvider } from "@/components/ui/toast";
import { CurrencyProvider } from "@/lib/currency";

export const metadata: Metadata = {
    title: "RNV Manager — Centro de Control de Infraestructura",
    description: "Panel de Monitoreo y Gestión en Tiempo Real de VPS, Servicios, Clientes y Odoo",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="es" className="light" suppressHydrationWarning>
            <body className="font-sans antialiased min-h-screen bg-[#f8f7fc] text-gray-900 selection:bg-violet-500 selection:text-white">
                <ToastProvider>
                    <CurrencyProvider>
                        <AppShell>{children}</AppShell>
                    </CurrencyProvider>
                </ToastProvider>
            </body>
        </html>
    );
}
