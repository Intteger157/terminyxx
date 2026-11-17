//go:build windows

package printing

import (
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"runtime"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	winspool                = windows.NewLazySystemDLL("winspool.drv")
	procEnumPrintersW       = winspool.NewProc("EnumPrintersW")
	procGetDefaultPrinterW  = winspool.NewProc("GetDefaultPrinterW")
	procOpenPrinterW        = winspool.NewProc("OpenPrinterW")
	procClosePrinter        = winspool.NewProc("ClosePrinter")
	procStartDocPrinterW    = winspool.NewProc("StartDocPrinterW")
	procEndDocPrinter       = winspool.NewProc("EndDocPrinter")
	procStartPagePrinter    = winspool.NewProc("StartPagePrinter")
	procEndPagePrinter      = winspool.NewProc("EndPagePrinter")
	procWritePrinter        = winspool.NewProc("WritePrinter")
	procDocumentPropertiesW = winspool.NewProc("DocumentPropertiesW")

	gdi32                 = windows.NewLazySystemDLL("gdi32.dll")
	procCreateDCW         = gdi32.NewProc("CreateDCW")
	procResetDCW          = gdi32.NewProc("ResetDCW")
	procDeleteDC          = gdi32.NewProc("DeleteDC")
	procStartDocW         = gdi32.NewProc("StartDocW")
	procEndDoc            = gdi32.NewProc("EndDoc")
	procAbortDoc          = gdi32.NewProc("AbortDoc")
	procStartPage         = gdi32.NewProc("StartPage")
	procEndPage           = gdi32.NewProc("EndPage")
	procGetDeviceCaps     = gdi32.NewProc("GetDeviceCaps")
	procStretchDIBits     = gdi32.NewProc("StretchDIBits")
	procSetStretchBltMode = gdi32.NewProc("SetStretchBltMode")
	procSetBrushOrgEx     = gdi32.NewProc("SetBrushOrgEx")
)

const (
	printerEnumLocal        = 0x2
	printerEnumConnections  = 0x4
	printerAttributeNetwork = 0x10

	// GetDeviceCaps
	horzRes         = 8
	vertRes         = 10
	logPixelsX      = 88
	logPixelsY      = 90
	physicalWidth   = 110
	physicalHeight  = 111
	physicalOffsetX = 112
	physicalOffsetY = 113

	dmOrientation     = 0x1
	dmOrientPortrait  = 1
	dmOrientLandscape = 2
	dmOutBuffer       = 2

	// The highest resolution pages are rendered at: 300 dpi keeps an A4
	// page around 35 MB in memory and looks the same as the printer's own
	// resolution for documents.
	maxRenderDPI = 300
	// Rows sent to the printer per StretchDIBits call; some drivers fail on
	// one call with a whole page.
	bandRows = 256
)

// printerInfo2 is PRINTER_INFO_2W.
type printerInfo2 struct {
	ServerName, PrinterName, ShareName, PortName, DriverName, Comment, Location           *uint16
	DevMode                                                                               uintptr
	SepFile, PrintProcessor, Datatype, Parameters                                         *uint16
	SecurityDescriptor                                                                    uintptr
	Attributes, Priority, DefaultPriority, StartTime, UntilTime, Status, Jobs, AveragePPM uint32
}

func list() ([]Printer, error) {
	var needed, count uint32
	flags := uintptr(printerEnumLocal | printerEnumConnections)
	procEnumPrintersW.Call(flags, 0, 2, 0, 0, uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&count)))
	if needed == 0 {
		return []Printer{}, nil
	}
	buf := make([]byte, needed)
	if r, _, err := procEnumPrintersW.Call(flags, 0, 2, uintptr(unsafe.Pointer(&buf[0])), uintptr(needed), uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&count))); r == 0 {
		return nil, fmt.Errorf("EnumPrinters: %w", err)
	}
	def := defaultPrinter()
	infos := unsafe.Slice((*printerInfo2)(unsafe.Pointer(&buf[0])), count)
	printers := make([]Printer, 0, count)
	for _, info := range infos {
		name := windows.UTF16PtrToString(info.PrinterName)
		printers = append(printers, Printer{
			Name:    name,
			Driver:  windows.UTF16PtrToString(info.DriverName),
			Default: name == def,
			Network: info.Attributes&printerAttributeNetwork != 0,
		})
	}
	runtime.KeepAlive(buf)
	return printers, nil
}

func defaultPrinter() string {
	var n uint32
	procGetDefaultPrinterW.Call(0, uintptr(unsafe.Pointer(&n)))
	if n == 0 {
		return ""
	}
	buf := make([]uint16, n)
	if r, _, _ := procGetDefaultPrinterW.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&n))); r == 0 {
		return ""
	}
	return windows.UTF16ToString(buf)
}

// docInfo1 is DOC_INFO_1W.
type docInfo1 struct {
	DocName, OutputFile, Datatype *uint16
}

func printRaw(printer, path, title string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	name, _ := windows.UTF16PtrFromString(printer)
	var h windows.Handle
	if r, _, err := procOpenPrinterW.Call(uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(&h)), 0); r == 0 {
		return fmt.Errorf("opening printer %s: %w", printer, err)
	}
	defer procClosePrinter.Call(uintptr(h))

	docName, _ := windows.UTF16PtrFromString(title)
	raw, _ := windows.UTF16PtrFromString("RAW")
	doc := docInfo1{DocName: docName, Datatype: raw}
	if r, _, err := procStartDocPrinterW.Call(uintptr(h), 1, uintptr(unsafe.Pointer(&doc))); r == 0 {
		return fmt.Errorf("starting the print job: %w", err)
	}
	defer procEndDocPrinter.Call(uintptr(h)) // also ends a failed job
	if r, _, err := procStartPagePrinter.Call(uintptr(h)); r == 0 {
		return fmt.Errorf("starting the page: %w", err)
	}
	buf := make([]byte, 256<<10)
	for {
		n, rerr := f.Read(buf)
		if n > 0 {
			var written uint32
			if r, _, err := procWritePrinter.Call(uintptr(h), uintptr(unsafe.Pointer(&buf[0])), uintptr(n), uintptr(unsafe.Pointer(&written))); r == 0 || int(written) != n {
				return fmt.Errorf("sending to the printer: %w", err)
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			return rerr
		}
	}
	procEndPagePrinter.Call(uintptr(h))
	return nil
}

// docInfo is DOCINFOW.
type docInfo struct {
	Size     int32
	DocName  *uint16
	Output   *uint16
	Datatype *uint16
	Type     uint32
}

// bitmapInfoHeader is BITMAPINFOHEADER (with no color table).
type bitmapInfoHeader struct {
	Size          uint32
	Width, Height int32
	Planes        uint16
	BitCount      uint16
	Compression   uint32
	SizeImage     uint32
	XPelsPerMeter int32
	YPelsPerMeter int32
	ClrUsed       uint32
	ClrImportant  uint32
}

// devMode returns the printer's default DEVMODEW, or nil.
func devMode(printer string) []byte {
	name, _ := windows.UTF16PtrFromString(printer)
	var h windows.Handle
	if r, _, _ := procOpenPrinterW.Call(uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(&h)), 0); r == 0 {
		return nil
	}
	defer procClosePrinter.Call(uintptr(h))
	size, _, _ := procDocumentPropertiesW.Call(0, uintptr(h), uintptr(unsafe.Pointer(name)), 0, 0, 0)
	if int32(size) <= 0 {
		return nil
	}
	dm := make([]byte, size)
	if r, _, _ := procDocumentPropertiesW.Call(0, uintptr(h), uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(&dm[0])), 0, dmOutBuffer); int32(r) < 0 {
		return nil
	}
	return dm
}

// DEVMODEW field offsets.
const (
	dmFieldsOffset      = 72
	dmOrientationOffset = 76
)

func setOrientation(dm []byte, landscape bool) {
	if len(dm) < dmOrientationOffset+2 {
		return
	}
	v := uint16(dmOrientPortrait)
	if landscape {
		v = dmOrientLandscape
	}
	*(*uint32)(unsafe.Pointer(&dm[dmFieldsOffset])) |= dmOrientation
	*(*uint16)(unsafe.Pointer(&dm[dmOrientationOffset])) = v
}

func caps(hdc uintptr, index int) float64 {
	r, _, _ := procGetDeviceCaps.Call(hdc, uintptr(index))
	return float64(int32(r))
}

func printPDF(printer, path, title string) error {
	return printPDFTo(printer, path, title, "")
}

// printPDFTo prints to the file output instead of the printer's port when
// output is not empty (used by tests with "Microsoft Print to PDF").
func printPDFTo(printer, path, title, output string) error {
	// COM and the printer DC are used from this one thread.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	doc, err := openPDF(path)
	if err != nil {
		return err
	}
	defer doc.close()
	if doc.pages == 0 {
		return errors.New("the document has no pages")
	}

	dm := devMode(printer)
	var dmPtr uintptr
	if dm != nil {
		dmPtr = uintptr(unsafe.Pointer(&dm[0]))
	}
	device, _ := windows.UTF16PtrFromString(printer)
	hdc, _, err := procCreateDCW.Call(0, uintptr(unsafe.Pointer(device)), 0, dmPtr)
	if hdc == 0 {
		return fmt.Errorf("opening printer %s: %w", printer, err)
	}
	defer procDeleteDC.Call(hdc)

	docName, _ := windows.UTF16PtrFromString(title)
	di := docInfo{DocName: docName}
	if output != "" {
		di.Output, _ = windows.UTF16PtrFromString(output)
	}
	di.Size = int32(unsafe.Sizeof(di))
	if r, _, err := procStartDocW.Call(hdc, uintptr(unsafe.Pointer(&di))); int32(r) <= 0 {
		return fmt.Errorf("starting the print job: %w", err)
	}
	done := false
	defer func() {
		if done {
			procEndDoc.Call(hdc)
		} else {
			procAbortDoc.Call(hdc)
		}
	}()

	for i := 0; i < doc.pages; i++ {
		w, h, err := doc.pageSize(i)
		if err != nil {
			return err
		}
		if dm != nil {
			setOrientation(dm, w > h)
			procResetDCW.Call(hdc, dmPtr)
		}
		if r, _, err := procStartPage.Call(hdc); int32(r) <= 0 {
			return fmt.Errorf("starting page %d: %w", i+1, err)
		}
		if err := printPage(doc, i, w, h, hdc); err != nil {
			return fmt.Errorf("page %d: %w", i+1, err)
		}
		if r, _, err := procEndPage.Call(hdc); int32(r) <= 0 {
			return fmt.Errorf("finishing page %d: %w", i+1, err)
		}
	}
	done = true
	return nil
}

// printPage draws page i (w×h DIPs) centered on the paper, scaled down to
// fit if it is larger.
func printPage(doc *pdfDocument, i int, w, h float64, hdc uintptr) error {
	dpiX, dpiY := caps(hdc, logPixelsX), caps(hdc, logPixelsY)
	paperW, paperH := caps(hdc, physicalWidth), caps(hdc, physicalHeight)
	offX, offY := caps(hdc, physicalOffsetX), caps(hdc, physicalOffsetY)
	if dpiX <= 0 || dpiY <= 0 {
		return errors.New("the printer reports no resolution")
	}
	if paperW <= 0 || paperH <= 0 { // not a real printer (e.g. some virtual ones)
		paperW, paperH = caps(hdc, horzRes), caps(hdc, vertRes)
		offX, offY = 0, 0
	}

	inW, inH := w/96, h/96
	scale := math.Min(1, math.Min(paperW/dpiX/inW, paperH/dpiY/inH))
	destW := inW * scale * dpiX
	destH := inH * scale * dpiY
	destX := (paperW-destW)/2 - offX
	destY := (paperH-destH)/2 - offY

	renderDPI := math.Min(math.Max(dpiX, dpiY), maxRenderDPI)
	pxW := max(1, int(math.Round(inW*scale*renderDPI)))
	pxH := max(1, int(math.Round(inH*scale*renderDPI)))
	img, err := doc.render(i, pxW, pxH)
	if err != nil {
		return err
	}
	b := img.Bounds()
	pxW, pxH = b.Dx(), b.Dy()

	// RGBA → BGRA, which a 32-bit DIB expects.
	bgra := make([]byte, pxW*pxH*4)
	for y := 0; y < pxH; y++ {
		src := img.Pix[y*img.Stride : y*img.Stride+pxW*4]
		dst := bgra[y*pxW*4 : (y+1)*pxW*4]
		for x := 0; x < len(src); x += 4 {
			dst[x], dst[x+1], dst[x+2], dst[x+3] = src[x+2], src[x+1], src[x], 0
		}
	}

	procSetStretchBltMode.Call(hdc, 4) // HALFTONE
	procSetBrushOrgEx.Call(hdc, 0, 0, 0)
	for top := 0; top < pxH; top += bandRows {
		rows := min(bandRows, pxH-top)
		hdr := bitmapInfoHeader{Width: int32(pxW), Height: -int32(rows), Planes: 1, BitCount: 32}
		hdr.Size = uint32(unsafe.Sizeof(hdr))
		y0 := destY + destH*float64(top)/float64(pxH)
		y1 := destY + destH*float64(top+rows)/float64(pxH)
		r, _, err := procStretchDIBits.Call(hdc,
			uintptr(int32(math.Round(destX))), uintptr(int32(math.Round(y0))),
			uintptr(int32(math.Round(destW))), uintptr(int32(math.Round(y1)-math.Round(y0))),
			0, 0, uintptr(pxW), uintptr(rows),
			uintptr(unsafe.Pointer(&bgra[top*pxW*4])), uintptr(unsafe.Pointer(&hdr)),
			0,          // DIB_RGB_COLORS
			0x00CC0020, // SRCCOPY
		)
		if int32(r) <= 0 {
			return fmt.Errorf("sending the page to the printer: %w", err)
		}
	}
	runtime.KeepAlive(bgra)
	return nil
}
