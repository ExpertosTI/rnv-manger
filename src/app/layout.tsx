import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ToastProvider } from "@/components/ui/toast";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

export const metadata: Metadata = {
    title: "RNV Manager",
    description: "Panel de Control de Infraestructura",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="es" className={inter.variable} suppressHydrationWarning>
            <body className="font-sans antialiased min-h-screen bg-gradient-to-br from-slate-50 to-purple-50/30">
                <ToastProvider>
                    <AppShell>{children}</AppShell>
                </ToastProvider>
            </body>
        </html>
    );
}
