package config

import "testing"

func TestListenAddr(t *testing.T) {
	cases := []struct {
		host string
		port string
		want string
	}{
		{host: "", port: "8080", want: ":8080"},
		{host: "   ", port: "8080", want: ":8080"},
		{host: "", port: "", want: ":8080"},
		{host: "127.0.0.1", port: "8080", want: "127.0.0.1:8080"},
		{host: "0.0.0.0", port: "9090", want: "0.0.0.0:9090"},
		{host: "::1", port: "8080", want: "[::1]:8080"},
		{host: "127.0.0.1:9090", port: "8080", want: "127.0.0.1:9090"},
		{host: "[::1]:9090", port: "8080", want: "[::1]:9090"},
	}
	for _, tc := range cases {
		if got := ListenAddr(tc.host, tc.port); got != tc.want {
			t.Errorf("ListenAddr(%q, %q) = %q, want %q", tc.host, tc.port, got, tc.want)
		}
	}
}
