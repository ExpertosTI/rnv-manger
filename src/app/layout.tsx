import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppSidebar } from "@/components/AppSidebar";
import { ToastProvider } from "@/components/ui/toast";
import { TopHeader } from "@/components/TopHeader";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

export const metadata: Metadata = {
    title: "RNV Manager",
    description: "Advanced VPS and Service Management",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="es" className={inter.variable} suppressHydrationWarning>
            <body className="font-sans antialiased min-h-screen flex bg-gradient-to-br from-slate-50 to-purple-50/30">
                <ToastProvider>
                    <AppSidebar />
                    <div className="flex-1 flex flex-col h-screen overflow-hidden">
                        <TopHeader />
                        <main className="flex-1 overflow-y-auto">
                            <div className="p-6 max-w-7xl mx-auto">
                                {children}
                            </div>
                        </main>
                    </div>
                </ToastProvider>
            </body>
        </html>
    );
}
