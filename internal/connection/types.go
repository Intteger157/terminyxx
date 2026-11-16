package connection

type ConnectionState int

const (
	StateDisconnected ConnectionState = iota
	StateConnecting
	StateConnected
)

type ConnectRequest struct {
	ID       string `json:"id"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	AuthType string `json:"authType"` // "password" | "key"
	Password string `json:"password"`
	KeyPath  string `json:"keyPath"`
	// Passphrase decrypts an encrypted private key.
	Passphrase string `json:"passphrase"`
	// AcceptHostKey is the SHA256 fingerprint of a host key the user has
	// confirmed. It is appended to known_hosts when the server presents it.
	AcceptHostKey string `json:"acceptHostKey"`
	// ReplaceHostKey, together with AcceptHostKey, replaces a changed host
	// key the user explicitly chose to trust after the mismatch warning.
	ReplaceHostKey bool `json:"replaceHostKey"`
	// ProfileID lets the backend load a saved password from the keychain.
	ProfileID string `json:"profileId"`
	// AllowLegacyAlgorithms lets this host use SHA-1 / CBC algorithms even
	// when the global "modern algorithms only" setting is on.
	AllowLegacyAlgorithms bool `json:"allowLegacyAlgorithms"`
	// AgentForwarding forwards the local ssh-agent to this host; it only
	// takes effect when the global setting allows agent forwarding.
	AgentForwarding bool `json:"agentForwarding"`
}

type FileEntry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	IsDir   bool   `json:"isDir"`
	IsLink  bool   `json:"isLink"`
	Size    int64  `json:"size"`
	Mode    string `json:"mode"`
	ModTime string `json:"modTime"`
}

// TransferRequest copies files between the local machine and the server.
// Sources and DestDir are local or remote paths depending on Direction.
type TransferRequest struct {
	JobID     string   `json:"jobId"`
	Direction string   `json:"direction"` // "upload" | "download"
	Sources   []string `json:"sources"`
	DestDir   string   `json:"destDir"`
	Move      bool     `json:"move"`
}

type TransferProgress struct {
	JobID        string `json:"jobId"`
	ConnectionID string `json:"connectionId"`
	Direction    string `json:"direction"`
	CurrentFile  string `json:"currentFile"`
	FilesDone    int    `json:"filesDone"`
	FilesTotal   int    `json:"filesTotal"`
	BytesDone    int64  `json:"bytesDone"`
	BytesTotal   int64  `json:"bytesTotal"`
	Done         bool   `json:"done"`
	Error        string `json:"error"`
}
