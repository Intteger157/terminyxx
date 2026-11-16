//go:build darwin

package capture

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>

static void setWindowsSharing(int protect) {
	dispatch_async(dispatch_get_main_queue(), ^{
		for (NSWindow *w in [NSApp windows]) {
			[w setSharingType:(protect ? NSWindowSharingNone : NSWindowSharingReadOnly)];
		}
	});
}
*/
import "C"

func setProtected(on bool) error {
	v := 0
	if on {
		v = 1
	}
	C.setWindowsSharing(C.int(v))
	return nil
}
