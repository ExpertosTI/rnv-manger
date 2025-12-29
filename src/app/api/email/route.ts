import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

interface EmailConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
}

interface EmailRequest {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    alertType?: "payment" | "resource" | "backup" | "general";
}

// Get SMTP config from environment
function getEmailConfig(): EmailConfig | null {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || "587");
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
        return null;
    }

    return {
        host,
        port,
        secure: port === 465,
        user,
        pass
    };
}

// Create transporter
function createTransporter(config: EmailConfig) {
    return nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
            user: config.user,
            pass: config.pass
        }
    });
}

// Email templates
const templates = {
    payment: (data: { clientName: string; amount: number; daysOverdue: number }) => ({
        subject: `⚠️ Pago Vencido - ${data.clientName}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #ef4444, #f97316); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
                    <h1 style="margin: 0;">⚠️ Alerta de Pago</h1>
                </div>
                <div style="background: #1f2937; color: #e5e7eb; padding: 20px; border-radius: 0 0 10px 10px;">
                    <p style="font-size: 18px;">El cliente <strong>${data.clientName}</strong> tiene un pago vencido.</p>
                    <table style="width: 100%; margin: 20px 0;">
                        <tr>
                            <td style="color: #9ca3af;">Monto:</td>
                            <td style="text-align: right; font-weight: bold; color: #f87171;">$${data.amount}</td>
                        </tr>
                        <tr>
                            <td style="color: #9ca3af;">Días de retraso:</td>
                            <td style="text-align: right; font-weight: bold; color: #fbbf24;">${data.daysOverdue} días</td>
                        </tr>
                    </table>
                    <a href="${process.env.APP_URL || 'http://localhost:4200'}/clients" 
                       style="display: block; background: #8b5cf6; color: white; text-align: center; padding: 12px; border-radius: 8px; text-decoration: none;">
                        Ver en RNV Manager
                    </a>
                </div>
            </div>
        `
    }),

    resource: (data: { serverName: string; type: string; value: number; threshold: number; host: string }) => ({
        subject: `🔴 Alerta de Recursos - ${data.serverName}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #dc2626, #991b1b); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
                    <h1 style="margin: 0;">🔴 Alerta de Recursos</h1>
                </div>
                <div style="background: #1f2937; color: #e5e7eb; padding: 20px; border-radius: 0 0 10px 10px;">
                    <p style="font-size: 18px;">El servidor <strong>${data.serverName}</strong> tiene uso crítico de recursos.</p>
                    <table style="width: 100%; margin: 20px 0;">
                        <tr>
                            <td style="color: #9ca3af;">Tipo:</td>
                            <td style="text-align: right; font-weight: bold; text-transform: uppercase;">${data.type}</td>
                        </tr>
                        <tr>
                            <td style="color: #9ca3af;">Uso Actual:</td>
                            <td style="text-align: right; font-weight: bold; color: #f87171;">${data.value.toFixed(1)}%</td>
                        </tr>
                        <tr>
                            <td style="color: #9ca3af;">Umbral:</td>
                            <td style="text-align: right; color: #fbbf24;">${data.threshold}%</td>
                        </tr>
                        <tr>
                            <td style="color: #9ca3af;">Host:</td>
                            <td style="text-align: right; font-family: monospace;">${data.host}</td>
                        </tr>
                    </table>
                    <a href="${process.env.APP_URL || 'http://localhost:4200'}/vps" 
                       style="display: block; background: #8b5cf6; color: white; text-align: center; padding: 12px; border-radius: 8px; text-decoration: none;">
                        Ver Servidores
                    </a>
                </div>
            </div>
        `
    }),

    backup: (data: { serverName: string; type: string; filename: string; size: string; success: boolean }) => ({
        subject: data.success ? `✅ Backup Completado - ${data.serverName}` : `❌ Backup Fallido - ${data.serverName}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: ${data.success ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #ef4444, #dc2626)'}; color: white; padding: 20px; border-radius: 10px 10px 0 0;">
                    <h1 style="margin: 0;">${data.success ? '✅ Backup Completado' : '❌ Backup Fallido'}</h1>
                </div>
                <div style="background: #1f2937; color: #e5e7eb; padding: 20px; border-radius: 0 0 10px 10px;">
                    <table style="width: 100%; margin: 20px 0;">
                        <tr>
                            <td style="color: #9ca3af;">Servidor:</td>
                            <td style="text-align: right; font-weight: bold;">${data.serverName}</td>
                        </tr>
                        <tr>
                            <td style="color: #9ca3af;">Tipo:</td>
                            <td style="text-align: right;">${data.type}</td>
                        </tr>
                        <tr>
                            <td style="color: #9ca3af;">Archivo:</td>
                            <td style="text-align: right; font-family: monospace;">${data.filename}</td>
                        </tr>
                        <tr>
                            <td style="color: #9ca3af;">Tamaño:</td>
                            <td style="text-align: right;">${data.size}</td>
                        </tr>
                    </table>
                </div>
            </div>
        `
    })
};

// POST - Send email
export async function POST(request: NextRequest) {
    try {
        const config = getEmailConfig();

        if (!config) {
            return NextResponse.json({
                success: false,
                error: "SMTP no configurado. Añade SMTP_HOST, SMTP_USER, SMTP_PASS en .env"
            }, { status: 400 });
        }

        const body = await request.json();
        const { to, subject, text, html, alertType, templateData } = body;

        if (!to) {
            return NextResponse.json({ success: false, error: "Destinatario requerido" }, { status: 400 });
        }

        let emailContent = { subject, text, html };

        // Use template if specified
        if (alertType && templateData && templates[alertType as keyof typeof templates]) {
            const template = templates[alertType as keyof typeof templates](templateData);
            emailContent = { ...emailContent, ...template };
        }

        if (!emailContent.subject || (!emailContent.text && !emailContent.html)) {
            return NextResponse.json({ success: false, error: "Asunto y contenido requeridos" }, { status: 400 });
        }

        const transporter = createTransporter(config);

        const info = await transporter.sendMail({
            from: `"RNV Manager" <${config.user}>`,
            to: Array.isArray(to) ? to.join(", ") : to,
            subject: emailContent.subject,
            text: emailContent.text,
            html: emailContent.html
        });

        return NextResponse.json({
            success: true,
            data: {
                messageId: info.messageId,
                accepted: info.accepted,
                rejected: info.rejected
            }
        });
    } catch (error) {
        console.error("Email API Error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Error enviando email" },
            { status: 500 }
        );
    }
}

// GET - Test SMTP connection
export async function GET() {
    const config = getEmailConfig();

    if (!config) {
        return NextResponse.json({
            success: false,
            configured: false,
            message: "SMTP no configurado"
        });
    }

    try {
        const transporter = createTransporter(config);
        await transporter.verify();

        return NextResponse.json({
            success: true,
            configured: true,
            message: "SMTP configurado y funcionando",
            host: config.host
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            configured: true,
            message: error instanceof Error ? error.message : "Error de conexión SMTP"
        });
    }
}
