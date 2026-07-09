package connection

type ConnectionState int

const (
	StateDisconnected ConnectionState = iota
	StateConnecting
	StateConnected
	StateReconnecting
)

type ConnectRequest struct {
	ID       string `json:"id"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	AuthType string `json:"authType"` // "password" | "key"
	Password string `json:"password"`
	KeyPath  string `json:"keyPath"`
}

type FileEntry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	IsDir   bool   `json:"isDir"`
	Size    int64  `json:"size"`
	ModTime string `json:"modTime"`
}

type TransferProgress struct {
	ConnectionID string `json:"connectionId"`
	Operation    string `json:"operation"`
	Path         string `json:"path"`
	Transferred  int64  `json:"transferred"`
	Total        int64  `json:"total"`
}
