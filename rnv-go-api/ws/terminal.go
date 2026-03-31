package ws

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

var upgrader = websocket.Upgrader{
	CheckOrigin:     func(r *http.Request) bool { return true },
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
}

type TerminalInit struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
	Cols     uint32 `json:"cols"`
	Rows     uint32 `json:"rows"`
}

type TerminalMessage struct {
	Type string `json:"type"` // "resize", "input", "init"
	Data string `json:"data"`
	Cols uint32 `json:"cols"`
	Rows uint32 `json:"rows"`
}

func Terminal() gin.HandlerFunc {
	return func(c *gin.Context) {
		ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("[WS Terminal] Upgrade failed: %v", err)
			return
		}
		defer ws.Close()

		// 1. Read init message with SSH credentials
		_, msg, err := ws.ReadMessage()
		if err != nil {
			return
		}

		var init TerminalInit
		if err := json.Unmarshal(msg, &init); err != nil {
			ws.WriteMessage(websocket.TextMessage, []byte(`{"error":"Invalid init message"}`))
			return
		}

		if init.Port == 0 {
			init.Port = 22
		}
		if init.Cols == 0 {
			init.Cols = 80
		}
		if init.Rows == 0 {
			init.Rows = 24
		}

		// 2. Connect SSH
		sshCfg := &ssh.ClientConfig{
			User: init.Username,
			Auth: []ssh.AuthMethod{ssh.Password(init.Password)},
			HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		}

		addr := fmt.Sprintf("%s:%d", init.Host, init.Port)
		sshClient, err := ssh.Dial("tcp", addr, sshCfg)
		if err != nil {
			ws.WriteMessage(websocket.TextMessage, []byte(`{"error":"SSH connection failed: `+err.Error()+`"}`))
			return
		}
		defer sshClient.Close()

		// 3. Open session + PTY
		session, err := sshClient.NewSession()
		if err != nil {
			ws.WriteMessage(websocket.TextMessage, []byte(`{"error":"Failed to open SSH session"}`))
			return
		}
		defer session.Close()

		modes := ssh.TerminalModes{
			ssh.ECHO:          1,
			ssh.TTY_OP_ISPEED: 14400,
			ssh.TTY_OP_OSPEED: 14400,
		}

		if err := session.RequestPty("xterm-256color", int(init.Rows), int(init.Cols), modes); err != nil {
			ws.WriteMessage(websocket.TextMessage, []byte(`{"error":"Failed to request PTY"}`))
			return
		}

		stdin, _ := session.StdinPipe()
		stdout, _ := session.StdoutPipe()
		stderr, _ := session.StderrPipe()

		if err := session.Shell(); err != nil {
			ws.WriteMessage(websocket.TextMessage, []byte(`{"error":"Failed to start shell"}`))
			return
		}

		// Signal ready
		ws.WriteMessage(websocket.TextMessage, []byte(`{"type":"ready"}`))

		// 4. Goroutine: SSH output → WebSocket
		go func() {
			buf := make([]byte, 4096)
			for {
				n, err := stdout.Read(buf)
				if n > 0 {
					ws.WriteMessage(websocket.BinaryMessage, buf[:n])
				}
				if err != nil {
					if err != io.EOF {
						log.Printf("[WS Terminal] stdout read error: %v", err)
					}
					ws.WriteMessage(websocket.TextMessage, []byte(`{"type":"exit"}`))
					return
				}
			}
		}()

		go func() {
			buf := make([]byte, 1024)
			for {
				n, err := stderr.Read(buf)
				if n > 0 {
					ws.WriteMessage(websocket.BinaryMessage, buf[:n])
				}
				if err != nil {
					return
				}
			}
		}()

		// 5. WebSocket input → SSH stdin
		for {
			_, data, err := ws.ReadMessage()
			if err != nil {
				break
			}

			// Check if it's a control message (JSON)
			var ctrl TerminalMessage
			if json.Unmarshal(data, &ctrl) == nil && ctrl.Type != "" {
				switch ctrl.Type {
				case "resize":
					session.WindowChange(int(ctrl.Rows), int(ctrl.Cols))
				case "input":
					stdin.Write([]byte(ctrl.Data))
				}
			} else {
				// Raw terminal input
				stdin.Write(data)
			}
		}
	}
}
