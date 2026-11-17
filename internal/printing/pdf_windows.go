//go:build windows

package printing

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// PDF pages are rendered by Windows' own PDF engine (WinRT Windows.Data.Pdf,
// Windows 10 and later), called as raw COM so the app needs no CGO. Vtable
// indices count IInspectable's six methods first, in the order of the
// methods in the Windows SDK's .idl files.

var (
	combase                    = windows.NewLazySystemDLL("combase.dll")
	procRoInitialize           = combase.NewProc("RoInitialize")
	procRoGetActivationFactory = combase.NewProc("RoGetActivationFactory")
	procRoActivateInstance     = combase.NewProc("RoActivateInstance")
	procWindowsCreateString    = combase.NewProc("WindowsCreateString")
	procWindowsDeleteString    = combase.NewProc("WindowsDeleteString")

	shcore                                 = windows.NewLazySystemDLL("shcore.dll")
	procCreateRandomAccessStreamOnFile     = shcore.NewProc("CreateRandomAccessStreamOnFile")
	procCreateStreamOverRandomAccessStream = shcore.NewProc("CreateStreamOverRandomAccessStream")
)

var (
	iidAsyncInfo            = windows.GUID{Data1: 0x00000036, Data4: [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidStream               = windows.GUID{Data1: 0x0000000C, Data4: [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidRandomAccessStream   = windows.GUID{Data1: 0x905A0FE1, Data2: 0xBC53, Data3: 0x11DF, Data4: [8]byte{0x8C, 0x49, 0x00, 0x1E, 0x4F, 0xC6, 0x86, 0xDA}}
	iidPdfDocumentStatics   = windows.GUID{Data1: 0x433A0B5F, Data2: 0xC007, Data3: 0x4788, Data4: [8]byte{0x90, 0xF2, 0x08, 0x14, 0x3D, 0x92, 0x25, 0x99}}
	iidPdfPageRenderOptions = windows.GUID{Data1: 0x3C98056F, Data2: 0xB7CF, Data3: 0x4C29, Data4: [8]byte{0x9A, 0x04, 0x52, 0xD9, 0x02, 0x67, 0xF4, 0x25}}
)

// Vtable indices.
const (
	vtRelease = 2

	// IAsyncInfo
	vtAsyncStatus    = 7
	vtAsyncErrorCode = 8
	vtAsyncCancel    = 9
	// IAsyncOperation<T> / IAsyncAction
	vtGetResults = 8

	// IPdfDocumentStatics
	vtLoadFromStreamAsync = 8
	// IPdfDocument
	vtGetPage   = 6
	vtPageCount = 7
	// IPdfPage
	vtRenderWithOptionsToStreamAsync = 7
	vtPageSize                       = 10
	// IPdfPageRenderOptions
	vtPutDestinationWidth  = 9
	vtPutDestinationHeight = 11

	// IStream
	vtStreamRead = 3
	vtStreamSeek = 5
)

type comObject struct{ vtbl *[64]uintptr }

func (o *comObject) call(index int, args ...uintptr) uintptr {
	all := append([]uintptr{uintptr(unsafe.Pointer(o))}, args...)
	r, _, _ := syscall.SyscallN(o.vtbl[index], all...)
	return r
}

func (o *comObject) release() {
	if o != nil {
		o.call(vtRelease)
	}
}

func (o *comObject) queryInterface(iid *windows.GUID) (*comObject, error) {
	var out *comObject
	if hr := o.call(0, uintptr(unsafe.Pointer(iid)), uintptr(unsafe.Pointer(&out))); failed(hr) {
		return nil, hrError("QueryInterface", hr)
	}
	return out, nil
}

func failed(hr uintptr) bool { return int32(hr) < 0 }

func hrError(what string, hr uintptr) error {
	return fmt.Errorf("%s failed: 0x%08X", what, uint32(hr))
}

func hstring(s string) (uintptr, error) {
	u, err := windows.UTF16FromString(s)
	if err != nil {
		return 0, err
	}
	var hs uintptr
	if hr, _, _ := procWindowsCreateString.Call(uintptr(unsafe.Pointer(&u[0])), uintptr(len(u)-1), uintptr(unsafe.Pointer(&hs))); failed(hr) {
		return 0, hrError("WindowsCreateString", hr)
	}
	return hs, nil
}

func activationFactory(class string, iid *windows.GUID) (*comObject, error) {
	hs, err := hstring(class)
	if err != nil {
		return nil, err
	}
	defer procWindowsDeleteString.Call(hs)
	var f *comObject
	if hr, _, _ := procRoGetActivationFactory.Call(hs, uintptr(unsafe.Pointer(iid)), uintptr(unsafe.Pointer(&f))); failed(hr) {
		return nil, hrError("RoGetActivationFactory("+class+")", hr)
	}
	return f, nil
}

func activate(class string, iid *windows.GUID) (*comObject, error) {
	hs, err := hstring(class)
	if err != nil {
		return nil, err
	}
	defer procWindowsDeleteString.Call(hs)
	var inst *comObject
	if hr, _, _ := procRoActivateInstance.Call(hs, uintptr(unsafe.Pointer(&inst))); failed(hr) {
		return nil, hrError("RoActivateInstance("+class+")", hr)
	}
	defer inst.release()
	return inst.queryInterface(iid)
}

// await waits for an IAsyncOperation/IAsyncAction by polling IAsyncInfo
// (a completion handler would need a COM object implemented in Go).
func await(op *comObject, what string) error {
	info, err := op.queryInterface(&iidAsyncInfo)
	if err != nil {
		return err
	}
	defer info.release()
	deadline := time.Now().Add(2 * time.Minute)
	for {
		var status int32
		if hr := info.call(vtAsyncStatus, uintptr(unsafe.Pointer(&status))); failed(hr) {
			return hrError(what, hr)
		}
		switch status {
		case 0: // Started
			if time.Now().After(deadline) {
				info.call(vtAsyncCancel)
				return fmt.Errorf("%s timed out", what)
			}
			time.Sleep(5 * time.Millisecond)
		case 1: // Completed
			return nil
		case 2:
			return fmt.Errorf("%s was canceled", what)
		default:
			var code int32
			info.call(vtAsyncErrorCode, uintptr(unsafe.Pointer(&code)))
			return hrError(what, uintptr(uint32(code)))
		}
	}
}

// pdfDocument is an open PDF. Use it on one OS thread (COM state is per thread).
type pdfDocument struct {
	doc   *comObject
	pages int
}

func openPDF(path string) (*pdfDocument, error) {
	if err := combase.Load(); err != nil {
		return nil, errors.New("printing PDF needs Windows 10 or later")
	}
	procRoInitialize.Call(1) // RO_INIT_MULTITHREADED; S_FALSE / RPC_E_CHANGED_MODE are fine

	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	var file *comObject
	if hr, _, _ := procCreateRandomAccessStreamOnFile.Call(uintptr(unsafe.Pointer(p)), 0 /* read */, uintptr(unsafe.Pointer(&iidRandomAccessStream)), uintptr(unsafe.Pointer(&file))); failed(hr) {
		return nil, hrError("CreateRandomAccessStreamOnFile", hr)
	}
	defer file.release()

	statics, err := activationFactory("Windows.Data.Pdf.PdfDocument", &iidPdfDocumentStatics)
	if err != nil {
		return nil, err
	}
	defer statics.release()
	var op *comObject
	if hr := statics.call(vtLoadFromStreamAsync, uintptr(unsafe.Pointer(file)), uintptr(unsafe.Pointer(&op))); failed(hr) {
		return nil, hrError("PdfDocument.LoadFromStreamAsync", hr)
	}
	defer op.release()
	if err := await(op, "Opening the PDF"); err != nil {
		return nil, err
	}
	var doc *comObject
	if hr := op.call(vtGetResults, uintptr(unsafe.Pointer(&doc))); failed(hr) {
		return nil, hrError("Opening the PDF", hr)
	}
	var count uint32
	if hr := doc.call(vtPageCount, uintptr(unsafe.Pointer(&count))); failed(hr) {
		doc.release()
		return nil, hrError("PdfDocument.PageCount", hr)
	}
	return &pdfDocument{doc: doc, pages: int(count)}, nil
}

func (d *pdfDocument) close() { d.doc.release() }

// pageSize returns the page size in DIPs (1/96 inch), after rotation.
func (d *pdfDocument) pageSize(index int) (w, h float64, err error) {
	page, err := d.page(index)
	if err != nil {
		return 0, 0, err
	}
	defer page.release()
	var size struct{ W, H float32 }
	if hr := page.call(vtPageSize, uintptr(unsafe.Pointer(&size))); failed(hr) {
		return 0, 0, hrError("PdfPage.Size", hr)
	}
	return float64(size.W), float64(size.H), nil
}

func (d *pdfDocument) page(index int) (*comObject, error) {
	var page *comObject
	if hr := d.doc.call(vtGetPage, uintptr(uint32(index)), uintptr(unsafe.Pointer(&page))); failed(hr) {
		return nil, hrError("PdfDocument.GetPage", hr)
	}
	return page, nil
}

// render draws a page into a width×height image on a white background.
func (d *pdfDocument) render(index, width, height int) (*image.RGBA, error) {
	page, err := d.page(index)
	if err != nil {
		return nil, err
	}
	defer page.release()

	opts, err := activate("Windows.Data.Pdf.PdfPageRenderOptions", &iidPdfPageRenderOptions)
	if err != nil {
		return nil, err
	}
	defer opts.release()
	opts.call(vtPutDestinationWidth, uintptr(uint32(width)))
	opts.call(vtPutDestinationHeight, uintptr(uint32(height)))

	out, err := activate("Windows.Storage.Streams.InMemoryRandomAccessStream", &iidRandomAccessStream)
	if err != nil {
		return nil, err
	}
	defer out.release()

	var action *comObject
	if hr := page.call(vtRenderWithOptionsToStreamAsync, uintptr(unsafe.Pointer(out)), uintptr(unsafe.Pointer(opts)), uintptr(unsafe.Pointer(&action))); failed(hr) {
		return nil, hrError("PdfPage.RenderToStreamAsync", hr)
	}
	defer action.release()
	if err := await(action, "Rendering the page"); err != nil {
		return nil, err
	}
	if hr := action.call(vtGetResults); failed(hr) {
		return nil, hrError("Rendering the page", hr)
	}

	data, err := readAll(out)
	if err != nil {
		return nil, err
	}
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("reading the rendered page: %w", err)
	}
	rgba, ok := img.(*image.RGBA)
	if !ok {
		rgba = image.NewRGBA(img.Bounds())
		draw.Draw(rgba, rgba.Bounds(), image.White, image.Point{}, draw.Src)
		draw.Draw(rgba, rgba.Bounds(), img, img.Bounds().Min, draw.Over)
	}
	return rgba, nil
}

// readAll reads a WinRT stream from its start through a classic IStream.
func readAll(ras *comObject) ([]byte, error) {
	var stream *comObject
	if hr, _, _ := procCreateStreamOverRandomAccessStream.Call(uintptr(unsafe.Pointer(ras)), uintptr(unsafe.Pointer(&iidStream)), uintptr(unsafe.Pointer(&stream))); failed(hr) {
		return nil, hrError("CreateStreamOverRandomAccessStream", hr)
	}
	defer stream.release()
	if hr := stream.call(vtStreamSeek, 0, 0 /* STREAM_SEEK_SET */, 0); failed(hr) {
		return nil, hrError("IStream.Seek", hr)
	}
	var out bytes.Buffer
	buf := make([]byte, 1<<20)
	for {
		var n uint32
		hr := stream.call(vtStreamRead, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)), uintptr(unsafe.Pointer(&n)))
		if failed(hr) {
			return nil, hrError("IStream.Read", hr)
		}
		out.Write(buf[:n])
		if n == 0 || hr == 1 /* S_FALSE: end of stream */ {
			return out.Bytes(), nil
		}
	}
}
