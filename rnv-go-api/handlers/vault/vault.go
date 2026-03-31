package vault

import (
	"fmt"
	"math"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/crypto"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

type CredentialRequest struct {
	Label     string `json:"label" binding:"required"`
	ClientID  string `json:"clientId"`
	ServiceID string `json:"serviceId"`
	URL       string `json:"url"`
	Username  string `json:"username"`
	Password  string `json:"password"`
	Port      *int   `json:"port"`
	Notes     string `json:"notes"`
}

type GenerateRequest struct {
	Length    int  `json:"length"`
	Symbols   bool `json:"symbols"`
	Uppercase bool `json:"uppercase"`
	Lowercase bool `json:"lowercase"`
	Numbers   bool `json:"numbers"`
}

type GenerateAndSaveRequest struct {
	CredentialRequest
	GenerateRequest `json:"generatorParams"`
}

func List(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
		if page < 1 {
			page = 1
		}
		if perPage < 1 || perPage > 100 {
			perPage = 20
		}

		query := db.Model(&models.Credential{})

		if clientID := c.Query("client_id"); clientID != "" {
			query = query.Where("client_id = ?", clientID)
		}
		if serviceID := c.Query("service_id"); serviceID != "" {
			query = query.Where("service_id = ?", serviceID)
		}
		if search := c.Query("search"); search != "" {
			query = query.Where("label ILIKE ?", "%"+search+"%")
		}

		var total int64
		query.Count(&total)

		var credentials []models.Credential
		query.Preload("Client").Preload("Service").Preload("Creator").
			Order("created_at DESC").
			Offset((page - 1) * perPage).Limit(perPage).
			Find(&credentials)

		// Mask sensitive fields in list view
		for i := range credentials {
			credentials[i].URL = ""
			credentials[i].Username = ""
			credentials[i].Password = ""
			credentials[i].Notes = ""
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    credentials,
			"pagination": gin.H{
				"total":      total,
				"page":       page,
				"per_page":   perPage,
				"total_pages": int(math.Ceil(float64(total) / float64(perPage))),
			},
		})
	}
}

func Get(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		if cfg.VaultMasterKey == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "error": "Vault master key no configurada"})
			return
		}

		var cred models.Credential
		if err := db.Preload("Client").Preload("Service").Preload("Creator").
			First(&cred, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Credencial no encontrada"})
			return
		}

		// Decrypt fields
		var err error
		cred.URL, err = crypto.Decrypt(cred.URL, cfg.VaultMasterKey)
		if err != nil {
			cred.URL = "[error al descifrar]"
		}
		cred.Username, err = crypto.Decrypt(cred.Username, cfg.VaultMasterKey)
		if err != nil {
			cred.Username = "[error al descifrar]"
		}
		cred.Password, err = crypto.Decrypt(cred.Password, cfg.VaultMasterKey)
		if err != nil {
			cred.Password = "[error al descifrar]"
		}
		cred.Notes, err = crypto.Decrypt(cred.Notes, cfg.VaultMasterKey)
		if err != nil {
			cred.Notes = "[error al descifrar]"
		}

		// Audit log
		ip := middleware.GetClientIP(c)
		email := middleware.GetActorEmail(c)
		serviceslayer.LogAuditWithEmail(db, "VAULT_VIEW", "credential",
			fmt.Sprintf("Credencial consultada: %s", cred.Label),
			models.JSON{"credentialId": id, "label": cred.Label}, ip, email)

		c.JSON(http.StatusOK, gin.H{"success": true, "data": cred})
	}
}

func Create(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req CredentialRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Label requerido"})
			return
		}

		if cfg.VaultMasterKey == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "error": "Vault master key no configurada"})
			return
		}

		cred, err := encryptAndBuild(req, cfg.VaultMasterKey)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error cifrando credenciales"})
			return
		}

		allowedEmailID, _ := c.Get("allowedEmailID")
		cred.CreatedBy, _ = allowedEmailID.(string)

		if err := db.Create(&cred).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error guardando credencial"})
			return
		}

		ip := middleware.GetClientIP(c)
		email := middleware.GetActorEmail(c)
		serviceslayer.LogAuditWithEmail(db, "CREATE", "credential",
			"Credencial creada: "+req.Label,
			models.JSON{"credentialId": cred.ID, "label": req.Label}, ip, email)

		c.JSON(http.StatusOK, gin.H{"success": true, "data": cred})
	}
}

func Update(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		if cfg.VaultMasterKey == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "error": "Vault master key no configurada"})
			return
		}

		var existing models.Credential
		if err := db.First(&existing, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Credencial no encontrada"})
			return
		}

		// RBAC: admin can only update own
		role, _ := c.Get("userRole")
		allowedEmailID, _ := c.Get("allowedEmailID")
		if role == "admin" && existing.CreatedBy != allowedEmailID.(string) {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "Solo puedes editar credenciales propias"})
			return
		}

		var req CredentialRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}

		updated, err := encryptAndBuild(req, cfg.VaultMasterKey)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error cifrando"})
			return
		}

		db.Model(&existing).Updates(map[string]interface{}{
			"label":      updated.Label,
			"client_id":  updated.ClientID,
			"service_id": updated.ServiceID,
			"url":        updated.URL,
			"username":   updated.Username,
			"password":   updated.Password,
			"port":       updated.Port,
			"notes":      updated.Notes,
		})

		ip := middleware.GetClientIP(c)
		email := middleware.GetActorEmail(c)
		serviceslayer.LogAuditWithEmail(db, "UPDATE", "credential",
			"Credencial actualizada: "+req.Label,
			models.JSON{"credentialId": id}, ip, email)

		c.JSON(http.StatusOK, gin.H{"success": true, "data": existing})
	}
}

func Delete(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		result := db.Delete(&models.Credential{}, "id = ?", id)
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Credencial no encontrada"})
			return
		}

		ip := middleware.GetClientIP(c)
		email := middleware.GetActorEmail(c)
		serviceslayer.LogAuditWithEmail(db, "DELETE", "credential",
			"Credencial eliminada (soft-delete)",
			models.JSON{"credentialId": id}, ip, email)

		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Credencial eliminada"})
	}
}

func Generate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req GenerateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			req = GenerateRequest{Length: 32, Uppercase: true, Lowercase: true, Numbers: true, Symbols: true}
		}
		if req.Length == 0 {
			req.Length = 32
		}

		password, err := serviceslayer.GeneratePassword(req.Length, req.Uppercase, req.Lowercase, req.Numbers, req.Symbols)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "password": password})
	}
}

func GenerateAndSave(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req GenerateAndSaveRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Label requerido"})
			return
		}

		if cfg.VaultMasterKey == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "error": "Vault master key no configurada"})
			return
		}

		length := req.GenerateRequest.Length
		if length == 0 {
			length = 32
		}

		password, err := serviceslayer.GeneratePassword(length, req.Uppercase, req.Lowercase, req.Numbers, req.Symbols)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}

		req.CredentialRequest.Password = password
		cred, err := encryptAndBuild(req.CredentialRequest, cfg.VaultMasterKey)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error cifrando"})
			return
		}

		allowedEmailID, _ := c.Get("allowedEmailID")
		cred.CreatedBy, _ = allowedEmailID.(string)

		if err := db.Create(&cred).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error guardando"})
			return
		}

		ip := middleware.GetClientIP(c)
		email := middleware.GetActorEmail(c)
		serviceslayer.LogAuditWithEmail(db, "CREATE", "credential",
			"Credencial generada y guardada: "+req.Label,
			models.JSON{"credentialId": cred.ID, "label": req.Label}, ip, email)

		// Return plaintext password this one time
		c.JSON(http.StatusOK, gin.H{
			"success":  true,
			"data":     cred,
			"password": password,
		})
	}
}

func RotateKey(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if cfg.VaultMasterKeyOld == "" || cfg.VaultMasterKey == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Ambas VAULT_MASTER_KEY y VAULT_MASTER_KEY_OLD deben estar configuradas",
			})
			return
		}

		var credentials []models.Credential
		db.Unscoped().Find(&credentials)

		rotated := 0
		errors := 0
		for _, cred := range credentials {
			updated := false

			if cred.URL != "" {
				if v, err := crypto.RotateField(cred.URL, cfg.VaultMasterKeyOld, cfg.VaultMasterKey); err == nil {
					cred.URL = v
					updated = true
				} else {
					errors++
				}
			}
			if cred.Username != "" {
				if v, err := crypto.RotateField(cred.Username, cfg.VaultMasterKeyOld, cfg.VaultMasterKey); err == nil {
					cred.Username = v
					updated = true
				} else {
					errors++
				}
			}
			if cred.Password != "" {
				if v, err := crypto.RotateField(cred.Password, cfg.VaultMasterKeyOld, cfg.VaultMasterKey); err == nil {
					cred.Password = v
					updated = true
				} else {
					errors++
				}
			}
			if cred.Notes != "" {
				if v, err := crypto.RotateField(cred.Notes, cfg.VaultMasterKeyOld, cfg.VaultMasterKey); err == nil {
					cred.Notes = v
					updated = true
				} else {
					errors++
				}
			}

			if updated {
				db.Unscoped().Save(&cred)
				rotated++
			}
		}

		ip := middleware.GetClientIP(c)
		email := middleware.GetActorEmail(c)
		serviceslayer.LogAuditWithEmail(db, "VAULT_ROTATE_KEY", "system",
			fmt.Sprintf("Rotacion de clave: %d credenciales rotadas, %d errores", rotated, errors),
			nil, ip, email)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": fmt.Sprintf("%d credenciales rotadas, %d errores", rotated, errors),
		})
	}
}

func encryptAndBuild(req CredentialRequest, masterKey string) (models.Credential, error) {
	var cred models.Credential

	encURL, err := crypto.Encrypt(req.URL, masterKey)
	if err != nil {
		return cred, err
	}
	encUsername, err := crypto.Encrypt(req.Username, masterKey)
	if err != nil {
		return cred, err
	}
	encPassword, err := crypto.Encrypt(req.Password, masterKey)
	if err != nil {
		return cred, err
	}
	encNotes, err := crypto.Encrypt(req.Notes, masterKey)
	if err != nil {
		return cred, err
	}

	cred = models.Credential{
		Label:    req.Label,
		URL:      encURL,
		Username: encUsername,
		Password: encPassword,
		Port:     req.Port,
		Notes:    encNotes,
	}

	if req.ClientID != "" {
		cred.ClientID = &req.ClientID
	}
	if req.ServiceID != "" {
		cred.ServiceID = &req.ServiceID
	}

	return cred, nil
}
