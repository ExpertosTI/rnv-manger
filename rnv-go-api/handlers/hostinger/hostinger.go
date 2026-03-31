package hostinger

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

var (
	cachedVPS  []map[string]interface{}
	cachedAt   time.Time
	cacheMutex sync.RWMutex
)

func fetchFromHostinger(token string) ([]map[string]interface{}, error) {
	req, _ := http.NewRequest("GET", "https://api.hostinger.com/v1/vps/virtual-machines", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Data []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse error: %v", err)
	}
	return result.Data, nil
}

func ListVPS(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if cfg.HostingerAPIToken == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "HOSTINGER_API_TOKEN no configurado"})
			return
		}

		// Return cache if fresh (5 min)
		cacheMutex.RLock()
		if time.Since(cachedAt) < 5*time.Minute && cachedVPS != nil {
			cached := cachedVPS
			cacheMutex.RUnlock()
			c.JSON(http.StatusOK, gin.H{"success": true, "data": cached, "cached": true})
			return
		}
		cacheMutex.RUnlock()

		vpsList, err := fetchFromHostinger(cfg.HostingerAPIToken)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}

		cacheMutex.Lock()
		cachedVPS = vpsList
		cachedAt = time.Now()
		cacheMutex.Unlock()

		c.JSON(http.StatusOK, gin.H{"success": true, "data": vpsList})
	}
}

func SyncVPS(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if cfg.HostingerAPIToken == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "HOSTINGER_API_TOKEN no configurado"})
			return
		}

		vpsList, err := fetchFromHostinger(cfg.HostingerAPIToken)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}

		synced := 0
		for _, v := range vpsList {
			id, _ := v["id"].(string)
			if id == "" {
				continue
			}
			var vps models.VPS
			result := db.Where("hostinger_id = ?", id).First(&vps)
			if result.Error != nil {
				// Create new
				ip, _ := v["main_ip"].(string)
				name, _ := v["label"].(string)
				if name == "" {
					name = ip
				}
				newVPS := models.VPS{
					Name:        name,
					IPAddress:   ip,
					Provider:    "Hostinger",
					HostingerID: &id,
					Status:      "active",
				}
				db.Create(&newVPS)
				synced++
			} else {
				// Update status
				status, _ := v["state"].(string)
				if status == "" {
					status = "unknown"
				}
				db.Model(&vps).Update("status", status)
			}
		}

		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "SYNC", "vps",
			fmt.Sprintf("Sync con Hostinger: %d VPS importados", synced),
			models.JSON{"synced": synced}, ip, userID)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": fmt.Sprintf("%d VPS sincronizados de Hostinger", synced),
			"data":    vpsList,
		})
	}
}
