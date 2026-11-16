//go:build !dev

package main

import "github.com/wailsapp/wails/v2/pkg/options/assetserver"

// assetMiddleware sends the CSP with every asset in production builds.
var assetMiddleware assetserver.Middleware = securityHeaders
