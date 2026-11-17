//go:build windows

package rdp

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"
	"unicode/utf16"
	"unsafe"
)

type platformLauncher struct{}

func newPlatformLauncher() Launcher {
	return &platformLauncher{}
}

func (l *platformLauncher) Launch(profile RDPProfile, password string) error {
	if password != "" {
		// mstsc picks up a saved TERMSRV/<host> credential automatically.
		if err := saveCredential("TERMSRV/"+profile.Host, profile.Username, profile.Domain, password); err != nil {
			return fmt.Errorf("save credential: %w", err)
		}
	}

	filePath := filepath.Join(os.TempDir(), fmt.Sprintf("terminyxx-%s.rdp", profile.ID))
	if err := os.WriteFile(filePath, []byte(buildRDPFile(profile, true)), 0o600); err != nil {
		return fmt.Errorf("write rdp file: %w", err)
	}
	if err := exec.Command("mstsc.exe", filePath).Start(); err != nil {
		_ = os.Remove(filePath)
		return err
	}
	// mstsc reads the file at startup; remove it shortly after.
	time.AfterFunc(30*time.Second, func() { _ = os.Remove(filePath) })
	return nil
}

var (
	advapi32  = syscall.NewLazyDLL("advapi32.dll")
	procWrite = advapi32.NewProc("CredWriteW")
)

type credential struct {
	Flags              uint32
	Type               uint32
	TargetName         *uint16
	Comment            *uint16
	LastWritten        syscall.Filetime
	CredentialBlobSize uint32
	CredentialBlob     *byte
	Persist            uint32
	AttributeCount     uint32
	Attributes         uintptr
	TargetAlias        *uint16
	UserName           *uint16
}

func saveCredential(target, user, domain, password string) error {
	if domain != "" {
		user = domain + `\` + user
	}
	tgt, err := syscall.UTF16PtrFromString(target)
	if err != nil {
		return err
	}
	usr, err := syscall.UTF16PtrFromString(user)
	if err != nil {
		return err
	}
	blob := utf16.Encode([]rune(password))
	if len(blob) == 0 {
		return nil
	}
	c := credential{
		Type:               1, // CRED_TYPE_GENERIC
		TargetName:         tgt,
		CredentialBlobSize: uint32(len(blob) * 2),
		CredentialBlob:     (*byte)(unsafe.Pointer(&blob[0])),
		Persist:            2, // CRED_PERSIST_LOCAL_MACHINE
		UserName:           usr,
	}
	r, _, callErr := procWrite.Call(uintptr(unsafe.Pointer(&c)), 0)
	if r == 0 {
		return callErr
	}
	return nil
}
