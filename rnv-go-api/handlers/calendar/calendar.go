package calendar

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

type CalendarEvent struct {
	ID          string  `json:"id"`
	Type        string  `json:"type"` // due|overdue|paid|task|reminder
	Title       string  `json:"title"`
	Description string  `json:"description,omitempty"`
	Date        string  `json:"date"`
	ClientID    *string `json:"clientId,omitempty"`
	ClientName  string  `json:"clientName,omitempty"`
	ServiceID   *string `json:"serviceId,omitempty"`
	ServiceName string  `json:"serviceName,omitempty"`
	TaskType    string  `json:"taskType,omitempty"`
	Amount      float64 `json:"amount,omitempty"`
	Status      string  `json:"status,omitempty"`
	BillingCycle string `json:"billingCycle,omitempty"`
}

func Events(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		fromStr := c.Query("from")
		toStr := c.Query("to")
		now := time.Now()
		from := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		to := from.AddDate(0, 1, 0).Add(-time.Second)
		if fromStr != "" {
			if t, err := time.Parse("2006-01-02", fromStr); err == nil {
				from = t
			}
		}
		if toStr != "" {
			if t, err := time.Parse("2006-01-02", toStr); err == nil {
				to = t.Add(24*time.Hour - time.Second)
			}
		}

		events := []CalendarEvent{}

		// Billing due dates for active clients in range
		var clients []models.Client
		db.Where("is_active = true").Find(&clients)
		for _, cl := range clients {
			for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
				due := serviceslayer.ClientDueDate(cl, d)
				if due.Year() == d.Year() && due.Month() == d.Month() && due.Day() == d.Day() {
					amount := serviceslayer.ClientChargeAmount(cl)
					evType := "due"
					status := "pending"
					if serviceslayer.ClientPaidForPeriod(db, cl, due) {
						evType = "paid"
						status = "paid"
					} else if time.Now().After(due) {
						_, daysLate, _ := serviceslayer.ClientOverdueInfo(db, cl, time.Now())
						if daysLate > 0 {
							evType = "overdue"
							status = "overdue"
						}
					}
					events = append(events, CalendarEvent{
						ID: "due-" + cl.ID + "-" + due.Format("2006-01-02"),
						Type: evType, Title: "Cobro " + serviceslayer.BillingCycleLabel(cl) + ": " + cl.Name,
						Description: serviceslayer.FormatDueDescription(cl),
						Date: due.Format("2006-01-02"), ClientID: &cl.ID, ClientName: cl.Name,
						Amount: amount, Status: status,
						BillingCycle: serviceslayer.ClientBillingCycle(cl),
					})
				}
			}
		}

		// Scheduled tasks in range
		var tasks []models.ScheduledTask
		db.Preload("Client").Preload("Service").
			Where("scheduled_at >= ? AND scheduled_at <= ?", from, to).
			Order("scheduled_at asc").Find(&tasks)
		for _, t := range tasks {
			desc := ""
			if t.Description != nil {
				desc = *t.Description
			}
			clientName := ""
			if t.Client != nil {
				clientName = t.Client.Name
			}
			serviceName := ""
			if t.Service != nil {
				serviceName = t.Service.Name
			}
			events = append(events, CalendarEvent{
				ID: t.ID, Type: "task", Title: t.Title, Description: desc,
				Date: t.ScheduledAt.Format("2006-01-02"), ClientID: t.ClientID,
				ClientName: clientName, Status: t.Status,
				ServiceID: t.ServiceID, ServiceName: serviceName, TaskType: t.Type,
			})
		}

		// Payments in range
		var payments []models.Payment
		db.Preload("Client").Where("date >= ? AND date <= ? AND status = ?", from, to, "completed").Find(&payments)
		for _, p := range payments {
			name := ""
			if p.Client != nil {
				name = p.Client.Name
			}
			cid := p.ClientID
			events = append(events, CalendarEvent{
				ID: "pay-" + p.ID, Type: "paid", Title: "Pago: " + name,
				Date: p.Date.Format("2006-01-02"), ClientID: &cid, ClientName: name,
				Amount: p.Amount, Status: "completed",
			})
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": events, "count": len(events), "from": from.Format("2006-01-02"), "to": to.Format("2006-01-02")})
	}
}

func ListTasks(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tasks []models.ScheduledTask
		q := db.Preload("Client").Preload("Service").Order("scheduled_at asc")
		if status := c.Query("status"); status != "" {
			q = q.Where("status = ?", status)
		}
		if serviceID := c.Query("serviceId"); serviceID != "" {
			q = q.Where("service_id = ?", serviceID)
		}
		if taskType := c.Query("type"); taskType != "" {
			q = q.Where("type = ?", taskType)
		}
		q.Limit(200).Find(&tasks)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": tasks, "count": len(tasks)})
	}
}

func CreateTask(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Title       string  `json:"title"`
			Description *string `json:"description"`
			Type        string  `json:"type"`
			ScheduledAt string  `json:"scheduledAt"`
			ClientID    *string `json:"clientId"`
			ServiceID   *string `json:"serviceId"`
			Status      string  `json:"status"`
			NotifyEmail bool    `json:"notifyEmail"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if req.Title == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "title requerido"})
			return
		}
		if req.ScheduledAt == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "scheduledAt requerido"})
			return
		}
		scheduledAt, err := time.Parse(time.RFC3339, req.ScheduledAt)
		if err != nil {
			scheduledAt, err = time.Parse("2006-01-02T15:04:05", req.ScheduledAt)
		}
		if err != nil {
			scheduledAt, err = time.Parse("2006-01-02T15:04", req.ScheduledAt)
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "scheduledAt inválido: use ISO8601"})
			return
		}

		task := models.ScheduledTask{
			Title:       req.Title,
			Description: req.Description,
			Type:        req.Type,
			ScheduledAt: scheduledAt,
			ClientID:    req.ClientID,
			ServiceID:   req.ServiceID,
			Status:      req.Status,
			NotifyEmail: req.NotifyEmail,
		}
		if task.Type == "" {
			task.Type = "reminder"
		}
		if task.Status == "" {
			task.Status = "pending"
		}
		if task.ServiceID != nil && *task.ServiceID != "" && task.ClientID == nil {
			var svc models.Service
			if db.First(&svc, "id = ?", *task.ServiceID).Error == nil && svc.ClientID != nil {
				task.ClientID = svc.ClientID
			}
		}
		if err := db.Create(&task).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		db.Preload("Client").Preload("Service").First(&task, "id = ?", task.ID)
		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "CREATE", "scheduled_task", "Tarea programada: "+task.Title,
			models.JSON{"taskId": task.ID, "scheduledAt": task.ScheduledAt, "serviceId": task.ServiceID}, ip, userID)
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": task})
	}
}

func UpdateTask(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var task models.ScheduledTask
		if err := db.First(&task, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Tarea no encontrada"})
			return
		}
		var req struct {
			Title       *string `json:"title"`
			Description *string `json:"description"`
			Status      *string `json:"status"`
			ScheduledAt *string `json:"scheduledAt"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		updates := map[string]interface{}{}
		if req.Title != nil {
			updates["title"] = *req.Title
		}
		if req.Description != nil {
			updates["description"] = *req.Description
		}
		if req.Status != nil {
			updates["status"] = *req.Status
		}
		if req.ScheduledAt != nil {
			if t, err := time.Parse(time.RFC3339, *req.ScheduledAt); err == nil {
				updates["scheduled_at"] = t
			}
		}
		if len(updates) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "sin cambios"})
			return
		}
		if err := db.Model(&task).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		db.Preload("Client").Preload("Service").First(&task, "id = ?", id)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": task})
	}
}

func DeleteTask(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		db.Model(&models.ScheduledTask{}).Where("id = ?", id).Update("status", "cancelled")
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Tarea cancelada"})
	}
}
