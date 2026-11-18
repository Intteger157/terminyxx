//go:build darwin

package pasteboard

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#include <stdlib.h>
#include <string.h>
#import <Cocoa/Cocoa.h>

typedef struct {
	void *text; int textLen;
	void *html; int htmlLen;
	void *png;  int pngLen;
} clip_t;

static long clipChangeCount(void) {
	return (long)[[NSPasteboard generalPasteboard] changeCount];
}

static void *copyData(NSData *d, int *len) {
	*len = 0;
	if (d == nil || d.length == 0) return NULL;
	void *p = malloc(d.length);
	if (p == NULL) return NULL;
	memcpy(p, d.bytes, d.length);
	*len = (int)d.length;
	return p;
}

// Reads text, HTML and an image (PNG, or TIFF converted to PNG).
static clip_t clipRead(long maxImage) {
	clip_t c = {0};
	@autoreleasepool {
		NSPasteboard *pb = [NSPasteboard generalPasteboard];
		NSString *s = [pb stringForType:NSPasteboardTypeString];
		if (s != nil) c.text = copyData([s dataUsingEncoding:NSUTF8StringEncoding], &c.textLen);
		NSString *h = [pb stringForType:NSPasteboardTypeHTML];
		if (h != nil) c.html = copyData([h dataUsingEncoding:NSUTF8StringEncoding], &c.htmlLen);
		NSData *png = [pb dataForType:NSPasteboardTypePNG];
		if (png == nil) {
			NSData *tiff = [pb dataForType:NSPasteboardTypeTIFF];
			if (tiff != nil) {
				NSBitmapImageRep *rep = [NSBitmapImageRep imageRepWithData:tiff];
				if (rep != nil) png = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
			}
		}
		if (png != nil && (long)png.length <= maxImage) c.png = copyData(png, &c.pngLen);
	}
	return c;
}

// Replaces the content and returns the new change count.
static long clipWrite(const void *text, int textLen, const void *html, int htmlLen, const void *png, int pngLen) {
	@autoreleasepool {
		NSPasteboard *pb = [NSPasteboard generalPasteboard];
		[pb clearContents];
		if (textLen > 0) {
			NSString *s = [[NSString alloc] initWithBytes:text length:textLen encoding:NSUTF8StringEncoding];
			if (s != nil) [pb setString:s forType:NSPasteboardTypeString];
		}
		if (htmlLen > 0) {
			NSString *h = [[NSString alloc] initWithBytes:html length:htmlLen encoding:NSUTF8StringEncoding];
			if (h != nil) [pb setString:h forType:NSPasteboardTypeHTML];
		}
		if (pngLen > 0) {
			NSData *d = [NSData dataWithBytes:png length:pngLen];
			[pb setData:d forType:NSPasteboardTypePNG];
			// Many Mac apps paste only TIFF.
			NSBitmapImageRep *rep = [NSBitmapImageRep imageRepWithData:d];
			NSData *tiff = rep != nil ? [rep TIFFRepresentation] : nil;
			if (tiff != nil) [pb setData:tiff forType:NSPasteboardTypeTIFF];
		}
		return (long)pb.changeCount;
	}
}
*/
import "C"

import (
	"encoding/base64"
	"sync"
	"unsafe"
)

var (
	mu       sync.Mutex
	seen     C.long = -1
	haveSeen bool
)

func take(p unsafe.Pointer, n C.int) []byte {
	if p == nil {
		return nil
	}
	defer C.free(p)
	return C.GoBytes(p, n)
}

func changed() (*Content, error) {
	mu.Lock()
	defer mu.Unlock()
	n := C.clipChangeCount()
	if haveSeen && n == seen {
		return nil, nil
	}
	seen, haveSeen = n, true
	c := C.clipRead(C.long(MaxImage))
	out := &Content{
		Text: string(take(c.text, c.textLen)),
		HTML: string(take(c.html, c.htmlLen)),
	}
	if png := take(c.png, c.pngLen); len(png) > 0 {
		out.PNG = base64.StdEncoding.EncodeToString(png)
	}
	return out, nil
}

func write(c Content) error {
	png, err := base64.StdEncoding.DecodeString(c.PNG)
	if err != nil {
		return err
	}
	text, html := []byte(c.Text), []byte(c.HTML)
	ptr := func(b []byte) unsafe.Pointer {
		if len(b) == 0 {
			return nil
		}
		return C.CBytes(b)
	}
	tp, hp, pp := ptr(text), ptr(html), ptr(png)
	defer func() {
		for _, p := range []unsafe.Pointer{tp, hp, pp} {
			if p != nil {
				C.free(p)
			}
		}
	}()
	mu.Lock()
	defer mu.Unlock()
	seen = C.clipWrite(tp, C.int(len(text)), hp, C.int(len(html)), pp, C.int(len(png)))
	haveSeen = true
	return nil
}
