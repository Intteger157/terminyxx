//go:build darwin

package macwin

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>

static void installFullscreenFix(void) {
	dispatch_async(dispatch_get_main_queue(), ^{
		NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
		NSOperationQueue *main = [NSOperationQueue mainQueue];
		[nc addObserverForName:NSWindowWillEnterFullScreenNotification object:nil queue:main
			usingBlock:^(NSNotification *n) {
				NSWindow *w = n.object;
				if (w.toolbar != nil) {
					w.toolbar.visible = NO;
				}
			}];
		[nc addObserverForName:NSWindowDidExitFullScreenNotification object:nil queue:main
			usingBlock:^(NSNotification *n) {
				NSWindow *w = n.object;
				if (w.toolbar != nil) {
					w.toolbar.visible = YES;
				}
			}];
	});
}
*/
import "C"

func installFullscreenFix() { C.installFullscreenFix() }
