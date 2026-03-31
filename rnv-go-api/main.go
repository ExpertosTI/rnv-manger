package main

import (
	"log"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/database"
	authHandler "github.com/renace/rnv-go-api/handlers/auth"
	auditHandler "github.com/renace/rnv-go-api/handlers/audit"
	backupHandler "github.com/renace/rnv-go-api/handlers/backup"
	billingHandler "github.com/renace/rnv-go-api/handlers/billing"
	clientsHandler "github.com/renace/rnv-go-api/handlers/clients"
	emailHandler "github.com/renace/rnv-go-api/handlers/email"
	healthHandler "github.com/renace/rnv-go-api/handlers/health"
	historyHandler "github.com/renace/rnv-go-api/handlers/history"
	hostingerHandler "github.com/renace/rnv-go-api/handlers/hostinger"
	monitorHandler "github.com/renace/rnv-go-api/handlers/monitor"
	notificationsHandler "github.com/renace/rnv-go-api/handlers/notifications"
	odooHandler "github.com/renace/rnv-go-api/handlers/odoo"
	servicesHandler "github.com/renace/rnv-go-api/handlers/services"
	settingsHandler "github.com/renace/rnv-go-api/handlers/settings"
	sshHandler "github.com/renace/rnv-go-api/handlers/ssh"
	statsHandler "github.com/renace/rnv-go-api/handlers/stats"
	usersHandler "github.com/renace/rnv-go-api/handlers/users"
	vaultHandler "github.com/renace/rnv-go-api/handlers/vault"
	vpsHandler "github.com/renace/rnv-go-api/handlers/vps"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/scheduler"
	"github.com/renace/rnv-go-api/serviceslayer"
	wsHandler "github.com/renace/rnv-go-api/ws"
)

func main() {
	cfg := config.Load()
	db := database.Connect(cfg.DatabaseURL)
	database.AutoMigrate(db)

	// Seed defaults
	serviceslayer.EnsureDefaultAdmin(db, cfg.MasterPassword)
	serviceslayer.EnsureDefaultAllowedEmail(db, cfg.NotificationEmail)

	// Background goroutines
	go scheduler.StartMonitorScheduler(db, cfg)
	go scheduler.StartCleanupScheduler(db)

	// Gin setup
	gin.SetMode(cfg.GinMode)
	r := gin.New()
	r.Use(gin.Logger())
	r.Use(gin.Recovery())

	// CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "http://localhost:4200", cfg.AppURL},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "Accept"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Inject DB for service token auth
	r.Use(middleware.InjectDB(db))

	// ─── Public routes ────────────────────────────────────────────────
	api := r.Group("/api")
	{
		api.POST("/auth/login", authHandler.Login(db, cfg))
		api.POST("/auth/request-otp", authHandler.RequestOTP(db, cfg))
		api.POST("/auth/verify-otp", authHandler.VerifyOTP(db, cfg))
		api.GET("/health", healthHandler.Check(db))
		api.GET("/services/import", servicesHandler.Import(db))
	}

	// ─── Protected routes ─────────────────────────────────────────────
	auth := api.Group("")
	auth.Use(middleware.RequireAuth(cfg.JWTSecret))
	{
		// Auth
		auth.GET("/auth/me", authHandler.Me(db))
		auth.POST("/auth/logout", authHandler.Logout(db))

		// Service Tokens (superadmin only)
		auth.POST("/auth/service-tokens", middleware.RequireRole("superadmin"), authHandler.CreateServiceToken(db))
		auth.GET("/auth/service-tokens", middleware.RequireRole("superadmin"), authHandler.ListServiceTokens(db))
		auth.DELETE("/auth/service-tokens/:id", middleware.RequireRole("superadmin"), authHandler.RevokeServiceToken(db))

		// Vault
		auth.GET("/vault", vaultHandler.List(db, cfg))
		auth.GET("/vault/:id", vaultHandler.Get(db, cfg))
		auth.POST("/vault", middleware.RequireRole("superadmin", "admin"), vaultHandler.Create(db, cfg))
		auth.PUT("/vault/:id", middleware.RequireRole("superadmin", "admin"), vaultHandler.Update(db, cfg))
		auth.DELETE("/vault/:id", middleware.RequireRole("superadmin"), vaultHandler.Delete(db, cfg))
		auth.POST("/vault/generate", vaultHandler.Generate(db))
		auth.POST("/vault/generate-and-save", middleware.RequireRole("superadmin", "admin"), vaultHandler.GenerateAndSave(db, cfg))
		auth.POST("/vault/rotate-key", middleware.RequireRole("superadmin"), vaultHandler.RotateKey(db, cfg))

		// VPS
		auth.GET("/vps", vpsHandler.List(db))
		auth.POST("/vps", vpsHandler.Create(db))
		auth.GET("/vps/:id", vpsHandler.Get(db))
		auth.PUT("/vps/:id", vpsHandler.Update(db))
		auth.DELETE("/vps/:id", vpsHandler.Delete(db))
		auth.GET("/vps/:id/services", vpsHandler.ListServices(db))
		auth.POST("/vps/:id/services", vpsHandler.CreateService(db))

		// Clients
		auth.GET("/clients", clientsHandler.List(db))
		auth.POST("/clients", clientsHandler.Create(db))
		auth.GET("/clients/:id", clientsHandler.Get(db))
		auth.PUT("/clients/:id", clientsHandler.Update(db))
		auth.DELETE("/clients/:id", clientsHandler.Delete(db))

		// Services
		auth.GET("/services", servicesHandler.List(db))
		auth.POST("/services", servicesHandler.Create(db))
		auth.GET("/services/:id", servicesHandler.Get(db))
		auth.PUT("/services/:id", servicesHandler.Update(db))
		auth.DELETE("/services/:id", servicesHandler.Delete(db))

		// SSH
		auth.POST("/ssh", sshHandler.Exec(db))
		auth.GET("/ssh", sshHandler.Test(db))
		auth.GET("/ssh/terminal", wsHandler.Terminal()) // WebSocket

		// Monitor
		auth.POST("/monitor", monitorHandler.Metrics(db))

		// Backup
		auth.POST("/backup", backupHandler.Run(db))
		auth.GET("/backup", backupHandler.List(db))
		auth.POST("/backup/restore", middleware.RequireRole("superadmin"), backupHandler.Restore(db))

		// Health (authenticated version)
		auth.POST("/health", healthHandler.Check(db))

		// Stats
		auth.GET("/stats", statsHandler.Dashboard(db))

		// Audit
		auth.GET("/audit", auditHandler.List(db))
		auth.GET("/audit/stats", auditHandler.Stats(db))

		// Users (superadmin only for some ops)
		auth.GET("/users", usersHandler.List(db))
		auth.POST("/users", usersHandler.Create(db))
		auth.DELETE("/users/:id", middleware.RequireRole("superadmin"), usersHandler.Delete(db))

		// Notifications
		auth.GET("/notifications", notificationsHandler.List(db))
		auth.PUT("/notifications", notificationsHandler.MarkRead(db))

		// Billing
		auth.GET("/billing", billingHandler.Summary(db))
		auth.POST("/billing", billingHandler.CreatePayment(db))

		// History
		auth.GET("/history", historyHandler.List(db))
		auth.POST("/history", historyHandler.Upsert(db))

		// Settings
		auth.GET("/settings", settingsHandler.Get(db))
		auth.POST("/settings", settingsHandler.Set(db))
		auth.DELETE("/settings", settingsHandler.Delete(db))

		// Hostinger
		auth.GET("/hostinger/vps", hostingerHandler.ListVPS(db, cfg))
		auth.POST("/hostinger/vps", hostingerHandler.SyncVPS(db, cfg))

		// Odoo
		auth.GET("/odoo", odooHandler.Test(cfg))
		auth.POST("/odoo", odooHandler.Test(cfg))
		auth.GET("/odoo/partners", odooHandler.Partners(cfg))
		auth.POST("/odoo/partners", odooHandler.Partners(cfg))
		auth.GET("/odoo/invoices", odooHandler.Invoices(cfg))
		auth.POST("/odoo/invoices", odooHandler.Invoices(cfg))
		auth.GET("/odoo/sync", odooHandler.Sync(db, cfg))
		auth.POST("/odoo/sync", odooHandler.Sync(db, cfg))

		// Email
		auth.GET("/email", emailHandler.Config(cfg))
		auth.POST("/email", emailHandler.Send(db, cfg))
	}

	log.Printf("[RNV Go API] Starting on :%s (mode: %s)", cfg.Port, cfg.GinMode)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("[RNV Go API] Failed to start: %v", err)
	}
}
