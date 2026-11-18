package connection

import (
	"fmt"
	"io"
	"strings"

	"golang.org/x/text/encoding"
	"golang.org/x/text/encoding/charmap"
	"golang.org/x/text/transform"
)

// Charsets are the terminal encodings a host can use instead of UTF-8, for
// old servers and network devices. All are single-byte, so a stream can be
// converted chunk by chunk without splitting characters.
var charsets = map[string]*charmap.Charmap{
	"windows-1251": charmap.Windows1251,
	"koi8-r":       charmap.KOI8R,
	"koi8-u":       charmap.KOI8U,
	"cp866":        charmap.CodePage866,
	"iso-8859-5":   charmap.ISO8859_5,
	"windows-1252": charmap.Windows1252,
	"iso-8859-1":   charmap.ISO8859_1,
	"iso-8859-2":   charmap.ISO8859_2,
	"windows-1250": charmap.Windows1250,
}

// lookupCharset returns nil for UTF-8 ("" or "utf-8").
func lookupCharset(name string) (encoding.Encoding, error) {
	n := strings.ToLower(strings.TrimSpace(name))
	if n == "" || n == "utf-8" || n == "utf8" {
		return nil, nil
	}
	cm, ok := charsets[n]
	if !ok {
		return nil, fmt.Errorf("unsupported terminal encoding %q", name)
	}
	return cm, nil
}

// decodeReader converts the server's output to UTF-8.
func decodeReader(r io.Reader, enc encoding.Encoding) io.Reader {
	if enc == nil {
		return r
	}
	return transform.NewReader(r, enc.NewDecoder())
}

// encodeInput converts typed UTF-8 to the server's charset; characters it
// can't represent become '?'.
func encodeInput(data []byte, enc encoding.Encoding) []byte {
	if enc == nil {
		return data
	}
	cm, ok := enc.(*charmap.Charmap)
	if !ok {
		out, err := encoding.ReplaceUnsupported(enc.NewEncoder()).Bytes(data)
		if err != nil {
			return data
		}
		return out
	}
	// x/text substitutes 0x1A (SUB), which a shell would take as Ctrl+Z.
	out := make([]byte, 0, len(data))
	for _, r := range string(data) {
		if b, ok := cm.EncodeRune(r); ok {
			out = append(out, b)
		} else {
			out = append(out, '?')
		}
	}
	return out
}
