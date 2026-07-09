package rdp

type Launcher interface {
	Launch(profile RDPProfile) error
}

func NewLauncher() Launcher {
	return newPlatformLauncher()
}
