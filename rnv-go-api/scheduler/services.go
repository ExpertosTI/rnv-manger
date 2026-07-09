package scheduler

import (
	"log"
	"time"

	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

// StartServiceMonitorScheduler checks service URLs/ports every 3 minutes.
func StartServiceMonitorScheduler(db *gorm.DB, cfg *config.Config) {
	log.Println("[Scheduler] Service monitor started (interval: 3m)")
	go func() {
		results := serviceslayer.RunServiceHealthChecks(db, cfg)
		changed := 0
		for _, r := range results {
			if r.Changed {
				changed++
			}
		}
		if changed > 0 {
			log.Printf("[ServiceMonitor] %d status changes / %d checked", changed, len(results))
		}
	}()

	ticker := time.NewTicker(3 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		go func() {
			results := serviceslayer.RunServiceHealthChecks(db, cfg)
			changed := 0
			offline := 0
			for _, r := range results {
				if r.Changed {
					changed++
				}
				if !r.Online && r.Method != "skip" {
					offline++
				}
			}
			if changed > 0 || offline > 0 {
				log.Printf("[ServiceMonitor] checked=%d changed=%d offline=%d", len(results), changed, offline)
			}
		}()
	}
}
