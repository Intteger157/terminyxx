package rdpgw

import (
	"bufio"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// TrustStore remembers the server certificates the user accepted, one line
// per "host:port sha256-hex". RDP servers usually present a self-signed
// certificate, so this works like SSH known_hosts.
type TrustStore struct {
	path string
	mu   sync.Mutex
}

func NewTrustStore(path string) *TrustStore {
	return &TrustStore{path: path}
}

// Fingerprint is the SHA-256 of the certificate's DER encoding, as
// colon-separated uppercase hex (what Windows shows as the thumbprint form).
func Fingerprint(cert *x509.Certificate) string {
	sum := sha256.Sum256(cert.Raw)
	h := strings.ToUpper(hex.EncodeToString(sum[:]))
	var b strings.Builder
	for i := 0; i < len(h); i += 2 {
		if i > 0 {
			b.WriteByte(':')
		}
		b.WriteString(h[i : i+2])
	}
	return b.String()
}

// TrustedCert is one accepted certificate, for the Trusted hosts manager.
type TrustedCert struct {
	Dest        string `json:"dest"` // host:port, lower case
	Fingerprint string `json:"fingerprint"`
	Subject     string `json:"subject"`  // empty for entries saved by older versions
	NotAfter    int64  `json:"notAfter"` // unix seconds, 0 = unknown
	Added       int64  `json:"added"`    // unix seconds, 0 = unknown
}

// File lines are "dest fp" followed, since the manager exists, by
// "notAfter added subject…" (the subject may contain spaces).
func (s *TrustStore) read() (map[string]TrustedCert, error) {
	out := map[string]TrustedCert{}
	f, err := os.Open(s.path)
	if os.IsNotExist(err) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		fields := strings.Fields(sc.Text())
		if len(fields) < 2 || strings.HasPrefix(fields[0], "#") {
			continue
		}
		c := TrustedCert{Dest: fields[0], Fingerprint: fields[1]}
		if len(fields) >= 4 {
			c.NotAfter, _ = strconv.ParseInt(fields[2], 10, 64)
			c.Added, _ = strconv.ParseInt(fields[3], 10, 64)
			c.Subject = strings.Join(fields[4:], " ")
		}
		out[c.Dest] = c
	}
	return out, sc.Err()
}

func (s *TrustStore) write(m map[string]TrustedCert) error {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for _, k := range keys {
		c := m[k]
		subject := strings.Join(strings.Fields(c.Subject), " ")
		line := fmt.Sprintf("%s %s %d %d %s", k, c.Fingerprint, c.NotAfter, c.Added, subject)
		b.WriteString(strings.TrimRight(line, " ") + "\n")
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, []byte(b.String()), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// Lookup returns the trusted fingerprint for dest ("host:port").
func (s *TrustStore) Lookup(dest string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	m, err := s.read()
	if err != nil {
		return "", false
	}
	c, ok := m[strings.ToLower(dest)]
	return c.Fingerprint, ok
}

// Trust stores fp for dest, replacing an earlier one. cert, when known, adds
// the subject and expiry shown in the manager.
func (s *TrustStore) Trust(dest, fp string, cert *x509.Certificate) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	m, err := s.read()
	if err != nil {
		return err
	}
	c := TrustedCert{Dest: strings.ToLower(dest), Fingerprint: fp, Added: time.Now().Unix()}
	if cert != nil {
		c.Subject = cert.Subject.String()
		c.NotAfter = cert.NotAfter.Unix()
	}
	m[c.Dest] = c
	return s.write(m)
}

// List returns the accepted certificates sorted by destination.
func (s *TrustStore) List() ([]TrustedCert, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	m, err := s.read()
	if err != nil {
		return nil, err
	}
	out := make([]TrustedCert, 0, len(m))
	for _, c := range m {
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Dest < out[j].Dest })
	return out, nil
}

// Remove forgets the certificate of dest; the next connection asks again.
func (s *TrustStore) Remove(dest string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	m, err := s.read()
	if err != nil {
		return err
	}
	dest = strings.ToLower(dest)
	if _, ok := m[dest]; !ok {
		return fmt.Errorf("no trusted certificate for %s", dest)
	}
	delete(m, dest)
	return s.write(m)
}

// UntrustedError describes a certificate the user has to decide about. Its
// Error() is the machine-readable form the frontend parses:
// RDPCERT_UNKNOWN|dest|fp|subject|issuer|notAfter|reason, or RDPCERT_CHANGED|…
type UntrustedError struct {
	Dest        string
	Fingerprint string
	Subject     string
	Issuer      string
	NotAfter    time.Time
	Changed     bool
	Reason      string
	// Cert is the leaf, for Trust.
	Cert *x509.Certificate
}

func (e *UntrustedError) Error() string {
	kind := "RDPCERT_UNKNOWN"
	if e.Changed {
		kind = "RDPCERT_CHANGED"
	}
	clean := func(s string) string { return strings.ReplaceAll(s, "|", "/") }
	return strings.Join([]string{
		kind, clean(e.Dest), e.Fingerprint, clean(e.Subject), clean(e.Issuer),
		e.NotAfter.UTC().Format(time.RFC3339), clean(e.Reason),
	}, "|")
}

// Check accepts a chain that a public CA issued for host, or a leaf the user
// trusted before; anything else is an *UntrustedError.
func (s *TrustStore) Check(dest, host string, chain []*x509.Certificate) error {
	if len(chain) == 0 {
		return fmt.Errorf("the server sent no certificate")
	}
	leaf := chain[0]
	inter := x509.NewCertPool()
	for _, c := range chain[1:] {
		inter.AddCert(c)
	}
	_, verr := leaf.Verify(x509.VerifyOptions{DNSName: host, Intermediates: inter})
	if verr == nil {
		return nil
	}
	fp := Fingerprint(leaf)
	known, ok := s.Lookup(dest)
	if ok && known == fp {
		return nil
	}
	reason := "self-signed or issued by an untrusted authority"
	if _, isHost := verr.(x509.HostnameError); isHost {
		reason = "issued for a different name"
	} else if ce, isCert := verr.(x509.CertificateInvalidError); isCert && ce.Reason == x509.Expired {
		reason = "expired or not yet valid"
	}
	return &UntrustedError{
		Dest:        dest,
		Fingerprint: fp,
		Subject:     leaf.Subject.String(),
		Issuer:      leaf.Issuer.String(),
		NotAfter:    leaf.NotAfter,
		Changed:     ok,
		Reason:      reason,
		Cert:        leaf,
	}
}
