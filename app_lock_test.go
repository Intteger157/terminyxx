package main

import (
	"errors"
	"reflect"
	"testing"

	"terminyxx/internal/connection"
	"terminyxx/internal/security"
)

type fixedHash struct{}

func (fixedHash) Load() (string, error) { return "set", nil }
func (fixedHash) Save(string) error     { return nil }

// TestLockedBindings calls every exported App method (each one is callable
// from the webview) with zero arguments while the app is locked. All of them
// must answer ErrLocked, except the ones listed in openWhileLocked. A new
// binding without a guard fails here.
func TestLockedBindings(t *testing.T) {
	lock, err := security.NewLock(fixedHash{}, nil)
	if err != nil || !lock.Locked() {
		t.Fatalf("lock not set up: %v", err)
	}
	a := &App{}
	a.sec.lock = lock

	typ := reflect.TypeOf(a)
	val := reflect.ValueOf(a)
	errType := reflect.TypeOf((*error)(nil)).Elem()
	seen := map[string]bool{}
	for i := 0; i < typ.NumMethod(); i++ {
		m := typ.Method(i)
		seen[m.Name] = true
		if _, ok := openWhileLocked[m.Name]; ok {
			continue
		}
		mt := m.Type
		if mt.NumOut() == 0 || mt.Out(mt.NumOut()-1) != errType {
			t.Errorf("%s: returns no error, so it can't refuse while locked; guard it differently or add it to openWhileLocked", m.Name)
			continue
		}
		args := make([]reflect.Value, mt.NumIn()-1)
		for j := range args {
			args[j] = reflect.Zero(mt.In(j + 1))
		}
		func() {
			defer func() {
				if r := recover(); r != nil {
					t.Errorf("%s: not guarded, it ran while locked (panic: %v)", m.Name, r)
				}
			}()
			outs := val.Method(i).Call(args)
			got, _ := outs[len(outs)-1].Interface().(error)
			if !errors.Is(got, connection.ErrLocked) {
				t.Errorf("%s: returned %v while locked, want ErrLocked", m.Name, got)
			}
		}()
	}
	for name := range openWhileLocked {
		if !seen[name] {
			t.Errorf("openWhileLocked lists %s, which is not an App method", name)
		}
	}
}
