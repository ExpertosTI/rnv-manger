package database

import (
	"log"

	"github.com/renace/rnv-go-api/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Connect(dsn string) *gorm.DB {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		log.Fatalf("[DB] Failed to connect to database: %v", err)
	}

	log.Println("[DB] Connected to PostgreSQL")
	return db
}

func AutoMigrate(db *gorm.DB) {
	err := db.AutoMigrate(
		&models.Client{},
		&models.VPS{},
		&models.Service{},
		&models.Payment{},
		&models.RevenueHistory{},
		&models.AppSettings{},
		&models.User{},
		&models.Session{},
		&models.AuditLog{},
		&models.Notification{},
		&models.AllowedEmail{},
		&models.OTPCode{},
		&models.Credential{},
		&models.ServiceToken{},
	)
	if err != nil {
		log.Fatalf("[DB] AutoMigrate failed: %v", err)
	}
	log.Println("[DB] Schema migrated successfully")
}
