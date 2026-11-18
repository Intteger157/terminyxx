// Package macwin adjusts the macOS window where Wails has no option for it.
package macwin

// InstallFullscreenFix makes full screen behave like an ordinary window's: the
// inset title bar (mac.TitleBarHiddenInset) is a toolbar, and in full screen
// AppKit shows a toolbar as a tall strip under the menu bar and lays the page
// out around it, so the web view no longer covers the screen. The toolbar is
// hidden while the window is in full screen and shown again when it leaves.
// A no-op on other systems.
func InstallFullscreenFix() { installFullscreenFix() }
