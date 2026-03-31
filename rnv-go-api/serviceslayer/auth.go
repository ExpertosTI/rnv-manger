package serviceslayer

import (
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/lucsky/cuid"
	"github.com/renace/rnv-go-api/models"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type Claims struct {
	UserID   string `json:"userId"`
	Username string `json:"username"`
	Role     string `json:"role"`
	Name     string `json:"name"`
	jwt.RegisteredClaims
}

// OTPClaims — JWT claims for passwordless OTP sessions
type OTPClaims struct {
	Email          string `json:"email"`
	Role           string `json:"role"`
	AllowedEmailID string `json:"allowed_email_id"`
	jwt.RegisteredClaims
}

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

func CheckPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

func GenerateJWT(user *models.User, secret string) (string, error) {
	claims := Claims{
		UserID:   user.ID,
		Username: user.Username,
		Role:     user.Role,
		Name:     user.Name,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ID:        cuid.New(),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func ValidateJWT(tokenStr, secret string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// GenerateOTPJWT creates a JWT for OTP-authenticated sessions (24h expiry).
func GenerateOTPJWT(allowedEmail *models.AllowedEmail, secret string) (string, error) {
	claims := OTPClaims{
		Email:          allowedEmail.Email,
		Role:           allowedEmail.Role,
		AllowedEmailID: allowedEmail.ID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ID:        cuid.New(),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// ValidateOTPJWT parses and validates an OTP JWT token.
func ValidateOTPJWT(tokenStr, secret string) (*OTPClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &OTPClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*OTPClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// EnsureDefaultAllowedEmail seeds the first allowed email if none exist.
func EnsureDefaultAllowedEmail(db *gorm.DB, email string) {
	// Always ensure expertostird@gmail.com is allowed as superadmin
	targetEmail := "expertostird@gmail.com"
	var existing models.AllowedEmail
	if err := db.Where("email = ?", targetEmail).First(&existing).Error; err != nil {
		// Not found, create it
		ae := models.AllowedEmail{
			Email:  targetEmail,
			Role:   "superadmin",
			Active: true,
		}
		db.Create(&ae)
		log.Printf("[Auth] Authorized owner email: %s (superadmin)", targetEmail)
	}

	var count int64
	db.Model(&models.AllowedEmail{}).Count(&count)
	if count > 1 { // We just added one above
		return
	}
	if email == "" || email == targetEmail {
		return
	}
	ae := models.AllowedEmail{
		Email:  email,
		Role:   "superadmin",
		Active: true,
	}
	if err := db.Create(&ae).Error; err != nil {
		log.Printf("[Auth] Failed to create secondary allowed email: %v", err)
		return
	}
	log.Printf("[Auth] Default allowed email created: %s (superadmin)", email)
}

func LogAuditWithEmail(db *gorm.DB, action, entity, description string, metadata models.JSON, ipAddress, actorEmail *string) {
	entry := models.AuditLog{
		Action:      action,
		Entity:      entity,
		Description: description,
		Metadata:    metadata,
		IPAddress:   ipAddress,
		ActorEmail:  actorEmail,
	}
	if err := db.Create(&entry).Error; err != nil {
		log.Printf("[Audit] Failed to log: %v", err)
	}
}

func EnsureDefaultAdmin(db *gorm.DB, masterPassword string) {
	var count int64
	db.Model(&models.User{}).Count(&count)
	if count > 0 {
		return
	}

	defaultPass := "admin123"
	if masterPassword != "" {
		defaultPass = masterPassword
	}

	hash, err := HashPassword(defaultPass)
	if err != nil {
		log.Printf("[Auth] Failed to hash default password: %v", err)
		return
	}

	admin := models.User{
		Username: "admin",
		Email:    "admin@rnv.local",
		Password: hash,
		Name:     "Administrador",
		Role:     "superadmin",
		IsActive: true,
	}
	if err := db.Create(&admin).Error; err != nil {
		log.Printf("[Auth] Failed to create default admin: %v", err)
		return
	}
	log.Printf("[Auth] Default admin created (username: admin, password: %s)", defaultPass)
}

func LogAudit(db *gorm.DB, action, entity, description string, metadata models.JSON, ipAddress *string, userID *string) {
	entry := models.AuditLog{
		Action:      action,
		Entity:      entity,
		Description: description,
		Metadata:    metadata,
		IPAddress:   ipAddress,
		UserID:      userID,
	}
	if err := db.Create(&entry).Error; err != nil {
		log.Printf("[Audit] Failed to log: %v", err)
	}
}

func CreateNotification(db *gorm.DB, notifType, title, message string, metadata models.JSON) {
	notif := models.Notification{
		Type:     notifType,
		Title:    title,
		Message:  message,
		Metadata: metadata,
	}
	db.Create(&notif)
}

func RecalculateClientCost(db *gorm.DB, clientID string) {
	type Result struct {
		VPSCost     float64
		ServiceCost float64
	}
	var r Result
	db.Raw(`
		SELECT
			COALESCE(SUM(v.monthly_cost),0) as vps_cost,
			COALESCE(SUM(s.monthly_cost),0) as service_cost
		FROM clients c
		LEFT JOIN vps v ON v.client_id = c.id
		LEFT JOIN services s ON s.client_id = c.id
		WHERE c.id = ?
	`, clientID).Scan(&r)

	var client models.Client
	if err := db.First(&client, "id = ?", clientID).Error; err != nil {
		return
	}
	total := r.VPSCost + r.ServiceCost + client.MonthlyFee
	db.Model(&models.Client{}).Where("id = ?", clientID).Update("total_monthly_cost", total)
}
