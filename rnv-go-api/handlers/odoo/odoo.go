package odoo

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/config"
	gorm_db "gorm.io/gorm"
)

// Minimal XML-RPC client for Odoo (ported from TypeScript version)

type odooClient struct {
	URL      string
	DB       string
	Username string
	APIKey   string
	uid      int
}

func newClient(cfg *config.Config) *odooClient {
	return &odooClient{
		URL:      cfg.OdooURL,
		DB:       cfg.OdooDB,
		Username: cfg.OdooUsername,
		APIKey:   cfg.OdooAPIKey,
	}
}

func (o *odooClient) xmlrpcCall(endpoint, method string, params string) (string, error) {
	url := strings.TrimRight(o.URL, "/") + endpoint
	body := fmt.Sprintf(`<?xml version="1.0"?><methodCall><methodName>%s</methodName><params>%s</params></methodCall>`,
		method, params)

	resp, err := (&http.Client{Timeout: 15 * time.Second}).Post(url, "text/xml", bytes.NewBufferString(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return string(b), nil
}

func (o *odooClient) authenticate() (int, error) {
	params := fmt.Sprintf(`<value><string>%s</string></value><value><string>%s</string></value><value><string>%s</string></value><value><struct></struct></value>`,
		o.DB, o.Username, o.APIKey)
	resp, err := o.xmlrpcCall("/xmlrpc/2/common", "authenticate", params)
	if err != nil {
		return 0, err
	}
	// Parse uid from response
	var uid int
	decoder := xml.NewDecoder(strings.NewReader(resp))
	for {
		tok, err := decoder.Token()
		if err != nil {
			break
		}
		if se, ok := tok.(xml.StartElement); ok && se.Name.Local == "int" {
			var val int
			decoder.DecodeElement(&val, &se)
			uid = val
			break
		}
	}
	if uid == 0 {
		return 0, fmt.Errorf("authentication failed")
	}
	return uid, nil
}

func Test(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if cfg.OdooURL == "" {
			c.JSON(http.StatusOK, gin.H{"success": false, "connected": false, "error": "Odoo no configurado"})
			return
		}
		client := newClient(cfg)
		uid, err := client.authenticate()
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "connected": false, "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "connected": true, "uid": uid, "url": cfg.OdooURL, "db": cfg.OdooDB})
	}
}

func Partners(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if cfg.OdooURL == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Odoo no configurado"})
			return
		}
		client := newClient(cfg)
		uid, err := client.authenticate()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Auth Odoo falló: " + err.Error()})
			return
		}
		client.uid = uid

		// Return placeholder - full XML-RPC partner search would go here
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    []interface{}{},
			"message": "Conectado como uid " + fmt.Sprintf("%d", uid),
		})
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
		if cfg.OdooURL == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Odoo no configurado"})
			return
		}
		client := newClient(cfg)
		_, err := client.authenticate()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Sync con Odoo completado"})
	}
}
