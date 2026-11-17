package rdpdrive

import (
	"errors"
	"strings"
	"unicode"
)

var errBadPath = errors.New("invalid path")

// parsePath turns a server path (`\`-separated, relative to the drive root)
// into a "/"-separated path for os.Root; the root itself is ".". It rejects
// "..", and characters no Windows name has (which also rules out alternate
// data streams and "/" sneaking in as a separator).
func parsePath(p string) (string, error) {
	var parts []string
	for _, part := range strings.Split(p, `\`) {
		if part == "" || part == "." {
			continue
		}
		if err := checkName(part); err != nil {
			return "", err
		}
		parts = append(parts, part)
	}
	if len(parts) == 0 {
		return ".", nil
	}
	return strings.Join(parts, "/"), nil
}

func checkName(name string) error {
	if name == "." || name == ".." || len(name) > 255 {
		return errBadPath
	}
	for _, r := range name {
		if r < 0x20 || r == 0x7f || strings.ContainsRune(`/:<>"|?*`, r) {
			return errBadPath
		}
	}
	return nil
}

// splitQuery splits a directory query (`\dir\pattern`) into the directory and
// the pattern.
func splitQuery(q string) (dir, pattern string) {
	i := strings.LastIndexByte(q, '\\')
	if i < 0 {
		return "", q
	}
	return q[:i], q[i+1:]
}

func hasWildcards(pattern string) bool {
	return strings.ContainsAny(pattern, `*?<>"`)
}

// match reports whether name matches a Windows file pattern, ignoring case.
// `*` matches any run, `?` one character; the DOS forms `<`, `>` and `"`
// ([MS-FSA] 2.1.4.4) are treated as `*`, `?` and `.`, and "*.*" matches
// every name, as on Windows.
func match(pattern, name string) bool {
	if pattern == "*" || pattern == "*.*" {
		return true
	}
	p := []rune(strings.Map(func(r rune) rune {
		switch r {
		case '<':
			return '*'
		case '>':
			return '?'
		case '"':
			return '.'
		}
		return unicode.ToLower(r)
	}, pattern))
	n := []rune(strings.Map(unicode.ToLower, name))
	pi, ni := 0, 0
	star, mark := -1, 0
	for ni < len(n) {
		switch {
		case pi < len(p) && (p[pi] == '?' || p[pi] == n[ni]):
			pi++
			ni++
		case pi < len(p) && p[pi] == '*':
			star, mark = pi, ni
			pi++
		case star >= 0:
			pi = star + 1
			mark++
			ni = mark
		default:
			return false
		}
	}
	for pi < len(p) && p[pi] == '*' {
		pi++
	}
	return pi == len(p)
}
