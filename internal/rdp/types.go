package rdp

// Options are the per-profile session settings written into the .rdp file.
type Options struct {
	Clipboard   bool   `json:"clipboard"`
	Printers    bool   `json:"printers"`
	Drives      bool   `json:"drives"`    // redirect the local drives listed in DrivePaths
	AllDrives   bool   `json:"allDrives"` // redirect every local drive
	SmartCards  bool   `json:"smartCards"`
	ComPorts    bool   `json:"comPorts"`
	Usb         bool   `json:"usb"`
	Audio       string `json:"audio"` // "local" | "remote" | "off"
	Microphone  bool   `json:"microphone"`
	Camera      bool   `json:"camera"`
	MultiMon    bool   `json:"multiMon"`
	DynamicRes  bool   `json:"dynamicRes"`
	SmartSizing bool   `json:"smartSizing"`
	Admin       bool   `json:"admin"`
	Gateway     string `json:"gateway"`
	// DrivePaths are local folders/drives shared with the remote session.
	DrivePaths []string `json:"drivePaths"`
	// PrinterDrivers is how the built-in client redirects local printers:
	// "universal" (the server prints to PDF, printed here) or "native" (the
	// server uses each printer's own driver, which it must have installed).
	PrinterDrivers string `json:"printerDrivers"`
	// DrivesReadOnly shares the drives read-only (built-in client only).
	DrivesReadOnly bool `json:"drivesReadOnly"`
}

// DefaultOptions matches the behaviour before options existed (clipboard only).
func DefaultOptions() Options {
	return Options{Clipboard: true, Audio: "local", DynamicRes: true, DrivePaths: []string{}, PrinterDrivers: "universal"}
}

type RDPProfile struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Domain   string `json:"domain"`
	// Password is write-only: lists return it empty with HasPassword set. It is
	// kept in the OS keychain.
	Password      string  `json:"password"`
	HasPassword   bool    `json:"hasPassword"`
	ClearPassword bool    `json:"clearPassword"`
	Width         int     `json:"width"`
	Height        int     `json:"height"`
	Fullscreen    bool    `json:"fullscreen"`
	FolderID      string  `json:"folderId"`
	SortOrder     int     `json:"sortOrder"`
	Options       Options `json:"options"`
}
