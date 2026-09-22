//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"runtime"
	"strings"
)

func linkCLIOntoPath(shim string) {
	dir := filepath.Join(userHome(), ".local", "bin")
	if !writableDir(dir) {
		return
	}
	dest := filepath.Join(dir, "octop")
	if !replaceableCLILink(dest, shim) {
		return
	}
	_ = os.Remove(dest)
	_ = os.Symlink(shim, dest)
}

func replaceableCLILink(dest, shim string) bool {
	info, err := os.Lstat(dest)
	if err != nil {
		return true
	}
	if info.Mode()&os.ModeSymlink == 0 {
		return false
	}
	target, err := os.Readlink(dest)
	if err != nil {
		return false
	}
	if !filepath.IsAbs(target) {
		target = filepath.Join(filepath.Dir(dest), target)
	}
	cleaned, err := filepath.Abs(target)
	if err != nil {
		return false
	}
	want, err := filepath.Abs(shim)
	if err != nil {
		return false
	}
	return cleaned == want
}

func writableDir(dir string) bool {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return false
	}
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return false
	}
	test := filepath.Join(dir, ".octop-cli-write-test")
	if err := os.WriteFile(test, []byte("ok"), 0o600); err != nil {
		return false
	}
	_ = os.Remove(test)
	return true
}

func ensureCLIUserPath(binDir string) error {
	entry := fmt.Sprintf("export PATH=%q:$PATH", binDir)
	block := "\n# Octop\n" + entry + "\n"
	ok := false
	for _, target := range cliProfileTargets() {
		if appendProfileBlock(target.path, binDir, block, target.create) {
			ok = true
		}
	}
	if !ok {
		return fmt.Errorf("could not add %s to a shell profile", binDir)
	}
	return nil
}

type cliProfileTarget struct {
	path   string
	create bool
}

func cliProfileTargets() []cliProfileTarget {
	home := userHome()
	switch runtime.GOOS {
	case "darwin":
		return []cliProfileTarget{
			{filepath.Join(home, ".zshrc"), true},
			{filepath.Join(home, ".bash_profile"), false},
			{filepath.Join(home, ".bashrc"), false},
		}
	default:
		return []cliProfileTarget{
			{filepath.Join(home, ".bashrc"), true},
			{filepath.Join(home, ".profile"), false},
			{filepath.Join(home, ".zshrc"), false},
		}
	}
}

func appendProfileBlock(profile, binDir, block string, create bool) bool {
	data, err := os.ReadFile(profile)
	if err != nil {
		if !os.IsNotExist(err) || !create {
			return false
		}
	}
	if strings.Contains(string(data), binDir) || strings.Contains(string(data), ".octop/bin") {
		return true
	}
	if err := os.MkdirAll(filepath.Dir(profile), 0o755); err != nil {
		return false
	}
	f, err := os.OpenFile(profile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return false
	}
	defer f.Close()
	_, err = f.WriteString(block)
	return err == nil
}

func userHome() string {
	if home := os.Getenv("HOME"); home != "" {
		return home
	}
	u, err := user.Current()
	if err != nil {
		return ""
	}
	return u.HomeDir
}
