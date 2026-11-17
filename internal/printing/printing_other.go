//go:build !windows

package printing

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// CUPS (macOS, Linux): lpstat lists the queues and lp prints. CUPS converts
// PDF itself, and "-o raw" passes printer data through unchanged.

func run(name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	var stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		if msg := strings.TrimSpace(stderr.String()); msg != "" {
			return "", fmt.Errorf("%s: %s", name, msg)
		}
		return "", fmt.Errorf("%s: %w", name, err)
	}
	return string(out), nil
}

func list() ([]Printer, error) {
	out, err := run("lpstat", "-e")
	if err != nil {
		// No CUPS queues at all makes lpstat fail; that's an empty list.
		return []Printer{}, nil
	}
	def := ""
	if d, err := run("lpstat", "-d"); err == nil {
		if i := strings.LastIndex(d, ": "); i >= 0 {
			def = strings.TrimSpace(d[i+2:])
		}
	}
	var printers []Printer
	sc := bufio.NewScanner(strings.NewReader(out))
	for sc.Scan() {
		name := strings.TrimSpace(sc.Text())
		if name == "" {
			continue
		}
		printers = append(printers, Printer{Name: name, Driver: makeAndModel(name), Default: name == def})
	}
	return printers, nil
}

func makeAndModel(name string) string {
	out, err := run("lpoptions", "-p", name)
	if err != nil {
		return ""
	}
	const key = "printer-make-and-model="
	i := strings.Index(out, key)
	if i < 0 {
		return ""
	}
	v := out[i+len(key):]
	if strings.HasPrefix(v, "'") {
		if j := strings.Index(v[1:], "'"); j >= 0 {
			return v[1 : j+1]
		}
	}
	if j := strings.IndexByte(v, ' '); j >= 0 {
		v = v[:j]
	}
	return v
}

func printRaw(printer, path, title string) error {
	_, err := run("lp", "-d", printer, "-t", title, "-o", "raw", "--", path)
	return err
}

func printPDF(printer, path, title string) error {
	_, err := run("lp", "-d", printer, "-t", title, "-o", "fit-to-page", "--", path)
	return err
}
