package clients

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

func getEffectiveUser(c *gin.Context, db *gorm.DB) (userID string, role string) {
	userRole, _ := c.Get("userRole")
	role, _ = userRole.(string)

	if uid := middleware.GetUserID(c); uid != nil && *uid != "" {
		return *uid, role
	}
	if email := middleware.GetActorEmail(c); email != nil && *email != "" {
		var u models.User
		if err := db.Where("email = ?", *email).First(&u).Error; err == nil {
			return u.ID, role
		}
	}
	return "", role
}

func List(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		currentUserID, role := getEffectiveUser(c, db)

		query := db.Model(&models.Client{}).
			Preload("Affiliate").
			Preload("VPSList.Services").Preload("Services").
			Preload("Payments", func(db *gorm.DB) *gorm.DB {
				return db.Order("date desc").Limit(5)
			})

		// Strict Scoping: Affiliates can ONLY see their assigned clients
		if role == "affiliate" || role == "collaborator" {
			query = query.Where("affiliate_id = ?", currentUserID)
		} else if affID := c.Query("affiliateId"); affID != "" {
			// Master filter by specific affiliate
			if affID == "unassigned" {
				query = query.Where("affiliate_id IS NULL OR affiliate_id = ''")
			} else {
				query = query.Where("affiliate_id = ?", affID)
			}
		}

		var clientList []models.Client
		query.Order("created_at desc").Find(&clientList)

		type EnrichedClient struct {
			models.Client
			CalculatedCosts gin.H      `json:"calculatedCosts"`
			SyncedWithOdoo  bool       `json:"syncedWithOdoo"`
			IsOverdue       bool       `json:"isOverdue"`
			DaysLate        int        `json:"daysLate"`
			AmountDue       float64    `json:"amountDue"`
			PaidThisPeriod  bool       `json:"paidThisPeriod"`
			BillingStatus   string     `json:"billingStatus"`
			HealthIssues    []string   `json:"healthIssues"`
			LastPaymentDate *string    `json:"lastPaymentDate,omitempty"`
			ServiceCount            int        `json:"serviceCount"`
			VPSCount                int        `json:"vpsCount"`
			ImplementationPaid      float64    `json:"implementationPaid"`
			ImplementationBalance   float64    `json:"implementationBalance"`
			TotalCollaboratorEarned float64    `json:"totalCollaboratorEarned"`
			TotalCompanyEarned      float64    `json:"totalCompanyEarned"`
		}

		now := time.Now()
		var enriched []EnrichedClient
		for _, cl := range clientList {
			vpsCost := 0.0
			for _, v := range cl.VPSList {
				vpsCost += v.MonthlyCost
			}
			svcCost := 0.0
			for _, s := range cl.Services {
				svcCost += s.MonthlyCost
			}
			total := vpsCost + svcCost + cl.MonthlyFee

			paidThisPeriod := serviceslayer.ClientPaidForPeriod(db, cl, now)
			isOverdue, daysLate, amountDue := serviceslayer.ClientOverdueInfo(db, cl, now)
			isDueToday := serviceslayer.ClientDueToday(db, cl, now)

			billingStatus := "pending"
			if !cl.IsActive {
				billingStatus = "inactive"
			} else if total <= 0 && cl.AnnualFee <= 0 {
				billingStatus = "unconfigured"
			} else if paidThisPeriod {
				billingStatus = "paid"
			} else if isOverdue {
				billingStatus = "overdue"
			} else if isDueToday {
				billingStatus = "due_today"
			}

			var healthIssues []string
			if (cl.Email == nil || *cl.Email == "") && (cl.Phone == nil || *cl.Phone == "") {
				healthIssues = append(healthIssues, "sin_contacto")
			}
			if len(cl.Services) == 0 && len(cl.VPSList) == 0 {
				healthIssues = append(healthIssues, "sin_servicios")
			}
			if (len(cl.Services) > 0 || len(cl.VPSList) > 0) && total <= 0 && cl.AnnualFee <= 0 {
				healthIssues = append(healthIssues, "tarifa_cero")
			}
			if cl.OdooPartnerID == nil {
				healthIssues = append(healthIssues, "sin_odoo")
			}
			if isOverdue {
				healthIssues = append(healthIssues, "en_mora")
			}

			var lastPayDate *string
			var implPaid, colabEarned, compEarned float64
			for _, p := range cl.Payments {
				if p.Status == "completed" {
					if p.Type == "implementation" {
						implPaid += p.Amount
					}
					colabEarned += p.CollaboratorAmount
					compEarned += p.CompanyAmount
				}
			}
			if len(cl.Payments) > 0 {
				formatted := cl.Payments[0].Date.Format("2006-01-02")
				lastPayDate = &formatted
			}

			implBalance := cl.ImplementationFee - implPaid
			if implBalance < 0 {
				implBalance = 0
			}

			enriched = append(enriched, EnrichedClient{
				Client: cl,
				CalculatedCosts: gin.H{
					"vps":      vpsCost,
					"services": svcCost,
					"baseFee":  cl.MonthlyFee,
					"total":    total,
				},
				SyncedWithOdoo:          cl.OdooPartnerID != nil,
				IsOverdue:               isOverdue,
				DaysLate:                daysLate,
				AmountDue:               amountDue,
				PaidThisPeriod:          paidThisPeriod,
				BillingStatus:           billingStatus,
				HealthIssues:            healthIssues,
				LastPaymentDate:         lastPayDate,
				ServiceCount:            len(cl.Services),
				VPSCount:                len(cl.VPSList),
				ImplementationPaid:      implPaid,
				ImplementationBalance:   implBalance,
				TotalCollaboratorEarned: colabEarned,
				TotalCompanyEarned:      compEarned,
			})
		}
		if enriched == nil {
			enriched = []EnrichedClient{}
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": enriched})
	}
}

func Create(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		currentUserID, role := getEffectiveUser(c, db)

		var client models.Client
		if err := c.ShouldBindJSON(&client); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}

		// If created by an affiliate, auto-assign to themselves
		if role == "affiliate" || role == "collaborator" {
			client.AffiliateID = &currentUserID
		}

		if err := db.Create(&client).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "CREATE", "client", "Cliente creado: "+client.Name,
			models.JSON{"clientId": client.ID, "affiliateId": client.AffiliateID}, ip, userID)
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": client})
	}
}

func Get(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		currentUserID, role := getEffectiveUser(c, db)
		id := c.Param("id")

		var client models.Client
		if err := db.Preload("Affiliate").Preload("VPSList.Services").Preload("Services").
			Preload("Payments", func(db *gorm.DB) *gorm.DB {
				return db.Order("date desc")
			}).First(&client, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Cliente no encontrado"})
			return
		}

		// Affiliate scoping check
		if (role == "affiliate" || role == "collaborator") && (client.AffiliateID == nil || *client.AffiliateID != currentUserID) {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "No tienes acceso a este cliente"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": client})
	}
}

func Update(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		currentUserID, role := getEffectiveUser(c, db)
		id := c.Param("id")

		var existing models.Client
		if err := db.First(&existing, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Cliente no encontrado"})
			return
		}

		// Affiliate scoping check
		if (role == "affiliate" || role == "collaborator") && (existing.AffiliateID == nil || *existing.AffiliateID != currentUserID) {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "No tienes permisos para modificar este cliente"})
			return
		}

		var client models.Client
		if err := c.ShouldBindJSON(&client); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		client.ID = id

		// Prevent affiliate from re-assigning ownership
		if role == "affiliate" || role == "collaborator" {
			client.AffiliateID = existing.AffiliateID
		}

		db.Save(&client)
		serviceslayer.RecalculateClientCost(db, id)
		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "UPDATE", "client", "Cliente actualizado: "+client.Name,
			models.JSON{"clientId": id}, ip, userID)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": client})
	}
}

func Delete(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		currentUserID, role := getEffectiveUser(c, db)
		id := c.Param("id")

		var client models.Client
		if err := db.First(&client, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Cliente no encontrado"})
			return
		}

		// Affiliate scoping check
		if (role == "affiliate" || role == "collaborator") && (client.AffiliateID == nil || *client.AffiliateID != currentUserID) {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "No tienes permisos para eliminar este cliente"})
			return
		}

		db.Delete(&client)
		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "DELETE", "client", "Cliente eliminado: "+client.Name,
			models.JSON{"clientId": id}, ip, userID)
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Cliente eliminado"})
	}
}

type AbonoRequest struct {
	Amount             float64  `json:"amount" binding:"required"`
	Currency           string   `json:"currency"`
	Type               string   `json:"type"` // implementation | monthly | custom
	PaymentMethod      string   `json:"paymentMethod"`
	Notes              string   `json:"notes"`
	CollaboratorAmount *float64 `json:"collaboratorAmount,omitempty"`
	CompanyAmount      *float64 `json:"companyAmount,omitempty"`
}

func RecordAbono(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		currentUserID, role := getEffectiveUser(c, db)
		id := c.Param("id")

		var client models.Client
		if err := db.First(&client, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Cliente no encontrado"})
			return
		}

		if (role == "affiliate" || role == "collaborator") && (client.AffiliateID == nil || *client.AffiliateID != currentUserID) {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "No tienes acceso a este cliente"})
			return
		}

		var req AbonoRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Monto requerido"})
			return
		}
		if req.Amount <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "El monto del abono debe ser mayor a 0"})
			return
		}

		currency := req.Currency
		if currency == "" {
			currency = client.Currency
		}
		if currency == "" {
			currency = "USD"
		}

		pType := req.Type
		if pType != "implementation" && pType != "monthly" {
			pType = "implementation"
		}

		// Calculate collaborator & company split
		var colabAmt, compAmt float64
		if req.CollaboratorAmount != nil && req.CompanyAmount != nil {
			colabAmt = *req.CollaboratorAmount
			compAmt = *req.CompanyAmount
		} else if pType == "implementation" {
			if client.ImplementationFee > 0 {
				ratio := client.ImplementationFeeCollaborator / client.ImplementationFee
				colabAmt = req.Amount * ratio
				compAmt = req.Amount - colabAmt
			} else {
				colabAmt = req.Amount * 0.5
				compAmt = req.Amount * 0.5
			}
		} else { // monthly
			if client.MonthlyFee > 0 {
				ratio := client.MonthlyFeeCollaborator / client.MonthlyFee
				colabAmt = req.Amount * ratio
				compAmt = req.Amount - colabAmt
			} else {
				colabAmt = req.Amount * 0.5
				compAmt = req.Amount * 0.5
			}
		}

		// Consecutive receipt number: REC-YYYYMM-XXXX
		now := time.Now()
		var count int64
		db.Model(&models.Payment{}).Count(&count)
		receiptNo := fmt.Sprintf("REC-%s-%04d", now.Format("200601"), count+1)

		method := req.PaymentMethod
		if method == "" {
			method = "transferencia"
		}

		noteStr := req.Notes
		payment := models.Payment{
			Amount:             req.Amount,
			Currency:           currency,
			Date:               now,
			Status:             "completed",
			ClientID:           client.ID,
			Type:               pType,
			CollaboratorAmount: colabAmt,
			CompanyAmount:      compAmt,
			PaymentMethod:      method,
			ReceiptNumber:      &receiptNo,
			Notes:              &noteStr,
			BillingCycle:       client.BillingCycle,
		}

		if err := db.Create(&payment).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}

		// Calculate updated balances
		var totalImplPaid float64
		db.Model(&models.Payment{}).
			Where("client_id = ? AND type = 'implementation' AND status = 'completed'", client.ID).
			Select("COALESCE(SUM(amount), 0)").Scan(&totalImplPaid)

		implBalance := client.ImplementationFee - totalImplPaid
		if implBalance < 0 {
			implBalance = 0
		}

		// If full implementation fee was paid, we can advance stage to 'implementacion' or 'activo' if currently in 'cotizacion'
		if client.Stage == "cotizacion" && totalImplPaid > 0 {
			db.Model(&client).Update("stage", "implementacion")
		}

		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "ABONO", "payment",
			fmt.Sprintf("Abono registrado: %s %.2f para cliente %s (Recibo: %s)", currency, req.Amount, client.Name, receiptNo),
			models.JSON{"clientId": client.ID, "amount": req.Amount, "type": pType, "receiptNumber": receiptNo}, ip, userID)

		c.JSON(http.StatusCreated, gin.H{
			"success":               true,
			"data":                  payment,
			"receiptNumber":         receiptNo,
			"implementationPaid":    totalImplPaid,
			"implementationBalance": implBalance,
			"collaboratorAmount":    colabAmt,
			"companyAmount":         compAmt,
		})
	}
}

type UpdateStageRequest struct {
	Stage                   string      `json:"stage" binding:"required"`
	AssessmentNotes         *string     `json:"assessmentNotes,omitempty"`
	ImplementationProgress  models.JSON `json:"implementationChecklist,omitempty"`
}

func UpdateStage(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		currentUserID, role := getEffectiveUser(c, db)
		id := c.Param("id")

		var client models.Client
		if err := db.First(&client, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Cliente no encontrado"})
			return
		}

		if (role == "affiliate" || role == "collaborator") && (client.AffiliateID == nil || *client.AffiliateID != currentUserID) {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "No tienes acceso a este cliente"})
			return
		}

		var req UpdateStageRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Etapa requerida"})
			return
		}

		updates := map[string]interface{}{
			"stage": req.Stage,
		}
		if req.AssessmentNotes != nil {
			updates["assessment_notes"] = *req.AssessmentNotes
		}
		if req.ImplementationProgress != nil {
			updates["implementation_checklist"] = req.ImplementationProgress
		}

		if err := db.Model(&client).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": client})
	}
}

