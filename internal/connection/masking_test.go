package connection

import (
	"strings"
	"sync"
	"testing"
	"time"
)

type maskSink struct {
	mu  sync.Mutex
	out strings.Builder
}

func (s *maskSink) emit(v string) {
	s.mu.Lock()
	s.out.WriteString(v)
	s.mu.Unlock()
}

func (s *maskSink) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.out.String()
}

func runMasker(opts MaskOptions, chunks ...string) string {
	sink := &maskSink{}
	m := NewOutputMasker(func() MaskOptions { return opts }, sink.emit)
	for _, c := range chunks {
		m.Write(c)
	}
	m.Flush()
	return sink.String()
}

var on = MaskOptions{Enabled: true}

func TestMaskKeyValue(t *testing.T) {
	cases := []struct {
		name   string
		chunks []string
		want   string
	}{
		{"env", []string{"PASSWORD=hunter2\n"}, "PASSWORD=•••••••\n"},
		{"aws", []string{"AWS_SECRET_ACCESS_KEY=abcd/efgh\n"}, "AWS_SECRET_ACCESS_KEY=•••••••••\n"},
		{"json", []string{`{"api_key": "k123"}`}, `{"api_key": ••••••}`},
		{"split key", []string{"export TOK", "EN=abc def\n"}, "export TOKEN=••• def\n"},
		{"split value", []string{"SECRET=ab", "cd\n"}, "SECRET=••••\n"},
		{"echo char by char", strings.Split("db_password=xyz", ""), "db_password=•••"},
		{"bearer", []string{"Authorization: Bearer abc.def.ghi\n"}, "Authorization: Bearer •••••••••••\n"},
		{"url creds", []string{"postgres://user:s3cr3t@db/x\n"}, "postgres://user:••••••@db/x\n"},
		{"untouched", []string{"PWD=/home/user passed: 5\n"}, "PWD=/home/user passed: 5\n"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := runMasker(on, c.chunks...); got != c.want {
				t.Errorf("got %q, want %q", got, c.want)
			}
		})
	}
}

func TestMaskKeepsEscapes(t *testing.T) {
	in := "\x1b[1;32mTOKEN=\x1b[0mabc \x1b]0;title\x07\x1b[2J"
	got := runMasker(on, in[:5], in[5:12], in[12:])
	// The value follows an SGR reset, so it is a separate text run; it is
	// still recognised through the line context.
	want := "\x1b[1;32mTOKEN=\x1b[0m••• \x1b]0;title\x07\x1b[2J"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestMaskPrivateKey(t *testing.T) {
	key := "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk\nAAAA+/==\n-----END OPENSSH PRIVATE KEY-----\nok\n"
	got := runMasker(on, key[:20], key[20:44], key[44:70], key[70:])
	want := "-----BEGIN OPENSSH PRIVATE KEY-----\n•••••••••••••••\n••••••••\n-----END OPENSSH PRIVATE KEY-----\nok\n"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestMaskIPs(t *testing.T) {
	opts := MaskOptions{Enabled: true, IPs: true}
	got := runMasker(opts, "from 10.0.", "12.254 port 22 and fe80::1\n")
	want := "from ••.•.••.••• port 22 and ••••::•\n"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
	if got := runMasker(on, "from 10.0.12.254\n"); got != "from 10.0.12.254\n" {
		t.Errorf("IPs masked while disabled: %q", got)
	}
	if got := runMasker(opts, "12:34:56 up 3 days\n"); got != "12:34:56 up 3 days\n" {
		t.Errorf("time masked as IPv6: %q", got)
	}
}

func TestMaskHeldTokenFlushesOnTimer(t *testing.T) {
	sink := &maskSink{}
	m := NewOutputMasker(func() MaskOptions { return on }, sink.emit)
	m.Write("token eyJhbGciOi")
	if got := sink.String(); got != "token " {
		t.Fatalf("partial token emitted early: %q", got)
	}
	m.Write("J.eyJzdWIiOiIx.sig rest")
	want := "token " + strings.Repeat("•", len("eyJhbGciOiJ.eyJzdWIiOiIx.sig")) + " rest"
	if got := sink.String(); got != want {
		t.Fatalf("got %q, want %q", got, want)
	}

	m.Write(" s") // could be the start of "sk-…": held, then flushed by the timer
	time.Sleep(4 * holdDelay)
	if got := sink.String(); got != want+" s" {
		t.Errorf("held text not flushed: %q", got)
	}
}

func TestMaskDisabledPassthrough(t *testing.T) {
	in := "PASSWORD=x\x1b[0m"
	if got := runMasker(MaskOptions{}, in); got != in {
		t.Errorf("got %q", got)
	}
}

func TestLooksSensitive(t *testing.T) {
	if !LooksSensitive("export GITHUB_TOKEN=ghp_abc") || LooksSensitive("ls -la /etc") {
		t.Error("LooksSensitive misclassified")
	}
}
