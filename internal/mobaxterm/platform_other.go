//go:build !windows

package mobaxterm

// MobaXterm is Windows-only and we cannot know the code page of a copied
// file here; assume Western (cp1252).
func ansiCodePage() uint32 { return 1252 }

func lastIniPath() string { return "" }
