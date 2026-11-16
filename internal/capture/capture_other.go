//go:build !windows && !darwin

package capture

func setProtected(on bool) error {
	if on {
		return ErrUnsupported
	}
	return nil
}
