package users

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

func List(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var userList []models.User
		db.Order("created_at desc").Find(&userList)

		type UserWithStats struct {
			models.User
			SessionCount  int64 `json:"sessionCount"`
			AuditLogCount int64 `json:"auditLogCount"`
		}

		var result []UserWithStats
		for _, u := range userList {
			var sessions, auditLogs int64
			db.Model(&models.Session{}).Where("user_id = ?", u.ID).Count(&sessions)
			db.Model(&models.AuditLog{}).Where("user_id = ?", u.ID).Count(&auditLogs)
			result = append(result, UserWithStats{User: u, SessionCount: sessions, AuditLogCount: auditLogs})
		}
		if result == nil {
			result = []UserWithStats{}
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
	}
}

type CreateUserRequest struct {
	Username string `json:"username" binding:"required"`
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
	Name     string `json:"name" binding:"required"`
	Role     string `json:"role"`
}

func Create(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req CreateUserRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}

		// Check username/email uniqueness
		var count int64
		db.Model(&models.User{}).Where("username = ? OR email = ?", req.Username, req.Email).Count(&count)
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"success": false, "error": "Username o email ya existe"})
			return
		}

		hash, err := serviceslayer.HashPassword(req.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error procesando contraseña"})
			return
		}

		role := req.Role
		if role == "" {
			role = "admin"
		}

		user := models.User{
			Username: req.Username,
			Email:    req.Email,
			Password: hash,
			Name:     req.Name,
			Role:     role,
			IsActive: true,
		}
		if err := db.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}

		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "CREATE", "user", "Usuario creado: "+user.Username,
			models.JSON{"userId": user.ID, "role": user.Role}, ip, userID)

		c.JSON(http.StatusCreated, gin.H{"success": true, "data": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
			"name":     user.Name,
			"role":     user.Role,
		}})
	}
}

func Delete(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		currentUserID, _ := c.Get("userID")
		if id == currentUserID {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "No puedes eliminarte a ti mismo"})
			return
		}
		var user models.User
		if err := db.First(&user, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Usuario no encontrado"})
			return
		}
		db.Model(&user).Update("is_active", false)
		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "DELETE", "user", "Usuario desactivado: "+user.Username,
			models.JSON{"userId": id}, ip, userID)
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Usuario desactivado"})
	}
}
