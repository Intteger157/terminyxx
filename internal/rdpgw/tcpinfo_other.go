//go:build !windows

package rdpgw

import "net"

func tcpInfo(net.Conn) string { return "" }
