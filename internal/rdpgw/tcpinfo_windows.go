package rdpgw

import (
	"crypto/tls"
	"fmt"
	"net"
	"syscall"
	"unsafe"
)

// tcpInfoV0 is TCP_INFO_v0 from mstcpip.h.
type tcpInfoV0 struct {
	State             uint32
	Mss               uint32
	ConnectionTimeMs  uint64
	TimestampsEnabled uint8
	RttUs             uint32
	MinRttUs          uint32
	BytesInFlight     uint32
	Cwnd              uint32
	SndWnd            uint32
	RcvWnd            uint32
	RcvBuf            uint32
	BytesOut          uint64
	BytesIn           uint64
	BytesReordered    uint32
	BytesRetrans      uint32
	FastRetrans       uint32
	DupAcksIn         uint32
	TimeoutEpisodes   uint32
	SynRetrans        uint8
}

const sioTCPInfo = 0xD8000027

// tcpInfo describes the TCP state of conn for the drive trace: the peer's
// receive window (0 means the server stopped reading), bytes in flight and
// retransmissions (loss on the path).
func tcpInfo(conn net.Conn) string {
	if tc, ok := conn.(*tls.Conn); ok {
		conn = tc.NetConn()
	}
	sc, ok := conn.(syscall.Conn)
	if !ok {
		return ""
	}
	rc, err := sc.SyscallConn()
	if err != nil {
		return ""
	}
	var info tcpInfoV0
	var ioErr error
	_ = rc.Control(func(fd uintptr) {
		var version uint32
		var n uint32
		ioErr = syscall.WSAIoctl(syscall.Handle(fd), sioTCPInfo,
			(*byte)(unsafe.Pointer(&version)), 4,
			(*byte)(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info)), &n, nil, 0)
	})
	if ioErr != nil {
		return "tcp_info_error=" + ioErr.Error()
	}
	return fmt.Sprintf("snd_wnd=%d in_flight=%d cwnd=%d rtt=%dus retrans_bytes=%d fast_retrans=%d timeouts=%d dupacks=%d",
		info.SndWnd, info.BytesInFlight, info.Cwnd, info.RttUs, info.BytesRetrans, info.FastRetrans, info.TimeoutEpisodes, info.DupAcksIn)
}
