// Package rdpgw is the local half of the built-in RDP client. The RDP engine
// (IronRDP compiled to WebAssembly) runs in the webview and can't open TCP or
// TLS connections itself, so it talks to this gateway over a WebSocket on
// 127.0.0.1 using IronRDP's RDCleanPath protocol: the client sends its X.224
// connection request, the gateway forwards it to the server, upgrades the
// connection to TLS, checks the server certificate against what the user
// trusted, and returns the certificate chain. From then on the WebSocket
// carries the RDP stream that the gateway relays through the TLS connection.
package rdpgw

import (
	"encoding/asn1"
	"errors"
	"fmt"
)

// rdcleanpathVersion is RDCleanPath VERSION_1 (BASE_VERSION 3389 + 1).
const rdcleanpathVersion = 3390

// Error codes from ironrdp-rdcleanpath.
const (
	errGeneral           = 1
	errNegotiation       = 2
	errTargetUnreachable = 103
	errDNSFailed         = 104
	errTLSFailed         = 105
	// errUntrusted is ours (implementation-specific range): the server
	// certificate is not the one the user accepted.
	errUntrusted = 0x4000
)

// pdu mirrors ironrdp_rdcleanpath::RDCleanPathPdu. Every field is an
// EXPLICIT context-specific tag; zero-valued optional fields are omitted.
type pdu struct {
	Version           int64    `asn1:"explicit,tag:0"`
	Error             pduError `asn1:"optional,explicit,tag:1"`
	Destination       string   `asn1:"optional,explicit,tag:2,utf8"`
	ProxyAuth         string   `asn1:"optional,explicit,tag:3,utf8"`
	ServerAuth        string   `asn1:"optional,explicit,tag:4,utf8"`
	PreconnectionBlob string   `asn1:"optional,explicit,tag:5,utf8"`
	X224              []byte   `asn1:"optional,explicit,tag:6"`
	ServerCertChain   [][]byte `asn1:"optional,explicit,tag:7"`
	ServerAddr        string   `asn1:"optional,explicit,tag:9,utf8"`
}

type pduError struct {
	Code       int `asn1:"explicit,tag:0"`
	HTTPStatus int `asn1:"optional,explicit,tag:1"`
	WSAError   int `asn1:"optional,explicit,tag:2"`
	TLSAlert   int `asn1:"optional,explicit,tag:3"`
}

func decodePDU(b []byte) (*pdu, error) {
	var p pdu
	rest, err := asn1.Unmarshal(b, &p)
	if err != nil {
		return nil, fmt.Errorf("decode RDCleanPath PDU: %w", err)
	}
	if len(rest) != 0 {
		return nil, errors.New("trailing data after RDCleanPath PDU")
	}
	if p.Version != rdcleanpathVersion {
		return nil, fmt.Errorf("unsupported RDCleanPath version %d", p.Version)
	}
	return &p, nil
}

func encodeResponse(serverAddr string, x224 []byte, chain [][]byte) ([]byte, error) {
	return asn1.Marshal(pdu{Version: rdcleanpathVersion, X224: x224, ServerCertChain: chain, ServerAddr: serverAddr})
}

func encodeError(e pduError) []byte {
	b, err := asn1.Marshal(pdu{Version: rdcleanpathVersion, Error: e})
	if err != nil {
		panic(err) // a fixed structure of small integers always encodes
	}
	return b
}

func encodeNegotiationError(x224 []byte) []byte {
	b, err := asn1.Marshal(pdu{Version: rdcleanpathVersion, Error: pduError{Code: errNegotiation}, X224: x224})
	if err != nil {
		panic(err)
	}
	return b
}

// derLength reports the total length of the DER element at the start of b,
// or 0 if b doesn't hold the whole header yet.
func derLength(b []byte) (int, error) {
	if len(b) < 2 {
		return 0, nil
	}
	if b[0] != 0x30 {
		return 0, errors.New("not an RDCleanPath PDU")
	}
	l := int(b[1])
	if l < 0x80 {
		return 2 + l, nil
	}
	n := l & 0x7f
	if n == 0 || n > 3 {
		return 0, errors.New("bad DER length")
	}
	if len(b) < 2+n {
		return 0, nil
	}
	l = 0
	for _, c := range b[2 : 2+n] {
		l = l<<8 | int(c)
	}
	return 2 + n + l, nil
}
