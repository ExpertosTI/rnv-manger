package audit

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

func List(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 200 {
			limit = 50
		}
		offset := (page - 1) * limit

		q := db.Model(&models.AuditLog{}).Preload("User")

		if action := c.Query("action"); action != "" {
			q = q.Where("action = ?", action)
		}
		if entity := c.Query("entity"); entity != "" {
			q = q.Where("entity = ?", entity)
		}
		if search := c.Query("search"); search != "" {
			q = q.Where("description ILIKE ?", "%"+search+"%")
		}
		if from := c.Query("from"); from != "" {
			t, err := time.Parse("2006-01-02", from)
			if err == nil {
				q = q.Where("created_at >= ?", t)
			}
		}
		if to := c.Query("to"); to != "" {
			t, err := time.Parse("2006-01-02", to)
			if err == nil {
				q = q.Where("created_at <= ?", t.Add(24*time.Hour))
			}
		}

		var total int64
		q.Count(&total)

		var logs []models.AuditLog
		q.Order("created_at desc").Limit(limit).Offset(offset).Find(&logs)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    logs,
			"pagination": gin.H{
				"total":  total,
				"page":   page,
				"limit":  limit,
				"pages":  (total + int64(limit) - 1) / int64(limit),
			},
		})
	}
}

func Stats(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		now := time.Now()
		today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		week := today.AddDate(0, 0, -7)
		month := today.AddDate(0, -1, 0)

		var total, todayCount, weekCount, monthCount int64
		db.Model(&models.AuditLog{}).Count(&total)
		db.Model(&models.AuditLog{}).Where("created_at >= ?", today).Count(&todayCount)
		db.Model(&models.AuditLog{}).Where("created_at >= ?", week).Count(&weekCount)
		db.Model(&models.AuditLog{}).Where("created_at >= ?", month).Count(&monthCount)

		type ActionCount struct {
			Action string `json:"action"`
			Count  int64  `json:"count"`
		}
		var actionBreakdown []ActionCount
		db.Model(&models.AuditLog{}).
			Select("action, count(*) as count").
			Group("action").
			Order("count desc").
			Scan(&actionBreakdown)

		type EntityCount struct {
			Entity string `json:"entity"`
			Count  int64  `json:"count"`
		}
		var entityBreakdown []EntityCount
		db.Model(&models.AuditLog{}).
			Select("entity, count(*) as count").
			Group("entity").
			Order("count desc").
			Scan(&entityBreakdown)

		var recent []models.AuditLog
		db.Preload("User").Order("created_at desc").Limit(10).Find(&recent)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"totals": gin.H{
					"total":  total,
					"today":  todayCount,
					"week":   weekCount,
					"month":  monthCount,
				},
				"actionBreakdown": actionBreakdown,
				"entityBreakdown": entityBreakdown,
				"recentActivity":  recent,
			},
		})
	}
}
