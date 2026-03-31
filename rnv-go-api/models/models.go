package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"github.com/lucsky/cuid"
	"gorm.io/gorm"
)

// JSON type for flexible JSON columns
type JSON map[string]interface{}

func (j JSON) Value() (driver.Value, error) {
	if j == nil {
		return nil, nil
	}
	b, err := json.Marshal(j)
	return string(b), err
}

func (j *JSON) Scan(value interface{}) error {
	if value == nil {
		*j = nil
		return nil
	}
	var bytes []byte
	switch v := value.(type) {
	case string:
		bytes = []byte(v)
	case []byte:
		bytes = v
	default:
		return fmt.Errorf("unsupported type: %T", value)
	}
	return json.Unmarshal(bytes, j)
}

// StringArray for text[] columns
type StringArray []string

func (s StringArray) Value() (driver.Value, error) {
	if s == nil {
		return "{}", nil
	}
	b, err := json.Marshal(s)
	return string(b), err
}

func (s *StringArray) Scan(value interface{}) error {
	if value == nil {
		*s = StringArray{}
		return nil
	}
	var bytes []byte
	switch v := value.(type) {
	case string:
		bytes = []byte(v)
	case []byte:
		bytes = v
	default:
		return fmt.Errorf("unsupported type: %T", value)
	}
	// Try JSON array first, then PostgreSQL array format
	if err := json.Unmarshal(bytes, s); err != nil {
		// Handle PostgreSQL {a,b,c} format
		*s = StringArray{}
	}
	return nil
}

// Client model
type Client struct {
	ID              string      `gorm:"type:text;primaryKey" json:"id"`
	Name            string      `gorm:"not null" json:"name"`
	Email           *string     `json:"email,omitempty"`
	Phone           *string     `json:"phone,omitempty"`
	CompanyName     *string     `json:"companyName,omitempty"`
	Notes           *string     `json:"notes,omitempty"`
	IsActive        bool        `gorm:"default:true" json:"isActive"`
	MonthlyFee      float64     `gorm:"default:0" json:"monthlyFee"`
	Currency        string      `gorm:"default:'USD'" json:"currency"`
	PaymentDay      int         `gorm:"default:1" json:"paymentDay"`
	OdooPartnerID   *int        `json:"odooPartnerId,omitempty"`
	OdooLastSync    *time.Time  `json:"odooLastSync,omitempty"`
	OdooData        JSON        `gorm:"type:jsonb" json:"odooData,omitempty"`
	TotalMonthlyCost float64    `gorm:"default:0" json:"totalMonthlyCost"`
	VPSList         []VPS       `gorm:"foreignKey:ClientID" json:"vpsList,omitempty"`
	Services        []Service   `gorm:"foreignKey:ClientID" json:"services,omitempty"`
	Payments        []Payment   `gorm:"foreignKey:ClientID" json:"payments,omitempty"`
	CreatedAt       time.Time   `json:"createdAt"`
	UpdatedAt       time.Time   `json:"updatedAt"`
}

func (c *Client) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = cuid.New()
	}
	return nil
}

// VPS model
type VPS struct {
	ID          string      `gorm:"type:text;primaryKey" json:"id"`
	Name        string      `gorm:"not null" json:"name"`
	IPAddress   string      `gorm:"not null" json:"ipAddress"`
	Provider    string      `gorm:"default:'Hostinger'" json:"provider"`
	HostingerID *string     `json:"hostingerId,omitempty"`
	Status      string      `gorm:"default:'unknown'" json:"status"`
	SSHUser     string      `gorm:"default:'root'" json:"sshUser"`
	SSHPort     int         `gorm:"default:22" json:"sshPort"`
	SSHKeyPath  *string     `json:"sshKeyPath,omitempty"`
	MonthlyCost float64     `gorm:"default:0" json:"monthlyCost"`
	ConfigFiles StringArray `gorm:"type:text;serializer:json" json:"configFiles"`
	ClientID    *string     `json:"clientId,omitempty"`
	Client      *Client     `gorm:"foreignKey:ClientID" json:"client,omitempty"`
	Services    []Service   `gorm:"foreignKey:VpsID" json:"services,omitempty"`
	CreatedAt   time.Time   `json:"createdAt"`
	UpdatedAt   time.Time   `json:"updatedAt"`
}

func (v *VPS) BeforeCreate(tx *gorm.DB) error {
	if v.ID == "" {
		v.ID = cuid.New()
	}
	return nil
}

// Service model
type Service struct {
	ID            string     `gorm:"type:text;primaryKey" json:"id"`
	Name          string     `gorm:"not null" json:"name"`
	Type          string     `gorm:"not null" json:"type"`
	Port          *int       `json:"port,omitempty"`
	ConfigFile    *string    `json:"configFile,omitempty"`
	URL           *string    `json:"url,omitempty"`
	ResourceUsage JSON       `gorm:"type:jsonb" json:"resourceUsage,omitempty"`
	MonthlyCost   float64    `gorm:"default:0" json:"monthlyCost"`
	Status        string     `gorm:"default:'unknown'" json:"status"`
	LastChecked   *time.Time `json:"lastChecked,omitempty"`
	VpsID         *string    `json:"vpsId,omitempty"`
	VPS           *VPS       `gorm:"foreignKey:VpsID" json:"vps,omitempty"`
	ClientID      *string    `json:"clientId,omitempty"`
	Client        *Client    `gorm:"foreignKey:ClientID" json:"client,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

func (s *Service) BeforeCreate(tx *gorm.DB) error {
	if s.ID == "" {
		s.ID = cuid.New()
	}
	return nil
}

// Payment model
type Payment struct {
	ID              string    `gorm:"type:text;primaryKey" json:"id"`
	Amount          float64   `gorm:"not null" json:"amount"`
	Currency        string    `gorm:"default:'USD'" json:"currency"`
	Date            time.Time `gorm:"default:now()" json:"date"`
	Status          string    `gorm:"default:'completed'" json:"status"`
	OdooInvoiceID   *int      `json:"odooInvoiceId,omitempty"`
	OdooInvoiceName *string   `json:"odooInvoiceName,omitempty"`
	ClientID        string    `gorm:"not null" json:"clientId"`
	Client          *Client   `gorm:"foreignKey:ClientID" json:"client,omitempty"`
	Notes           *string   `json:"notes,omitempty"`
	CreatedAt       time.Time `json:"createdAt"`
}

func (p *Payment) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = cuid.New()
	}
	return nil
}

// RevenueHistory model
type RevenueHistory struct {
	ID        string    `gorm:"type:text;primaryKey" json:"id"`
	Year      int       `gorm:"not null" json:"year"`
	Month     int       `gorm:"not null" json:"month"`
	Revenue   float64   `gorm:"default:0" json:"revenue"`
	Expenses  float64   `gorm:"default:0" json:"expenses"`
	Clients   int       `gorm:"default:0" json:"clients"`
	VPS       int       `gorm:"default:0" json:"vps"`
	Services  int       `gorm:"default:0" json:"services"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (r *RevenueHistory) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = cuid.New()
	}
	return nil
}

// AppSettings model
type AppSettings struct {
	ID        string    `gorm:"type:text;primaryKey" json:"id"`
	Key       string    `gorm:"uniqueIndex;not null" json:"key"`
	Value     string    `gorm:"not null" json:"value"`
	Category  string    `gorm:"default:'general'" json:"category"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (a *AppSettings) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = cuid.New()
	}
	return nil
}

// User model
type User struct {
	ID          string     `gorm:"type:text;primaryKey" json:"id"`
	Username    string     `gorm:"uniqueIndex;not null" json:"username"`
	Email       string     `gorm:"uniqueIndex;not null" json:"email"`
	Password    string     `gorm:"not null" json:"-"`
	Name        string     `gorm:"not null" json:"name"`
	Role        string     `gorm:"default:'admin'" json:"role"`
	Avatar      *string    `json:"avatar,omitempty"`
	IsActive    bool       `gorm:"default:true" json:"isActive"`
	LastLoginAt *time.Time `json:"lastLoginAt,omitempty"`
	Sessions    []Session  `gorm:"foreignKey:UserID" json:"-"`
	AuditLogs   []AuditLog `gorm:"foreignKey:UserID" json:"-"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == "" {
		u.ID = cuid.New()
	}
	return nil
}

// Session model
type Session struct {
	ID             string    `gorm:"type:text;primaryKey" json:"id"`
	Token          string    `gorm:"uniqueIndex;not null" json:"token"`
	UserID         string    `json:"userId"`
	User           *User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	AllowedEmailID *string   `json:"allowedEmailId,omitempty"`
	IPAddress      *string   `json:"ipAddress,omitempty"`
	UserAgent      *string   `json:"userAgent,omitempty"`
	ExpiresAt      time.Time `json:"expiresAt"`
	CreatedAt      time.Time `json:"createdAt"`
}

func (s *Session) BeforeCreate(tx *gorm.DB) error {
	if s.ID == "" {
		s.ID = cuid.New()
	}
	return nil
}

// AuditLog model
type AuditLog struct {
	ID          string    `gorm:"type:text;primaryKey" json:"id"`
	Action      string    `gorm:"index;not null" json:"action"`
	Entity      string    `gorm:"index;not null" json:"entity"`
	EntityID    *string   `json:"entityId,omitempty"`
	Description string    `gorm:"not null" json:"description"`
	Metadata    JSON      `gorm:"type:jsonb" json:"metadata,omitempty"`
	IPAddress   *string   `json:"ipAddress,omitempty"`
	UserID      *string   `gorm:"index" json:"userId,omitempty"`
	User        *User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	ActorEmail  *string   `gorm:"index" json:"actorEmail,omitempty"`
	CreatedAt   time.Time `gorm:"index" json:"createdAt"`
}

func (a *AuditLog) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = cuid.New()
	}
	return nil
}

// Notification model
type Notification struct {
	ID        string    `gorm:"type:text;primaryKey" json:"id"`
	Type      string    `gorm:"not null" json:"type"`
	Title     string    `gorm:"not null" json:"title"`
	Message   string    `gorm:"not null" json:"message"`
	IsRead    bool      `gorm:"default:false" json:"isRead"`
	Metadata  JSON      `gorm:"type:jsonb" json:"metadata,omitempty"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

func (n *Notification) BeforeCreate(tx *gorm.DB) error {
	if n.ID == "" {
		n.ID = cuid.New()
	}
	return nil
}

// AllowedEmail model — authorized emails for OTP login
type AllowedEmail struct {
	ID        string    `gorm:"type:text;primaryKey" json:"id"`
	Email     string    `gorm:"uniqueIndex;not null" json:"email"`
	Role      string    `gorm:"default:'admin'" json:"role"`
	Active    bool      `gorm:"default:true" json:"active"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (a *AllowedEmail) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = cuid.New()
	}
	return nil
}

// OTPCode model — one-time codes for passwordless login
type OTPCode struct {
	ID        string    `gorm:"type:text;primaryKey" json:"id"`
	Email     string    `gorm:"not null;index" json:"email"`
	CodeHash  string    `gorm:"not null" json:"-"`
	ExpiresAt time.Time `gorm:"not null" json:"expiresAt"`
	Used      bool      `gorm:"default:false" json:"used"`
	Attempts  int       `gorm:"default:0" json:"attempts"`
	IPAddress *string   `json:"ipAddress,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

func (o *OTPCode) BeforeCreate(tx *gorm.DB) error {
	if o.ID == "" {
		o.ID = cuid.New()
	}
	return nil
}

// Credential model — encrypted credentials for deployed services
type Credential struct {
	ID        string         `gorm:"type:text;primaryKey" json:"id"`
	ServiceID *string        `json:"serviceId,omitempty"`
	Service   *Service       `gorm:"foreignKey:ServiceID;constraint:OnDelete:SET NULL" json:"service,omitempty"`
	ClientID  *string        `json:"clientId,omitempty"`
	Client    *Client        `gorm:"foreignKey:ClientID;constraint:OnDelete:SET NULL" json:"client,omitempty"`
	Label     string         `gorm:"not null" json:"label"`
	URL       string         `json:"url"`
	Username  string         `json:"username"`
	Password  string         `json:"password"`
	Port      *int           `json:"port,omitempty"`
	Notes     string         `json:"notes,omitempty"`
	CreatedBy string         `gorm:"not null" json:"createdBy"`
	Creator   *AllowedEmail  `gorm:"foreignKey:CreatedBy" json:"creator,omitempty"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deletedAt,omitempty"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
}

func (cr *Credential) BeforeCreate(tx *gorm.DB) error {
	if cr.ID == "" {
		cr.ID = cuid.New()
	}
	return nil
}

// ServiceToken model — API tokens for CLI access
type ServiceToken struct {
	ID        string     `gorm:"type:text;primaryKey" json:"id"`
	Name      string     `gorm:"not null" json:"name"`
	TokenHash string     `gorm:"not null" json:"-"`
	Role      string     `gorm:"default:'viewer'" json:"role"`
	CreatedBy string     `gorm:"not null" json:"createdBy"`
	Creator   *AllowedEmail `gorm:"foreignKey:CreatedBy" json:"creator,omitempty"`
	ExpiresAt *time.Time `json:"expiresAt,omitempty"`
	LastUsed  *time.Time `json:"lastUsed,omitempty"`
	Active    bool       `gorm:"default:true" json:"active"`
	CreatedAt time.Time  `json:"createdAt"`
}

func (st *ServiceToken) BeforeCreate(tx *gorm.DB) error {
	if st.ID == "" {
		st.ID = cuid.New()
	}
	return nil
}
