package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	_ "embed"
)

//go:embed cliembed/octop
var unixOctopShim []byte

//go:embed cliembed/octop.cmd
var windowsOctopShim []byte

func cliBinDir() string {
	return filepath.Join(octopHome(), "bin")
}

func cliShimName() string {
	if runtime.GOOS == "windows" {
		return "octop.cmd"
	}
	return "octop"
}

func cliShimBytes() []byte {
	if runtime.GOOS == "windows" {
		return windowsOctopShim
	}
	return unixOctopShim
}

func pathHasDir(pathEnv, dir string) bool {
	if dir == "" {
		return false
	}
	want := filepath.Clean(dir)
	sep := string(os.PathListSeparator)
	for _, part := range strings.Split(pathEnv, sep) {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		cleaned := filepath.Clean(os.ExpandEnv(part))
		if runtime.GOOS == "windows" {
			if strings.EqualFold(cleaned, want) {
				return true
			}
			continue
		}
		if cleaned == want {
			return true
		}
	}
	return false
}

func prependPathEnv(pathEnv, dir string) string {
	if pathHasDir(pathEnv, dir) {
		return pathEnv
	}
	if pathEnv == "" {
		return dir
	}
	return dir + string(os.PathListSeparator) + pathEnv
}

func prependProcessPath(dir string) {
	_ = os.Setenv("PATH", prependPathEnv(os.Getenv("PATH"), dir))
}

func writeCLIShim(dest string) error {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	mode := os.FileMode(0o644)
	if runtime.GOOS != "windows" {
		mode = 0o755
	}
	return os.WriteFile(dest, cliShimBytes(), mode)
}

func installOctopCLI() error {
	dest := filepath.Join(cliBinDir(), cliShimName())
	if err := writeCLIShim(dest); err != nil {
		return fmt.Errorf("write octop CLI: %w", err)
	}
	prependProcessPath(cliBinDir())
	linkCLIOntoPath(dest)
	return persistCLIUserPath(cliBinDir())
}

var persistCLIUserPath = ensureCLIUserPath
