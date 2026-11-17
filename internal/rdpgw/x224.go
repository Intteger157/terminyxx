package rdpgw

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

// Requested security protocols (MS-RDPBCGR 2.2.1.1.1).
const (
	protocolRDP      = 0x0
	protocolSSL      = 0x1
	protocolHybrid   = 0x2
	protocolHybridEx = 0x8
)

// probeConnectionRequest is an X.224 Connection Request asking for TLS or
// CredSSP, used to fetch the server certificate before a session starts.
func probeConnectionRequest() []byte {
	neg := []byte{0x01, 0x00, 0x08, 0x00, 0, 0, 0, 0}
	binary.LittleEndian.PutUint32(neg[4:], protocolSSL|protocolHybrid|protocolHybridEx)
	x224 := append([]byte{byte(6 + len(neg)), 0xE0, 0, 0, 0, 0, 0}, neg...)
	tpkt := []byte{0x03, 0x00, 0, 0}
	binary.BigEndian.PutUint16(tpkt[2:], uint16(4+len(x224)))
	return append(tpkt, x224...)
}

// readTPKT reads one whole TPKT packet (header included).
func readTPKT(r io.Reader) ([]byte, error) {
	hdr := make([]byte, 4)
	if _, err := io.ReadFull(r, hdr); err != nil {
		return nil, err
	}
	if hdr[0] != 0x03 {
		return nil, errors.New("server did not answer with an RDP packet")
	}
	n := int(binary.BigEndian.Uint16(hdr[2:]))
	if n < 4 {
		return nil, errors.New("malformed TPKT header")
	}
	pkt := make([]byte, n)
	copy(pkt, hdr)
	if _, err := io.ReadFull(r, pkt[4:]); err != nil {
		return nil, err
	}
	return pkt, nil
}

// validConnectionRequest checks that b is a single X.224 Connection Request
// TPKT, so the gateway only ever forwards a handshake to the server.
func validConnectionRequest(b []byte) bool {
	if len(b) < 11 || b[0] != 0x03 || int(binary.BigEndian.Uint16(b[2:])) != len(b) {
		return false
	}
	return b[5]&0xF0 == 0xE0
}

// negotiation is the outcome of an X.224 Connection Confirm.
type negotiation struct {
	failed   bool
	code     uint32 // failure code, or the selected protocol
	selected uint32
}

func parseConnectionConfirm(pkt []byte) (negotiation, error) {
	if len(pkt) < 11 || pkt[5]&0xF0 != 0xD0 {
		return negotiation{}, errors.New("unexpected X.224 response")
	}
	neg := pkt[11:]
	if len(neg) < 8 {
		// No negotiation data: the server only speaks standard RDP security.
		return negotiation{selected: protocolRDP}, nil
	}
	v := binary.LittleEndian.Uint32(neg[4:8])
	switch neg[0] {
	case 0x02:
		return negotiation{selected: v}, nil
	case 0x03:
		return negotiation{failed: true, code: v}, nil
	}
	return negotiation{}, fmt.Errorf("unknown negotiation type %d", neg[0])
}

// negotiationFailureText explains RDP_NEG_FAILURE codes.
func negotiationFailureText(code uint32) string {
	switch code {
	case 1:
		return "the server requires TLS security"
	case 2:
		return "the server does not support TLS"
	case 3:
		return "the server has no certificate configured"
	case 4:
		return "inconsistent security flags"
	case 5:
		return "the server requires Network Level Authentication"
	case 6:
		return "the server requires Enhanced RDP Security with user authentication"
	}
	return fmt.Sprintf("negotiation failure %d", code)
}
