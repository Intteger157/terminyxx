// Package inventory reads virtual machines from cloud and hypervisor APIs
// (Proxmox VE, AWS EC2) so they can be added to the host library. It talks
// to the REST APIs directly; no SDKs.
package inventory

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"
)

// Kinds.
const (
	KindProxmox = "proxmox"
	KindAWS     = "aws"
)

// Config is the non-secret part of an inventory source.
type Config struct {
	// Proxmox: base URL (https://pve:8006) and API token ID (user@realm!name).
	URL     string `json:"url"`
	TokenID string `json:"tokenId"`
	// Fingerprint pins the server's certificate (SHA-256, hex) once the user
	// accepts it. It must match on subsequent connections.
	Fingerprint string `json:"fingerprint"`

	// AWS: access key ID and the regions to read.
	AccessKeyID string   `json:"accessKeyId"`
	Regions     []string `json:"regions"`

	// What new hosts get.
	Username   string `json:"username"`
	KeyPath    string `json:"keyPath"`
	IdentityID string `json:"identityId"`
	// Address picks "private" (default) or "public" addresses where both exist.
	Address string `json:"address"`
	// RunningOnly skips stopped machines.
	RunningOnly bool `json:"runningOnly"`
}

// Instance is one machine found by a source.
type Instance struct {
	ExternalID string   `json:"externalId"`
	Name       string   `json:"name"`
	Address    string   `json:"address"`
	Windows    bool     `json:"windows"`
	Running    bool     `json:"running"`
	Group      string   `json:"group"` // node or region
	Tags       []string `json:"tags"`
}

// CertPrefix marks an error from a server whose certificate is not trusted:
// "INVCERT_UNKNOWN|<sha256 hex>|<subject>". The UI asks the user and retries
// with Config.Fingerprint set.
const CertPrefix = "INVCERT_UNKNOWN"

const requestTimeout = 20 * time.Second

// Fetch lists the machines of a source.
func Fetch(ctx context.Context, kind string, cfg Config, secret string) ([]Instance, error) {
	var list []Instance
	var err error
	switch kind {
	case KindProxmox:
		list, err = fetchProxmox(ctx, cfg, secret)
	case KindAWS:
		list, err = fetchAWS(ctx, cfg, secret, time.Now())
	default:
		return nil, fmt.Errorf("unknown inventory type %q", kind)
	}
	if err != nil {
		return nil, err
	}
	if cfg.RunningOnly {
		keep := list[:0]
		for _, in := range list {
			if in.Running {
				keep = append(keep, in)
			}
		}
		list = keep
	}
	return list, nil
}

// pinnedClient verifies the server against its pinned fingerprint or, when
// no pin is configured, against the system roots. An unknown certificate fails with
// CertPrefix and its fingerprint.
func pinnedClient(host, fingerprint string) *http.Client {
	tlsCfg := &tls.Config{
		MinVersion:         tls.VersionTLS12,
		InsecureSkipVerify: true, // verified below
		VerifyConnection: func(cs tls.ConnectionState) error {
			return verifyProxmoxCertificate(host, fingerprint, cs.PeerCertificates, nil)
		},
	}
	return &http.Client{
		Timeout:       requestTimeout,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		Transport: &http.Transport{
			Proxy:               http.ProxyFromEnvironment,
			DialContext:         (&net.Dialer{Timeout: 10 * time.Second}).DialContext,
			TLSClientConfig:     tlsCfg,
			TLSHandshakeTimeout: 10 * time.Second,
		},
	}
}

func verifyProxmoxCertificate(host, fingerprint string, chain []*x509.Certificate, roots *x509.CertPool) error {
	if len(chain) == 0 {
		return errors.New("server sent no certificate")
	}
	leaf := chain[0]
	sum := sha256.Sum256(leaf.Raw)
	fp := hex.EncodeToString(sum[:])
	if fingerprint != "" {
		if strings.EqualFold(strings.ReplaceAll(fingerprint, ":", ""), fp) {
			return nil
		}
	} else if host != "" {
		inter := x509.NewCertPool()
		for _, c := range chain[1:] {
			inter.AddCert(c)
		}
		if _, err := leaf.Verify(x509.VerifyOptions{DNSName: host, Roots: roots, Intermediates: inter}); err == nil {
			return nil
		}
	}
	return &CertError{Fingerprint: fp, Subject: leaf.Subject.String()}
}

// CertError is a server certificate that is neither publicly trusted nor
// pinned.
type CertError struct {
	Fingerprint string
	Subject     string
}

func (e *CertError) Error() string {
	return CertPrefix + "|" + e.Fingerprint + "|" + e.Subject
}

// certError unwraps a CertError from an http.Client error so the prefix
// reaches the UI intact.
func certError(err error) error {
	var ce *CertError
	if errors.As(err, &ce) {
		return ce
	}
	return err
}

// usableIP reports whether an address can be connected to from elsewhere.
func usableIP(s string) bool {
	ip := net.ParseIP(s)
	return ip != nil && !ip.IsLoopback() && !ip.IsLinkLocalUnicast() && !ip.IsUnspecified() && !ip.IsMulticast()
}
