package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL       string
	JWTSecret         string
	Port              string
	AppURL            string
	HostingerAPIToken string
	OdooURL           string
	OdooDB            string
	OdooUsername      string
	OdooAPIKey        string
	SMTPHost          string
	SMTPPort          string
	SMTPUser          string
	SMTPPass          string
	SMTPFrom          string
	MasterPassword    string
	GinMode           string
	VaultMasterKey    string
	VaultMasterKeyOld string
	NotificationEmail string
}

func Load() *Config {
	// Try to load .env from parent directory (project root)
	if err := godotenv.Load("../.env"); err != nil {
		// Also try current directory
		godotenv.Load(".env")
	}

	cfg := &Config{
		DatabaseURL:       getEnv("DATABASE_URL", "postgresql://rnvadmin:rnv_secure_password_2025@localhost:5432/rnv_manager?sslmode=disable"),
		JWTSecret:         getEnv("JWT_SECRET", "change-me-in-production-use-32-chars-min"),
		Port:              getEnv("PORT", "8080"),
		AppURL:            getEnv("APP_URL", "https://rnv.renace.tech"),
		HostingerAPIToken: getEnv("HOSTINGER_API_TOKEN", ""),
		OdooURL:           getEnv("ODOO_URL", ""),
		OdooDB:            getEnv("ODOO_DB", ""),
		OdooUsername:      getEnv("ODOO_USERNAME", ""),
		OdooAPIKey:        getEnv("ODOO_API_KEY", ""),
		SMTPHost:          getEnv("SMTP_HOST", ""),
		SMTPPort:          getEnv("SMTP_PORT", "587"),
		SMTPUser:          getEnv("SMTP_USER", ""),
		SMTPPass:          getEnv("SMTP_PASS", ""),
		SMTPFrom:          getEnv("SMTP_FROM", ""),
		MasterPassword:    getEnv("MASTER_PASSWORD", ""),
		GinMode:           getEnv("GIN_MODE", "debug"),
		VaultMasterKey:    getEnv("VAULT_MASTER_KEY", ""),
		VaultMasterKeyOld: getEnv("VAULT_MASTER_KEY_OLD", ""),
		NotificationEmail: getEnv("NOTIFICATION_EMAIL", ""),
	}

	if cfg.JWTSecret == "change-me-in-production-use-32-chars-min" {
		log.Println("[WARNING] Using default JWT secret. Set JWT_SECRET env var in production!")
	}

	if cfg.VaultMasterKey == "" {
		log.Println("[WARNING] VAULT_MASTER_KEY not set. Vault encryption will not work!")
	}

	return cfg
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
