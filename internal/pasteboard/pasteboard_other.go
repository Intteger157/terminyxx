//go:build !darwin

package pasteboard

func changed() (*Content, error) { return nil, ErrUnsupported }

func write(Content) error { return ErrUnsupported }
