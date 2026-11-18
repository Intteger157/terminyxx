package store

import "testing"

func TestStreamProfiles(t *testing.T) {
	s, _, _ := openTest(t)
	must(t, s.SaveFolder(Folder{ID: "f", Name: "Lab"}))
	must(t, s.SaveSSHProfile(SSHProfile{ID: "ssh1", Name: "web", Host: "w", Port: 22, Username: "u", AuthType: "password", FolderID: "f"}))
	must(t, s.SaveStreamProfile(StreamProfile{ID: "t1", Kind: KindTelnet, Host: " sw1.lab ", FolderID: "f"}))
	must(t, s.SaveStreamProfile(StreamProfile{ID: "c1", Name: "Console", Kind: KindSerial, Device: "COM3", Baud: 115200, Parity: "bogus", StopBits: "2"}))

	if err := s.SaveStreamProfile(StreamProfile{ID: "x", Kind: "ssh", Host: "h"}); err == nil {
		t.Fatal("unknown kind accepted")
	}
	if err := s.SaveStreamProfile(StreamProfile{ID: "x", Kind: KindSerial}); err == nil {
		t.Fatal("serial without a port accepted")
	}

	list, err := s.ListStreamProfiles()
	must(t, err)
	if len(list) != 2 {
		t.Fatalf("list = %+v", list)
	}
	tn, err := s.GetStreamProfile("t1")
	must(t, err)
	if tn.Name != "sw1.lab" || tn.Host != "sw1.lab" || tn.Port != 23 || tn.SortOrder != 1 {
		t.Fatalf("telnet = %+v", tn)
	}
	c, _ := s.GetStreamProfile("c1")
	if c.Baud != 115200 || c.DataBits != 8 || c.Parity != "none" || c.StopBits != "2" {
		t.Fatalf("serial = %+v", c)
	}

	// Streams share the host order with SSH and RDP hosts.
	must(t, s.MoveItem(KindStream, "t1", "f", 0))
	tn, _ = s.GetStreamProfile("t1")
	web, _ := s.GetSSHProfile("ssh1")
	if tn.SortOrder != 0 || web.SortOrder != 1 {
		t.Fatalf("order after move: stream %d, ssh %d", tn.SortOrder, web.SortOrder)
	}

	// Deleting the folder moves its contents up.
	must(t, s.DeleteFolder("f"))
	tn, _ = s.GetStreamProfile("t1")
	if tn.FolderID != "" {
		t.Fatalf("folder kept: %+v", tn)
	}

	// Sync carries them.
	b, err := s.ExportBundle(false)
	must(t, err)
	if len(b.Streams) != 2 {
		t.Fatalf("bundle streams = %+v", b.Streams)
	}
	s2, _, _ := openTest(t)
	res, err := s2.ImportBundle(b)
	must(t, err)
	if got, _ := s2.ListStreamProfiles(); len(got) != 2 || res.Hosts != 3 {
		t.Fatalf("imported %+v, %+v", got, res)
	}

	must(t, s.DeleteStreamProfile("c1"))
	if list, _ := s.ListStreamProfiles(); len(list) != 1 {
		t.Fatalf("after delete: %+v", list)
	}
}
