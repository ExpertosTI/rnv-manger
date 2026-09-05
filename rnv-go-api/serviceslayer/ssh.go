package serviceslayer

import (
	"fmt"
	"io"
	"net"
	"time"

	"golang.org/x/crypto/ssh"
)

type SSHConfig struct {
	Host     string
	Port     int
	Username string
	Password string
}

type SSHResult struct {
	Success  bool   `json:"success"`
	Output   string `json:"output"`
	Error    string `json:"error,omitempty"`
	ExitCode int    `json:"exitCode"`
}

func SSHExec(cfg SSHConfig, command string, timeoutSec int) SSHResult {
	if timeoutSec <= 0 {
		timeoutSec = 30
	}

	clientCfg := &ssh.ClientConfig{
		User: cfg.Username,
		Auth: []ssh.AuthMethod{
			ssh.Password(cfg.Password),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	client, err := ssh.Dial("tcp", addr, clientCfg)
	if err != nil {
		return SSHResult{Success: false, Error: err.Error()}
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return SSHResult{Success: false, Error: err.Error()}
	}
	defer session.Close()

	outPipe, _ := session.StdoutPipe()
	errPipe, _ := session.StderrPipe()

	var stdout, stderr []byte
	outDone := make(chan struct{})
	errDone := make(chan struct{})
	go func() {
		stdout, _ = io.ReadAll(outPipe)
		close(outDone)
	}()
	go func() {
		stderr, _ = io.ReadAll(errPipe)
		close(errDone)
	}()

	done := make(chan error, 1)
	go func() {
		done <- session.Run(command)
	}()

	timeout := time.Duration(timeoutSec) * time.Second
	select {
	case err := <-done:
		<-outDone
		<-errDone
		outStr, errStr := string(stdout), string(stderr)
		exitCode := 0
		if err != nil {
			if exitErr, ok := err.(*ssh.ExitError); ok {
				exitCode = exitErr.ExitStatus()
			}
			return SSHResult{Success: exitCode == 0, Output: outStr, Error: errStr, ExitCode: exitCode}
		}
		return SSHResult{Success: true, Output: outStr, ExitCode: 0}
	case <-time.After(timeout):
		return SSHResult{Success: false, Error: "Command timeout after " + fmt.Sprintf("%d", timeoutSec) + "s"}
	}
}

func SSHTest(cfg SSHConfig) (bool, string, int64) {
	start := time.Now()
	result := SSHExec(cfg, "echo 'RNV_SSH_TEST_OK'", 10)
	latency := time.Since(start).Milliseconds()

	if result.Success {
		return true, "Conexión exitosa", latency
	}
	return false, result.Error, latency
}

func SSHGetServerInfo(cfg SSHConfig) map[string]interface{} {
	commands := map[string]string{
		"hostname": "hostname",
		"uptime":   "uptime -p 2>/dev/null || uptime",
		"memory":   "free -h | awk '/^Mem:/ {print $2,$3,$4}'",
		"disk":     "df -h / | awk 'NR==2 {print $2,$3,$4,$5}'",
		"cpu":      "cat /proc/cpuinfo | grep 'model name' | head -1 | cut -d: -f2",
		"os":       "cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'",
		"load":     "cat /proc/loadavg | awk '{print $1,$2,$3}'",
	}

	results := map[string]string{}
	for key, cmd := range commands {
		r := SSHExec(cfg, cmd, 10)
		if r.Success {
			results[key] = r.Output
		}
	}

	// Parse memory
	memParts := splitFields(results["memory"], 3)
	diskParts := splitFields(results["disk"], 4)
	loadParts := splitFields(results["load"], 3)

	return map[string]interface{}{
		"hostname": results["hostname"],
		"uptime":   results["uptime"],
		"memory": map[string]string{
			"total": safeGet(memParts, 0),
			"used":  safeGet(memParts, 1),
			"free":  safeGet(memParts, 2),
		},
		"disk": map[string]string{
			"total":   safeGet(diskParts, 0),
			"used":    safeGet(diskParts, 1),
			"free":    safeGet(diskParts, 2),
			"percent": safeGet(diskParts, 3),
		},
		"cpu":  results["cpu"],
		"os":   results["os"],
		"load": loadParts,
	}
}

func SSHGetMetrics(cfg SSHConfig) map[string]interface{} {
	commands := map[string]string{
		"cpu_usage":  "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1",
		"mem_used":   "free | awk '/^Mem:/ {printf \"%.1f\", $3/$2*100}'",
		"disk_usage": "df / | awk 'NR==2 {print $5}' | tr -d '%'",
		"processes":  "ps aux | wc -l",
		"uptime_sec": "cat /proc/uptime | awk '{print $1}'",
	}
	results := map[string]interface{}{}
	for key, cmd := range commands {
		r := SSHExec(cfg, cmd, 5)
		if r.Success {
			results[key] = r.Output
		} else {
			results[key] = "0"
		}
	}
	return results
}

// Check if a TCP port is open
func CheckPortOpen(host string, port int, timeoutSec int) bool {
	return CheckPortOpenWithRetries(host, port, 1, time.Duration(timeoutSec)*time.Second)
}

// CheckPortOpenWithRetries checks TCP port with multiple attempts to avoid false alerts
func CheckPortOpenWithRetries(host string, port int, retries int, timeout time.Duration) bool {
	if retries <= 0 {
		retries = 1
	}
	addr := net.JoinHostPort(host, fmt.Sprintf("%d", port))
	for i := 0; i < retries; i++ {
		conn, err := net.DialTimeout("tcp", addr, timeout)
		if err == nil {
			conn.Close()
			return true
		}
		if i < retries-1 {
			time.Sleep(time.Duration(1500*(i+1)) * time.Millisecond)
		}
	}
	return false
}

func splitFields(s string, n int) []string {
	parts := make([]string, n)
	fields := []byte{}
	idx := 0
	for i := 0; i < len(s) && idx < n; i++ {
		if s[i] == ' ' || s[i] == '\t' {
			if len(fields) > 0 {
				parts[idx] = string(fields)
				idx++
				fields = []byte{}
			}
		} else {
			fields = append(fields, s[i])
		}
	}
	if len(fields) > 0 && idx < n {
		parts[idx] = string(fields)
	}
	return parts
}

func safeGet(parts []string, i int) string {
	if i < len(parts) {
		return parts[i]
	}
	return "0"
}
