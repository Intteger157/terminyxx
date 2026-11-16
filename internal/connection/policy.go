package connection

import (
	"slices"

	"golang.org/x/crypto/ssh"
)

// Policy is the part of the app's security settings the connection layer
// enforces. The manager holds the current one; it can change at any time.
type Policy struct {
	// MaskOutput redacts secrets in terminal output (see masking.go).
	MaskOutput bool
	// MaskIPs also redacts IPv4/IPv6 addresses while MaskOutput is on.
	MaskIPs bool
	// StrictAlgorithms limits new connections to modern key exchanges,
	// ciphers, MACs and host key types, unless a host allows legacy ones.
	StrictAlgorithms bool
	// AllowAgentForwarding is the global switch; a host must also ask for it.
	AllowAgentForwarding bool
}

// DefaultPolicy is used until the app's settings are loaded.
func DefaultPolicy() Policy {
	return Policy{StrictAlgorithms: true}
}

// modernAlgorithms is what x/crypto/ssh considers secure, minus anything
// still SHA-1 based. x/crypto already keeps CBC ciphers, diffie-hellman-
// group1-sha1, 3DES, arcfour and hmac-sha1-96 in InsecureAlgorithms().
func modernAlgorithms() ssh.Algorithms {
	a := ssh.SupportedAlgorithms()
	sha1 := func(s string) bool {
		switch s {
		case ssh.KeyAlgoRSA, ssh.CertAlgoRSAv01, ssh.InsecureKeyAlgoDSA, ssh.InsecureCertAlgoDSAv01,
			ssh.HMACSHA1, ssh.InsecureKeyExchangeDH14SHA1, ssh.InsecureKeyExchangeDHGEXSHA1:
			return true
		}
		return false
	}
	a.KeyExchanges = slices.DeleteFunc(a.KeyExchanges, sha1)
	a.MACs = slices.DeleteFunc(a.MACs, sha1)
	a.HostKeys = slices.DeleteFunc(a.HostKeys, sha1)
	return a
}

// applyAlgorithms restricts config to modern algorithms. knownHostKeyAlgos
// (from known_hosts) is narrowed to the modern ones, falling back to the full
// modern list when none of the host's known keys qualify, so the handshake
// fails with a clear "no common algorithm" instead of a host key mismatch.
func applyAlgorithms(config *ssh.ClientConfig, knownHostKeyAlgos []string) {
	a := modernAlgorithms()
	config.KeyExchanges = a.KeyExchanges
	config.Ciphers = a.Ciphers
	config.MACs = a.MACs
	if len(knownHostKeyAlgos) > 0 {
		var keep []string
		for _, k := range knownHostKeyAlgos {
			if slices.Contains(a.HostKeys, k) {
				keep = append(keep, k)
			}
		}
		if len(keep) > 0 {
			config.HostKeyAlgorithms = keep
			return
		}
	}
	config.HostKeyAlgorithms = a.HostKeys
}

// legacyAlgorithms enables everything x/crypto implements, for old devices
// (routers, switches) that only speak SHA-1 / CBC.
func legacyAlgorithms(config *ssh.ClientConfig) {
	sup, ins := ssh.SupportedAlgorithms(), ssh.InsecureAlgorithms()
	config.KeyExchanges = append(sup.KeyExchanges, ins.KeyExchanges...)
	config.Ciphers = append(sup.Ciphers, ins.Ciphers...)
	config.MACs = append(sup.MACs, ins.MACs...)
	if len(config.HostKeyAlgorithms) == 0 {
		config.HostKeyAlgorithms = append(sup.HostKeys, ins.HostKeys...)
	}
}
