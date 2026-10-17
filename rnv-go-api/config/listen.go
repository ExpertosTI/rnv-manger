package config

import (
	"net"
	"strings"
)

// ListenAddr builds the address passed to the HTTP server.
// An empty host keeps the historical behavior: ":" + port, which listens on
// every interface. A host such as 127.0.0.1 is joined with port. A value that
// already includes a port (127.0.0.1:9090 or [::1]:9090) is used as-is.
func ListenAddr(host, port string) string {
	host = strings.TrimSpace(host)
	port = strings.TrimSpace(port)
	if port == "" {
		port = "8080"
	}
	if host == "" {
		return ":" + port
	}
	if h, p, err := net.SplitHostPort(host); err == nil && h != "" && p != "" {
		return host
	}
	return net.JoinHostPort(host, port)
}
