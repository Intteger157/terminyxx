//go:build !(windows && (amd64 || arm64))

package dragout

// Start is not available here; the UI hides the gesture's result with a toast.
func Start(items []Item, open OpenFunc) (bool, error) {
	return false, ErrUnsupported
}
