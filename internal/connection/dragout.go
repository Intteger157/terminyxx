package connection

import (
	"context"
	"fmt"
	"io"
	"os"
	"path"
	"strings"
	"time"
)

// MaxDragItems caps how many files and folders one drag out to the OS may
// contain, so dragging a huge tree can't stall the app while the mouse is held.
const MaxDragItems = 20000

// DragItem is one file or folder of a remote selection being dragged out to
// Explorer/Finder. Rel is its path below the drop folder, '/' separated and
// already cleaned of anything the local file system would reject.
type DragItem struct {
	Rel     string
	IsDir   bool
	Size    int64
	ModTime time.Time
	remote  string
}

// PlanDragOut lists everything below sources (folders recursively) in the
// order a copy needs them: a folder before its contents.
func (b *SFTPBridge) PlanDragOut(ctx context.Context, sources []string) ([]DragItem, error) {
	var items []DragItem
	for _, src := range sources {
		src = path.Clean(src)
		if src == "/" || src == "." {
			return nil, fmt.Errorf("cannot drag %q", src)
		}
		base := dragSafeName(path.Base(src))
		walker := b.client.Walk(src)
		for walker.Step() {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			if err := walker.Err(); err != nil {
				return nil, err
			}
			p := walker.Path()
			info := walker.Stat()
			if info.Mode()&os.ModeSymlink != 0 {
				target, err := b.client.Stat(p)
				if err != nil || target.IsDir() {
					continue // dangling or directory symlink
				}
				info = target
			}
			rel, err := dragRel(base, src, p)
			if err != nil {
				return nil, err
			}
			items = append(items, DragItem{Rel: rel, IsDir: info.IsDir(), Size: info.Size(), ModTime: info.ModTime(), remote: p})
			if len(items) > MaxDragItems {
				return nil, fmt.Errorf("too many files to drag out (more than %d); use the transfer instead", MaxDragItems)
			}
		}
	}
	return items, nil
}

// dragRel maps remote path p (found while walking src) to a path below the
// drop folder. Names come from the server, so every part is cleaned.
func dragRel(base, src, p string) (string, error) {
	switch {
	case p == src:
		return base, nil
	case strings.HasPrefix(p, src+"/"):
		parts := []string{base}
		for _, part := range strings.Split(p[len(src)+1:], "/") {
			if part == "" {
				continue
			}
			parts = append(parts, dragSafeName(part))
		}
		return strings.Join(parts, "/"), nil
	}
	return "", fmt.Errorf("server returned a path outside %s: %q", src, p)
}

// dragSafeName makes one path component valid on Windows and macOS and never
// "." or "..".
func dragSafeName(name string) string {
	var sb strings.Builder
	for _, r := range name {
		switch {
		case r < 0x20, strings.ContainsRune(`<>:"/\|?*`, r):
			sb.WriteRune('_')
		default:
			sb.WriteRune(r)
		}
	}
	s := strings.TrimRight(sb.String(), ". ")
	if s == "" {
		return "_"
	}
	return s
}

// OpenDragItem streams the contents of one planned file.
func (b *SFTPBridge) OpenDragItem(it DragItem) (io.ReadCloser, error) {
	f, err := b.client.Open(it.remote)
	if err != nil {
		return nil, err
	}
	pr, pw := io.Pipe()
	// WriteTo reads with several requests in flight, which is much faster
	// than a plain sequential Read over a high-latency link.
	go func() {
		_, err := f.WriteTo(pw)
		pw.CloseWithError(err) // nil closes with io.EOF
	}()
	return &dragReader{pr: pr, f: f}, nil
}

type dragReader struct {
	pr *io.PipeReader
	f  interface{ Close() error }
}

func (d *dragReader) Read(p []byte) (int, error) { return d.pr.Read(p) }

func (d *dragReader) Close() error {
	d.pr.Close() // stops the WriteTo goroutine
	return d.f.Close()
}

// PlanDragOut lists the selection on connection id.
func (m *ConnectionManager) PlanDragOut(ctx context.Context, id string, sources []string) ([]DragItem, error) {
	b, err := m.sftp(id)
	if err != nil {
		return nil, err
	}
	return b.PlanDragOut(ctx, sources)
}

// OpenDragItem opens one planned file on connection id.
func (m *ConnectionManager) OpenDragItem(id string, it DragItem) (io.ReadCloser, error) {
	b, err := m.sftp(id)
	if err != nil {
		return nil, err
	}
	return b.OpenDragItem(it)
}
