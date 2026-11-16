package rdp

type RDPProfile struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	Domain     string `json:"domain"`
	Password   string `json:"password"` // TODO: encrypt via OS keychain in Phase 5
	Width      int    `json:"width"`
	Height     int    `json:"height"`
	Fullscreen bool   `json:"fullscreen"`
	FolderID   string `json:"folderId"`
	SortOrder  int    `json:"sortOrder"`
}
