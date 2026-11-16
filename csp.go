package main

import "net/http"

// contentSecurityPolicy locks the webview down to the app's own bundled
// assets: no inline or remote scripts, no eval, no network access, no
// frames. Terminal output is data for xterm.js and can never become markup,
// but even if something did get injected it couldn't run or phone home.
// 'unsafe-inline' for styles is needed by xterm.js and React style props.
const contentSecurityPolicy = "default-src 'self'; " +
	"script-src 'self'; " +
	"style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data: blob:; " +
	"font-src 'self' data:; " +
	"connect-src 'self'; " +
	"media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'self' blob:; " +
	"base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

// securityHeaders adds the CSP and related headers to every asset response.
// It is installed only outside `wails dev` (see csp_dev.go), because Vite's
// dev server needs inline scripts and websockets for hot reload.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", contentSecurityPolicy)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		next.ServeHTTP(w, r)
	})
}
