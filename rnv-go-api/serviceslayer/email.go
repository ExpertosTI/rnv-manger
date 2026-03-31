package serviceslayer

import (
	"crypto/tls"
	"fmt"
	"strconv"

	"github.com/renace/rnv-go-api/config"
	"gopkg.in/gomail.v2"
)

// SendEmail sends an email via SMTP using the app's config.
func SendEmail(cfg *config.Config, to, subject, htmlBody string) error {
	if cfg.SMTPHost == "" {
		return fmt.Errorf("SMTP no configurado")
	}

	from := cfg.SMTPFrom
	if from == "" {
		from = cfg.SMTPUser
	}

	m := gomail.NewMessage()
	m.SetHeader("From", from)
	m.SetHeader("To", to)
	m.SetHeader("Subject", subject)
	m.SetBody("text/html", htmlBody)

	port, _ := strconv.Atoi(cfg.SMTPPort)
	d := gomail.NewDialer(cfg.SMTPHost, port, cfg.SMTPUser, cfg.SMTPPass)
	d.TLSConfig = &tls.Config{InsecureSkipVerify: true}

	return d.DialAndSend(m)
}

// SendOTPEmail sends the OTP code to the user.
func SendOTPEmail(cfg *config.Config, to, code string) error {
	subject := "RNV Manager - Codigo de acceso"
	body := fmt.Sprintf(`
		<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
			<div style="text-align: center; margin-bottom: 24px;">
				<h2 style="color: #7c3aed; margin: 0;">RNV Manager</h2>
				<p style="color: #6b7280; font-size: 14px;">Codigo de verificacion</p>
			</div>
			<div style="background: #f3f4f6; border-radius: 12px; padding: 32px; text-align: center;">
				<p style="color: #374151; font-size: 16px; margin-bottom: 16px;">Tu codigo de acceso es:</p>
				<div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #7c3aed; background: white; padding: 16px; border-radius: 8px; display: inline-block;">
					%s
				</div>
				<p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">Este codigo expira en 5 minutos.</p>
			</div>
			<p style="color: #9ca3af; font-size: 11px; text-align: center; margin-top: 24px;">
				Si no solicitaste este codigo, ignora este mensaje.
			</p>
		</div>
	`, code)
	return SendEmail(cfg, to, subject, body)
}

// SendLoginNotification sends a notification about a new login.
func SendLoginNotification(cfg *config.Config, email, ip, timestamp string) error {
	if cfg.NotificationEmail == "" {
		return nil
	}
	subject := "RNV Manager - Nuevo acceso detectado"
	body := fmt.Sprintf(`
		<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
			<div style="text-align: center; margin-bottom: 24px;">
				<h2 style="color: #7c3aed; margin: 0;">RNV Manager</h2>
				<p style="color: #6b7280; font-size: 14px;">Notificacion de acceso</p>
			</div>
			<div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 12px; padding: 24px;">
				<p style="color: #92400e; font-weight: bold; margin: 0 0 12px 0;">Nuevo inicio de sesion</p>
				<table style="width: 100%%; font-size: 14px; color: #374151;">
					<tr><td style="padding: 4px 0; color: #6b7280;">Email:</td><td style="padding: 4px 0; font-weight: bold;">%s</td></tr>
					<tr><td style="padding: 4px 0; color: #6b7280;">IP:</td><td style="padding: 4px 0; font-weight: bold;">%s</td></tr>
					<tr><td style="padding: 4px 0; color: #6b7280;">Fecha:</td><td style="padding: 4px 0; font-weight: bold;">%s</td></tr>
				</table>
			</div>
		</div>
	`, email, ip, timestamp)
	return SendEmail(cfg, cfg.NotificationEmail, subject, body)
}
