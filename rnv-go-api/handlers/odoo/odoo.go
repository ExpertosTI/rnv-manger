package odoo

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/serviceslayer"
	gorm_db "gorm.io/gorm"
)

func Test(db *gorm_db.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		client, err := serviceslayer.NewOdooClient(db, cfg)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "connected": false, "error": err.Error()})
			return
		}
		info, err := client.TestConnection()
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "connected": false, "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "connected": true, "data": info})
	}
}

func Partners(db *gorm_db.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		client, err := serviceslayer.NewOdooClient(db, cfg)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		query := c.Query("q")
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
		partners, err := client.SearchPartners(query, limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": partners, "count": len(partners)})
	}
}

func Products(db *gorm_db.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		client, err := serviceslayer.NewOdooClient(db, cfg)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		query := c.Query("q")
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
		products, err := client.SearchProducts(query, limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": products, "count": len(products)})
	}
}

func ProductDetail(db *gorm_db.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		client, err := serviceslayer.NewOdooClient(db, cfg)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil || id <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "ID inválido"})
			return
		}
		product, err := client.GetProduct(id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": product})
	}
}

func CreateProduct(db *gorm_db.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		client, err := serviceslayer.NewOdooClient(db, cfg)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		id, err := client.CreateProduct(body)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		product, _ := client.GetProduct(id)
		c.JSON(http.StatusCreated, gin.H{"success": true, "id": id, "data": product})
	}
}

func UpdateProduct(db *gorm_db.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		client, err := serviceslayer.NewOdooClient(db, cfg)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil || id <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "ID inválido"})
			return
		}
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		ok, err := client.UpdateProduct(id, body)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		product, _ := client.GetProduct(id)
		c.JSON(http.StatusOK, gin.H{"success": ok, "data": product})
	}
}

func Invoices(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if cfg.OdooURL == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Odoo no configurado"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []interface{}{}})
	}
}

func Sync(db *gorm_db.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		client, err := serviceslayer.NewOdooClient(db, cfg)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		info, err := client.TestConnection()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Conexión Odoo verificada", "data": info})
	}
}
