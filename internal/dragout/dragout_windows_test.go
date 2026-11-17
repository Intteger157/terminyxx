//go:build windows && (amd64 || arm64)

package dragout

import (
	"bytes"
	"encoding/binary"
	"io"
	"strings"
	"syscall"
	"testing"
	"time"
	"unicode/utf16"
	"unsafe"
)

// vcall calls method idx of the COM object at obj, like a drop target would.
func vcall(obj uintptr, idx int, args ...uintptr) uintptr {
	vtbl := *(*uintptr)(ptr(obj))
	fn := *(*uintptr)(ptr(vtbl + uintptr(idx)*unsafe.Sizeof(uintptr(0))))
	r, _, _ := syscall.SyscallN(fn, append([]uintptr{obj}, args...)...)
	return r
}

func TestDataObjectServesVirtualFiles(t *testing.T) {
	initOnce.Do(initVtbls)
	fd, err := clipboardFormat("FileGroupDescriptorW")
	if err != nil {
		t.Fatal(err)
	}
	fc, err := clipboardFormat("FileContents")
	if err != nil {
		t.Fatal(err)
	}
	items := []Item{
		{Name: "dir", IsDir: true},
		{Name: `dir\hello.txt`, Size: 11, ModTime: time.Date(2024, 5, 6, 7, 8, 9, 0, time.UTC)},
	}
	d := &dataObject{items: items, fdFmt: fd, fcFmt: fc, done: make(chan struct{}),
		open: func(i int) (io.ReadCloser, error) {
			return io.NopCloser(strings.NewReader("hello world")), nil
		}}
	d.vtbl = uintptr(unsafe.Pointer(&dataVtbl[0]))
	d.refs.Store(1)
	obj := uintptr(unsafe.Pointer(d))
	register(obj, d)

	// QueryGetData
	fe := &formatEtc{CF: fd, Aspect: dvAspectContent, Index: -1, Tymed: tymedHGlobal}
	if hr := vcall(obj, 5, uintptr(unsafe.Pointer(fe))); hr != sOK {
		t.Fatalf("QueryGetData(descriptor) = %#x", hr)
	}
	bad := &formatEtc{CF: 1, Aspect: dvAspectContent, Index: -1, Tymed: tymedHGlobal}
	if hr := vcall(obj, 5, uintptr(unsafe.Pointer(bad))); hr != dvEFormatEtc {
		t.Fatalf("QueryGetData(CF_TEXT) = %#x", hr)
	}

	// Descriptor
	med := new(stgMedium)
	if hr := vcall(obj, 3, uintptr(unsafe.Pointer(fe)), uintptr(unsafe.Pointer(med))); hr != sOK {
		t.Fatalf("GetData(descriptor) = %#x", hr)
	}
	p, _, lerr := procGlobalLock.Call(med.U)
	if p == 0 {
		t.Fatalf("GlobalLock(%#x): %v tymed=%d", med.U, lerr, med.Tymed)
	}
	raw := unsafe.Slice((*byte)(ptr(p)), 4+2*fdSize)
	if n := binary.LittleEndian.Uint32(raw); n != 2 {
		t.Fatalf("cItems = %d", n)
	}
	second := raw[4+fdSize:]
	units := make([]uint16, 0, 32)
	for i := 0; ; i++ {
		u := binary.LittleEndian.Uint16(second[fdNameOffset+2*i:])
		if u == 0 {
			break
		}
		units = append(units, u)
	}
	if got := string(utf16.Decode(units)); got != `dir\hello.txt` {
		t.Fatalf("name = %q", got)
	}
	if size := binary.LittleEndian.Uint32(second[68:]); size != 11 {
		t.Fatalf("size = %d", size)
	}
	if attr := binary.LittleEndian.Uint32(raw[4+36:]); attr != fileAttrDirectory {
		t.Fatalf("dir attributes = %#x", attr)
	}
	procGlobalUnlock.Call(med.U)
	procGlobalFree.Call(med.U)

	// Contents of the file (index 1); folders have none.
	fe = &formatEtc{CF: fc, Aspect: dvAspectContent, Index: 0, Tymed: tymedIStream}
	if hr := vcall(obj, 3, uintptr(unsafe.Pointer(fe)), uintptr(unsafe.Pointer(med))); hr == sOK {
		t.Fatal("a folder must not have contents")
	}
	fe.Index = 1
	*med = stgMedium{}
	if hr := vcall(obj, 3, uintptr(unsafe.Pointer(fe)), uintptr(unsafe.Pointer(med))); hr != sOK || med.Tymed != tymedIStream {
		t.Fatalf("GetData(contents) = %#x tymed %d", hr, med.Tymed)
	}
	stm := med.U

	st := new(statstg)
	if hr := vcall(stm, 12, uintptr(unsafe.Pointer(st)), 1); hr != sOK || st.Size != 11 {
		t.Fatalf("Stat = %#x size %d", hr, st.Size)
	}
	newPos := new(uint64)
	if hr := vcall(stm, 5, 0, seekCur, uintptr(unsafe.Pointer(newPos))); hr != sOK || *newPos != 0 {
		t.Fatalf("Seek(cur,0) = %#x pos %d", hr, *newPos)
	}
	buf := make([]byte, 64) // escapes below
	read := new(uint32)
	var out bytes.Buffer
	for {
		hr := vcall(stm, 3, uintptr(unsafe.Pointer(&buf[0])), 4, uintptr(unsafe.Pointer(read)))
		out.Write(buf[:*read])
		if hr == sFalse || *read == 0 {
			break
		}
		if hr != sOK {
			t.Fatalf("Read = %#x", hr)
		}
	}
	if out.String() != "hello world" {
		t.Fatalf("contents = %q", out.String())
	}

	// Enumerator
	en := new(uintptr)
	if hr := vcall(obj, 8, dataDirGet, uintptr(unsafe.Pointer(en))); hr != sOK || *en == 0 {
		t.Fatalf("EnumFormatEtc = %#x", hr)
	}
	fes := new([3]formatEtc)
	fetched := new(uint32)
	if hr := vcall(*en, 3, 3, uintptr(unsafe.Pointer(fes)), uintptr(unsafe.Pointer(fetched))); hr != sFalse || *fetched != 2 {
		t.Fatalf("Next = %#x fetched %d", hr, *fetched)
	}
	if fes[0].CF != fd || fes[1].CF != fc {
		t.Fatalf("formats %+v", fes[:2])
	}
	vcall(*en, 2)

	// Releasing the stream and our reference ends the object.
	vcall(stm, 2)
	vcall(obj, 2)
	select {
	case <-d.done:
	default:
		t.Fatal("data object was not released")
	}
}
