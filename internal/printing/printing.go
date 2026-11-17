// Package printing lists the computer's printers and prints documents that
// arrive from a remote desktop session: either data already rendered by the
// printer's own driver on the server (Raw), or a PDF from the server's
// "Microsoft Print to PDF" driver (PDF).
package printing

import (
	"errors"
	"fmt"
	"slices"
)

// Printer is a local print queue.
type Printer struct {
	Name string `json:"name"`
	// Driver is the queue's driver (Windows) or make and model (macOS). With
	// the same driver installed on the server, the server renders jobs for
	// this printer and Raw passes them through unchanged.
	Driver  string `json:"driver"`
	Default bool   `json:"default"`
	Network bool   `json:"network"`
}

// ErrUnknownPrinter means the name is not one of List's printers.
var ErrUnknownPrinter = errors.New("unknown printer")

// List returns the local printers, the default one first.
func List() ([]Printer, error) {
	list, err := list()
	if err != nil {
		return nil, err
	}
	slices.SortStableFunc(list, func(a, b Printer) int {
		if a.Default != b.Default {
			if a.Default {
				return -1
			}
			return 1
		}
		return 0
	})
	return list, nil
}

func check(name string) error {
	list, err := list()
	if err != nil {
		return err
	}
	for _, p := range list {
		if p.Name == name {
			return nil
		}
	}
	return fmt.Errorf("%w: %s", ErrUnknownPrinter, name)
}

// Raw sends the file at path to the printer unchanged (data rendered for this
// printer by the same driver on the server).
func Raw(printer, path, title string) error {
	if err := check(printer); err != nil {
		return err
	}
	return printRaw(printer, path, title)
}

// PDF prints the PDF file at path on the printer with its default settings.
// Each page is printed at its own size, scaled down to fit the paper if it
// is larger, and centered.
func PDF(printer, path, title string) error {
	if err := check(printer); err != nil {
		return err
	}
	return printPDF(printer, path, title)
}
