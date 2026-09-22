//go:build windows

package main

import (
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows/registry"
)

func linkCLIOntoPath(string) {}

func ensureCLIUserPath(binDir string) error {
	key, _, err := registry.CreateKey(registry.CURRENT_USER, `Environment`, registry.QUERY_VALUE|registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer key.Close()

	path, valueType, err := key.GetStringValue("Path")
	if err == registry.ErrNotExist {
		path = ""
		valueType = registry.EXPAND_SZ
		err = nil
	}
	if err != nil {
		return err
	}
	if pathHasDir(path, binDir) {
		return nil
	}
	next := prependPathEnv(path, binDir)
	switch valueType {
	case registry.EXPAND_SZ:
		if err := key.SetExpandStringValue("Path", next); err != nil {
			return err
		}
	default:
		if err := key.SetStringValue("Path", next); err != nil {
			return err
		}
	}
	broadcastEnvironment()
	return nil
}

func broadcastEnvironment() {
	user32 := syscall.NewLazyDLL("user32.dll")
	proc := user32.NewProc("SendMessageTimeoutW")
	env, _ := syscall.UTF16PtrFromString("Environment")
	const hwndBroadcast = 0xffff
	const wmSettingChange = 0x001A
	const smtoAbortIfHung = 0x0002
	_, _, _ = proc.Call(
		hwndBroadcast,
		wmSettingChange,
		0,
		uintptr(unsafe.Pointer(env)),
		smtoAbortIfHung,
		5000,
		0,
	)
}
