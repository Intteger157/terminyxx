//go:build dev

package main

import "github.com/wailsapp/wails/v2/pkg/options/assetserver"

// assetMiddleware is nil under `wails dev`: Vite's HMR client needs inline
// scripts and a websocket, which the production CSP forbids.
var assetMiddleware assetserver.Middleware
