package services

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

func Probe(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			URL string `json:"url"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.URL == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "url requerida"})
			return
		}
		pr := serviceslayer.ProbeURLWithDB(db, body.URL)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": pr})
	}
}
