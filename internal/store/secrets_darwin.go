//go:build darwin && cgo

package store

/*
#cgo LDFLAGS: -framework Security -framework CoreFoundation
#include <stdlib.h>
#include <string.h>
#include <Security/Security.h>

static CFMutableDictionaryRef tyxQuery(const char *svc, const char *acct) {
	CFMutableDictionaryRef q = CFDictionaryCreateMutable(NULL, 0,
		&kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
	CFStringRef s = CFStringCreateWithCString(NULL, svc, kCFStringEncodingUTF8);
	CFStringRef a = CFStringCreateWithCString(NULL, acct, kCFStringEncodingUTF8);
	CFDictionarySetValue(q, kSecClass, kSecClassGenericPassword);
	CFDictionarySetValue(q, kSecAttrService, s);
	CFDictionarySetValue(q, kSecAttrAccount, a);
	CFRelease(s);
	CFRelease(a);
	return q;
}

// Reads an item. Returns an OSStatus (0 = ok). *native is 1 when the item
// was created by this app (marked in its comment) and 0 for items an older
// version stored through the `security` command line tool.
static int tyxKCGet(const char *svc, const char *acct, char **out, int *outLen, int *native) {
	CFMutableDictionaryRef q = tyxQuery(svc, acct);
	CFDictionarySetValue(q, kSecReturnData, kCFBooleanTrue);
	CFDictionarySetValue(q, kSecReturnAttributes, kCFBooleanTrue);
	CFDictionarySetValue(q, kSecMatchLimit, kSecMatchLimitOne);
	CFTypeRef res = NULL;
	OSStatus st = SecItemCopyMatching(q, &res);
	CFRelease(q);
	if (st != errSecSuccess) {
		return (int)st;
	}
	CFDictionaryRef d = (CFDictionaryRef)res;
	CFDataRef data = (CFDataRef)CFDictionaryGetValue(d, kSecValueData);
	CFStringRef comment = (CFStringRef)CFDictionaryGetValue(d, kSecAttrComment);
	*native = (comment != NULL && CFStringCompare(comment, CFSTR("terminyxx"), 0) == kCFCompareEqualTo) ? 1 : 0;
	if (data == NULL) {
		*out = NULL;
		*outLen = 0;
	} else {
		*outLen = (int)CFDataGetLength(data);
		*out = (char *)malloc((size_t)*outLen + 1);
		memcpy(*out, CFDataGetBytePtr(data), (size_t)*outLen);
	}
	CFRelease(res);
	return 0;
}

static int tyxKCDelete(const char *svc, const char *acct) {
	CFMutableDictionaryRef q = tyxQuery(svc, acct);
	OSStatus st = SecItemDelete(q);
	CFRelease(q);
	return (int)st;
}

// Replaces the item: delete, then add, so the new item's access list names
// this app only (not /usr/bin/security).
static int tyxKCSet(const char *svc, const char *acct, const char *val, int len) {
	OSStatus st = (OSStatus)tyxKCDelete(svc, acct);
	if (st != errSecSuccess && st != errSecItemNotFound) {
		return (int)st;
	}
	CFMutableDictionaryRef q = tyxQuery(svc, acct);
	CFDataRef d = CFDataCreate(NULL, (const UInt8 *)val, len);
	CFDictionarySetValue(q, kSecValueData, d);
	CFDictionarySetValue(q, kSecAttrComment, CFSTR("terminyxx"));
	st = SecItemAdd(q, NULL);
	CFRelease(d);
	CFRelease(q);
	return (int)st;
}
*/
import "C"

import (
	"fmt"
	"unsafe"
)

// The native Keychain API ties an item to the app that created it: another
// program reading it gets a system prompt. The `security` tool (used by
// go-keyring) would put itself in the item's access list, so any process
// could run it and read the password without a prompt.
type nativeKeychain struct{}

// NewOSKeyring returns the macOS Keychain.
func NewOSKeyring() Secrets { return nativeKeychain{} }

const errSecItemNotFound = -25300

func kcErr(op string, st C.int) error {
	return fmt.Errorf("keychain %s failed (OSStatus %d)", op, int(st))
}

func (nativeKeychain) Get(key string) (string, error) {
	svc, acct := C.CString(keyringService), C.CString(key)
	defer C.free(unsafe.Pointer(svc))
	defer C.free(unsafe.Pointer(acct))
	var out *C.char
	var n, native C.int
	st := C.tyxKCGet(svc, acct, &out, &n, &native)
	if int(st) == errSecItemNotFound {
		return "", ErrSecretNotFound
	}
	if st != 0 {
		return "", kcErr("read", st)
	}
	defer C.free(unsafe.Pointer(out))
	val := C.GoStringN(out, n)
	if native == 0 {
		// Created by an older version through the `security` tool: store it
		// again so only this app is on its access list.
		_ = nativeKeychain{}.Set(key, val)
	}
	return val, nil
}

func (nativeKeychain) Set(key, value string) error {
	svc, acct := C.CString(keyringService), C.CString(key)
	defer C.free(unsafe.Pointer(svc))
	defer C.free(unsafe.Pointer(acct))
	v := C.CString(value)
	defer C.free(unsafe.Pointer(v))
	if st := C.tyxKCSet(svc, acct, v, C.int(len(value))); st != 0 {
		return kcErr("write", st)
	}
	return nil
}

func (nativeKeychain) Delete(key string) error {
	svc, acct := C.CString(keyringService), C.CString(key)
	defer C.free(unsafe.Pointer(svc))
	defer C.free(unsafe.Pointer(acct))
	if st := C.tyxKCDelete(svc, acct); st != 0 && int(st) != errSecItemNotFound {
		return kcErr("delete", st)
	}
	return nil
}
