package service

import (
	"os"
	"strings"
	"testing"
)

func TestTotpServiceDoesNotLogSecretMaterial(t *testing.T) {
	source, err := os.ReadFile("totp_service.go")
	if err != nil {
		t.Fatalf("read totp_service.go: %v", err)
	}

	forbidden := []string{
		"secret_prefix",
		"decrypted_prefix",
		"setupSecretPrefix",
		"secretPrefix",
	}
	for _, marker := range forbidden {
		if strings.Contains(string(source), marker) {
			t.Fatalf("TOTP service must not log or derive secret material marker %q", marker)
		}
	}
}
