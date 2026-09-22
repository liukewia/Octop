package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestPathHasDir(t *testing.T) {
	sep := string(os.PathListSeparator)
	dir := filepath.Join("home", "octop", "bin")
	if !pathHasDir(dir+sep+"/usr/bin", dir) {
		t.Fatal("expected PATH to contain dir")
	}
	if pathHasDir("/usr/bin", dir) {
		t.Fatal("did not expect PATH to contain dir")
	}
}

func TestPrependPathEnvIdempotent(t *testing.T) {
	dir := filepath.Join("home", "octop", "bin")
	once := prependPathEnv("/usr/bin", dir)
	twice := prependPathEnv(once, dir)
	if once != twice {
		t.Fatalf("prepended twice: %q vs %q", once, twice)
	}
	if !strings.HasPrefix(once, dir) {
		t.Fatalf("PATH %q should start with %q", once, dir)
	}
}

func TestInstallOctopCLIWritesShim(t *testing.T) {
	home := t.TempDir()
	t.Setenv("OCTOP_HOME", home)
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	persistCLIUserPath = func(string) error { return nil }
	t.Cleanup(func() { persistCLIUserPath = ensureCLIUserPath })

	if err := installOctopCLI(); err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(cliBinDir(), cliShimName())
	data, err := os.ReadFile(dest)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "launch.py") {
		t.Fatalf("shim %s does not invoke launch.py", dest)
	}
	if runtime.GOOS != "windows" {
		info, err := os.Stat(dest)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm()&0o111 == 0 {
			t.Fatalf("unix shim is not executable: %v", info.Mode())
		}
	}
	if !pathHasDir(os.Getenv("PATH"), cliBinDir()) {
		t.Fatal("process PATH was not prepended")
	}
}
