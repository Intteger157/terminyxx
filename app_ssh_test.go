package main

import (
	"path/filepath"
	"strings"
	"testing"

	"terminyxx/internal/connection"
	"terminyxx/internal/store"
)

func TestPrepareSSHRequestContainerStartup(t *testing.T) {
	data, err := store.Open(filepath.Join(t.TempDir(), "terminyxx.db"), store.NewMemorySecrets())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { data.Close() })
	startup := "sudo su\nsystemctl status app"
	profile := store.SSHProfile{
		ID: "host", Name: "Host", Host: "example.org", Port: 22, Username: "user", AuthType: "key",
		Options: store.HostOptions{StartupCommands: startup, Encoding: "windows-1251"},
	}
	if err := data.SaveSSHProfile(profile); err != nil {
		t.Fatal(err)
	}
	a := &App{data: data}
	container := connection.Container{Runtime: connection.RuntimeDocker, ID: "app"}
	req := connection.ConnectRequest{JumpFor: profile.ID, Container: &container}
	if err := a.prepareSSHRequest(&req); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(req.Startup, "docker exec -it app sh -c ") || strings.Contains(req.Startup, startup) {
		t.Fatalf("container startup = %q", req.Startup)
	}
	if req.Encoding != profile.Options.Encoding {
		t.Fatalf("container encoding = %q, want %q", req.Encoding, profile.Options.Encoding)
	}

	req = connection.ConnectRequest{JumpFor: profile.ID}
	if err := a.prepareSSHRequest(&req); err != nil {
		t.Fatal(err)
	}
	if req.Startup != startup {
		t.Fatalf("host startup = %q, want %q", req.Startup, startup)
	}

	container.ID = "--help"
	req = connection.ConnectRequest{JumpFor: profile.ID, Container: &container}
	if err := a.prepareSSHRequest(&req); err == nil {
		t.Fatal("invalid container ID accepted")
	}
}
