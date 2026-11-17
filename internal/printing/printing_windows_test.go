//go:build windows

package printing

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// testPDF builds a PDF with a landscape A4 page (842×595 pt) whose left half
// is filled black, so rendering can be checked pixel by pixel.
func testPDF() []byte {
	content := "0 0 0 rg 0 0 421 595 re f"
	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Contents 4 0 R >>",
		fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(content), content),
	}
	var b bytes.Buffer
	b.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objects))
	for i, o := range objects {
		offsets[i] = b.Len()
		fmt.Fprintf(&b, "%d 0 obj\n%s\nendobj\n", i+1, o)
	}
	xref := b.Len()
	fmt.Fprintf(&b, "xref\n0 %d\n0000000000 65535 f \n", len(objects)+1)
	for _, off := range offsets {
		fmt.Fprintf(&b, "%010d 00000 n \n", off)
	}
	fmt.Fprintf(&b, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objects)+1, xref)
	return b.Bytes()
}

func TestRenderPDF(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.pdf")
	if err := os.WriteFile(path, testPDF(), 0o600); err != nil {
		t.Fatal(err)
	}
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	doc, err := openPDF(path)
	if err != nil {
		t.Fatal(err)
	}
	defer doc.close()
	if doc.pages != 1 {
		t.Fatalf("pages = %d", doc.pages)
	}
	w, h, err := doc.pageSize(0)
	if err != nil {
		t.Fatal(err)
	}
	// 842×595 pt in DIPs (96/72).
	if int(w+0.5) != 1123 || int(h+0.5) != 793 {
		t.Fatalf("size = %.1f×%.1f DIPs", w, h)
	}
	img, err := doc.render(0, 400, 283)
	if err != nil {
		t.Fatal(err)
	}
	if b := img.Bounds(); b.Dx() != 400 || b.Dy() != 283 {
		t.Fatalf("rendered %v", b)
	}
	if c := img.RGBAAt(50, 140); c.R > 30 || c.G > 30 || c.B > 30 {
		t.Errorf("left half = %v, want black", c)
	}
	if c := img.RGBAAt(350, 140); c.R < 220 || c.G < 220 || c.B < 220 {
		t.Errorf("right half = %v, want white", c)
	}
}

func TestList(t *testing.T) {
	printers, err := List()
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range printers {
		t.Logf("%q driver=%q default=%v network=%v", p.Name, p.Driver, p.Default, p.Network)
		if p.Name == "" {
			t.Error("printer without a name")
		}
	}
	if err := Raw("no such printer \x01", "x", "x"); err == nil {
		t.Error("Raw accepted an unknown printer")
	}
}

// TestPrintPDFThroughGDI prints the test PDF to "Microsoft Print to PDF"
// with an output file, which runs the whole GDI path without a dialog.
func TestPrintPDFThroughGDI(t *testing.T) {
	const pdfPrinter = "Microsoft Print to PDF"
	printers, _ := List()
	found := false
	for _, p := range printers {
		found = found || p.Name == pdfPrinter
	}
	if !found {
		t.Skip("no Microsoft Print to PDF printer")
	}
	dir := t.TempDir()
	in := filepath.Join(dir, "in.pdf")
	out := filepath.Join(dir, "out.pdf")
	if err := os.WriteFile(in, testPDF(), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := printPDFTo(pdfPrinter, in, "Terminyxx test", out); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(b, []byte("%PDF")) || len(b) < 1000 {
		t.Fatalf("output is %d bytes: %.20q", len(b), b)
	}
	t.Logf("printed %d bytes", len(b))
	if os.Getenv("TERMINYXX_KEEP_PRINT") != "" {
		_ = os.WriteFile(os.Getenv("TERMINYXX_KEEP_PRINT"), b, 0o600)
	}
}
