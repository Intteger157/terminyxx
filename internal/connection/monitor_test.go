package connection

import (
	"errors"
	"math"
	"testing"
	"time"
)

const sample1 = `==stat
cpu  1000 0 500 8000 500 0 0 0 0 0
==cpus
4
==mem
MemTotal:       16384000 kB
MemAvailable:    4096000 kB
SwapTotal:       2048000 kB
SwapFree:        2048000 kB
==load
0.52 0.40 0.30 1/200 1234
==up
3600.55 7000.10
==df
/dev/sda1 102400000 51200000 51200000 50% /
==net
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 999999 10 0 0 0 0 0 0 999999 10 0 0 0 0 0 0
  eth0: 1000000 100 0 0 0 0 0 0 500000 50 0 0 0 0 0 0
`

// Second reading 2 s later: CPU busy +100 of +200 total, rx +2000, tx +1000.
const sample2 = `==stat
cpu  1050 0 550 8050 550 0 0 0 0 0
==cpus
4
==mem
MemTotal:       16384000 kB
MemAvailable:    4096000 kB
SwapTotal:       2048000 kB
SwapFree:        1024000 kB
==load
0.60 0.42 0.31 1/200 1235
==up
3602.55 7004.10
==df
/dev/sda1 102400000 51200000 51200000 50% /
==net
  eth0: 1002000 100 0 0 0 0 0 0 501000 50 0 0 0 0 0 0
    lo: 999999 10 0 0 0 0 0 0 999999 10 0 0 0 0 0 0
`

func TestParseStats(t *testing.T) {
	var m monitorState
	t0 := time.Now()
	st, err := m.parse(sample1, t0)
	if err != nil {
		t.Fatal(err)
	}
	if st.CPUPercent != -1 || st.RxPerSec != -1 {
		t.Errorf("first sample must not report rates: %+v", st)
	}
	if st.Cores != 4 || st.MemTotal != 16384000*1024 || st.MemUsed != (16384000-4096000)*1024 {
		t.Errorf("memory/cores: %+v", st)
	}
	if st.Load1 != 0.52 || st.UptimeSec != 3600 || st.DiskTotal != 102400000*1024 || st.DiskUsed != 51200000*1024 {
		t.Errorf("load/uptime/disk: %+v", st)
	}

	st, err = m.parse(sample2, t0.Add(2*time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if math.Abs(st.CPUPercent-50) > 0.01 {
		t.Errorf("cpu = %v, want 50", st.CPUPercent)
	}
	if st.RxPerSec != 1000 || st.TxPerSec != 500 {
		t.Errorf("net rates rx=%v tx=%v (loopback must be ignored)", st.RxPerSec, st.TxPerSec)
	}
	if st.SwapUsed != 1024000*1024 {
		t.Errorf("swap used %d", st.SwapUsed)
	}
}

func TestParseStatsNotLinux(t *testing.T) {
	var m monitorState
	if _, err := m.parse("==stat\nhead: /proc/stat: No such file or directory\n", time.Now()); !errors.Is(err, ErrMonitorUnsupported) {
		t.Fatalf("got %v", err)
	}
	if _, err := m.parse("", time.Now()); !errors.Is(err, ErrMonitorUnsupported) {
		t.Fatalf("empty output: %v", err)
	}
}

func TestCounterResetDoesNotGoNegative(t *testing.T) {
	var m monitorState
	t0 := time.Now()
	_, _ = m.parse(sample2, t0)
	st, _ := m.parse(sample1, t0.Add(time.Second)) // counters went backwards (reboot)
	if st.CPUPercent != -1 || st.RxPerSec != -1 {
		t.Errorf("rates after a counter reset: %+v", st)
	}
}
