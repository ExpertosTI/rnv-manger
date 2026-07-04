package serviceslayer

import (
	"crypto/tls"
	"fmt"
	"strconv"

	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/models"
	"gopkg.in/gomail.v2"
	"gorm.io/gorm"
)

// SMTPConfig holds resolved SMTP credentials (DB settings override env).
type SMTPConfig struct {
	Host string
	Port string
	User string
	Pass string
	From string
}

// ResolveSMTPConfig loads SMTP from DB settings, falling back to env.
func ResolveSMTPConfig(db *gorm.DB, cfg *config.Config) SMTPConfig {
	sc := SMTPConfig{
		Host: cfg.SMTPHost,
		Port: cfg.SMTPPort,
		User: cfg.SMTPUser,
		Pass: cfg.SMTPPass,
		From: cfg.SMTPFrom,
	}
	if sc.Port == "" {
		sc.Port = "587"
	}

	if db == nil {
		return sc
	}

	var settings []models.AppSettings
	db.Where("key IN ?", []string{
		"smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from",
	}).Find(&settings)

	for _, s := range settings {
		if s.Value == "" {
			continue
		}
		switch s.Key {
		case "smtp_host":
			sc.Host = s.Value
		case "smtp_port":
			sc.Port = s.Value
		case "smtp_user":
			sc.User = s.Value
		case "smtp_pass":
			sc.Pass = s.Value
		case "smtp_from":
			sc.From = s.Value
		}
	}
	return sc
}

func (sc SMTPConfig) configured() bool {
	return sc.Host != "" && sc.User != "" && sc.Pass != ""
}

func (sc SMTPConfig) fromAddress() string {
	if sc.From != "" {
		return sc.From
	}
	return sc.User
}

func newMailDialer(sc SMTPConfig) *gomail.Dialer {
	port, _ := strconv.Atoi(sc.Port)
	if port == 0 {
		port = 587
	}
	d := gomail.NewDialer(sc.Host, port, sc.User, sc.Pass)
	d.TLSConfig = &tls.Config{ServerName: sc.Host}
	// Port 465 uses implicit TLS (SMTPS)
	if port == 465 {
		d.SSL = true
	}
	return d
}

// SendEmail sends an email via SMTP using resolved config.
func SendEmail(db *gorm.DB, cfg *config.Config, to, subject, htmlBody string) error {
	sc := ResolveSMTPConfig(db, cfg)
	if !sc.configured() {
		return fmt.Errorf("SMTP no configurado (define SMTP_* en .env o en Ajustes)")
	}

	m := gomail.NewMessage()
	m.SetHeader("From", sc.fromAddress())
	m.SetHeader("To", to)
	m.SetHeader("Subject", subject)
	m.SetBody("text/html", htmlBody)

	return newMailDialer(sc).DialAndSend(m)
}

// SendOTPEmail sends the OTP code to the user.
func SendOTPEmail(db *gorm.DB, cfg *config.Config, to, code string) error {
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
	return SendEmail(db, cfg, to, subject, body)
}

// SendLoginNotification sends a notification about a new login.
func SendLoginNotification(db *gorm.DB, cfg *config.Config, email, ip, timestamp string) error {
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
	return SendEmail(db, cfg, cfg.NotificationEmail, subject, body)
}
