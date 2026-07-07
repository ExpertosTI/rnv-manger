package backup

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type RestoreRequest struct {
	Data struct {
		Clients        []models.Client         `json:"clients"`
		VPS            []models.VPS            `json:"vps"`
		Services       []models.Service        `json:"services"`
		Payments       []models.Payment        `json:"payments"`
		RevenueHistory []models.RevenueHistory `json:"revenueHistory"`
		AppSettings    []models.AppSettings    `json:"appSettings"`
	} `json:"data"`
}

func restoreTransaction(tx *gorm.DB, req RestoreRequest) error {
	if len(req.Data.Clients) > 0 {
		if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(&req.Data.Clients).Error; err != nil {
			return err
		}
	}
	if len(req.Data.VPS) > 0 {
		if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(&req.Data.VPS).Error; err != nil {
			return err
		}
	}
	if len(req.Data.Services) > 0 {
		if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(&req.Data.Services).Error; err != nil {
			return err
		}
	}
	if len(req.Data.Payments) > 0 {
		if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(&req.Data.Payments).Error; err != nil {
			return err
		}
	}
	if len(req.Data.RevenueHistory) > 0 {
		if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(&req.Data.RevenueHistory).Error; err != nil {
			return err
		}
	}
	if len(req.Data.AppSettings) > 0 {
		if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(&req.Data.AppSettings).Error; err != nil {
			return err
		}
	}
	return nil
}

func recalculateAllClients(db *gorm.DB) {
	var ids []string
	db.Model(&models.Client{}).Pluck("id", &ids)
	for _, id := range ids {
		serviceslayer.RecalculateClientCost(db, id)
	}
}

func runRestore(db *gorm.DB, req RestoreRequest) error {
	if err := db.Transaction(func(tx *gorm.DB) error {
		return restoreTransaction(tx, req)
	}); err != nil {
		return err
	}
	recalculateAllClients(db)
	return nil
}

// RestoreFromFile loads JSON backup from disk (CLI / deploy)
func RestoreFromFile(db *gorm.DB, path string) (RestoreRequest, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return RestoreRequest{}, err
	}
	var req RestoreRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return RestoreRequest{}, err
	}
	return req, runRestore(db, req)
}

func Restore(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req RestoreRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid JSON format: " + err.Error()})
			return
		}

		if err := runRestore(db, req); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to restore data: " + err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Data restored successfully",
			"counts": gin.H{
				"clients":  len(req.Data.Clients),
				"vps":      len(req.Data.VPS),
				"services": len(req.Data.Services),
				"payments": len(req.Data.Payments),
			},
		})
	}
}

// RestoreBundled reads backups/rnv_manager_backup_2026-03-14.json from server disk
func RestoreBundled(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		name := c.Param("name")
		if name == "" {
			name = "rnv_manager_backup_2026-03-14.json"
		}
		base := filepath.Base(name)
		if base != name {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "nombre de archivo inválido"})
			return
		}

		var raw []byte
		var readErr error
		for _, p := range []string{filepath.Join("/backups", base), filepath.Join("backups", base)} {
			raw, readErr = os.ReadFile(p)
			if readErr == nil {
				break
			}
		}
		if raw == nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "backup no encontrado: " + readErr.Error()})
			return
		}

		var req RestoreRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "JSON inválido: " + err.Error()})
			return
		}

		if err := runRestore(db, req); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Restaurado desde " + base,
			"counts": gin.H{
				"clients":  len(req.Data.Clients),
				"vps":      len(req.Data.VPS),
				"services": len(req.Data.Services),
				"payments": len(req.Data.Payments),
			},
		})
	}
}
