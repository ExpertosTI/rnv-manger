package auth

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type CreateTokenRequest struct {
	Name      string `json:"name" binding:"required"`
	Role      string `json:"role"`
	ExpiresAt string `json:"expiresAt"`
}

func CreateServiceToken(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req CreateTokenRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Nombre requerido"})
			return
		}

		role := req.Role
		if role == "" {
			role = "viewer"
		}
		if role != "admin" && role != "viewer" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Role debe ser 'admin' o 'viewer'"})
			return
		}

		// Generate random token
		tokenBytes := make([]byte, 48)
		if _, err := rand.Read(tokenBytes); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error generando token"})
			return
		}
		plainToken := "rnv_" + base64.URLEncoding.EncodeToString(tokenBytes)

		// Hash it
		hash, err := bcrypt.GenerateFromPassword([]byte(plainToken), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error interno"})
			return
		}

		allowedEmailID, _ := c.Get("allowedEmailID")
		createdBy, _ := allowedEmailID.(string)

		st := models.ServiceToken{
			Name:      req.Name,
			TokenHash: string(hash),
			Role:      role,
			CreatedBy: createdBy,
			Active:    true,
		}

		if req.ExpiresAt != "" {
			if t, err := time.Parse(time.RFC3339, req.ExpiresAt); err == nil {
				st.ExpiresAt = &t
			}
		}

		if err := db.Create(&st).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error creando token"})
			return
		}

		ip := middleware.GetClientIP(c)
		email := middleware.GetActorEmail(c)
		serviceslayer.LogAuditWithEmail(db, "CREATE", "service_token",
			"Token de servicio creado: "+req.Name,
			models.JSON{"tokenId": st.ID, "role": role}, ip, email)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"token":   plainToken,
			"data": gin.H{
				"id":        st.ID,
				"name":      st.Name,
				"role":      st.Role,
				"createdBy": st.CreatedBy,
				"expiresAt": st.ExpiresAt,
				"active":    st.Active,
				"createdAt": st.CreatedAt,
			},
		})
	}
}

func ListServiceTokens(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tokens []models.ServiceToken
		db.Order("created_at DESC").Find(&tokens)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    tokens,
		})
	}
}

func RevokeServiceToken(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		result := db.Model(&models.ServiceToken{}).Where("id = ?", id).Update("active", false)
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Token no encontrado"})
			return
		}

		ip := middleware.GetClientIP(c)
		email := middleware.GetActorEmail(c)
		serviceslayer.LogAuditWithEmail(db, "DELETE", "service_token",
			"Token de servicio revocado",
			models.JSON{"tokenId": id}, ip, email)

		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Token revocado"})
	}
}
