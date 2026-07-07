package admin

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/pkg/response"
	"github.com/gin-gonic/gin"
)

const (
	defaultKiroSidecarInternalBaseURL    = "http://kiro-rs:8990"
	defaultKiroSidecarPublicAdminURL     = "http://127.0.0.1:8990/admin"
	defaultKiroSidecarSparkAPIAccountURL = "http://kiro-rs:8990"
)

// KiroSidecarHandler exposes read-only diagnostics for the optional Kiro-RS Docker sidecar.
type KiroSidecarHandler struct {
	client *http.Client
}

type KiroSidecarStatusResult struct {
	Configured             bool   `json:"configured"`
	Healthy                bool   `json:"healthy"`
	InternalBaseURL        string `json:"internal_base_url"`
	PublicAdminURL         string `json:"public_admin_url"`
	SparkAPIAccountBaseURL string `json:"sparkapi_account_base_url"`
	APIKeyConfigured       bool   `json:"api_key_configured"`
	ModelsCount            int    `json:"models_count"`
	LastCheckedAt          string `json:"last_checked_at"`
	StatusCode             int    `json:"status_code"`
	Message                string `json:"message"`
}

func NewKiroSidecarHandler() *KiroSidecarHandler {
	return &KiroSidecarHandler{
		client: &http.Client{Timeout: 5 * time.Second},
	}
}

func (h *KiroSidecarHandler) GetStatus(c *gin.Context) {
	result := KiroSidecarStatusResult{
		InternalBaseURL:        envOrDefault("KIRO_RS_INTERNAL_BASE_URL", defaultKiroSidecarInternalBaseURL),
		PublicAdminURL:         envOrDefault("KIRO_RS_PUBLIC_ADMIN_URL", defaultKiroSidecarPublicAdminURL),
		SparkAPIAccountBaseURL: envOrDefault("KIRO_RS_SPARKAPI_ACCOUNT_BASE_URL", defaultKiroSidecarSparkAPIAccountURL),
		LastCheckedAt:          time.Now().UTC().Format(time.RFC3339),
	}

	apiKey := strings.TrimSpace(os.Getenv("KIRO_RS_API_KEY"))
	result.APIKeyConfigured = apiKey != ""
	result.Configured = result.APIKeyConfigured && result.InternalBaseURL != ""
	if !result.Configured {
		result.Message = "KIRO_RS_API_KEY is not configured"
		response.Success(c, result)
		return
	}

	modelsURL := strings.TrimRight(result.InternalBaseURL, "/") + "/v1/models"
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, modelsURL, nil)
	if err != nil {
		result.Message = fmt.Sprintf("invalid Kiro-RS internal URL: %v", err)
		response.Success(c, result)
		return
	}
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("Authorization", "Bearer "+apiKey)

	httpClient := h.client
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 5 * time.Second}
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		result.Message = fmt.Sprintf("Kiro-RS request failed: %v", err)
		response.Success(c, result)
		return
	}
	defer resp.Body.Close()

	result.StatusCode = resp.StatusCode
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		result.Message = fmt.Sprintf("Kiro-RS returned HTTP %d", resp.StatusCode)
		response.Success(c, result)
		return
	}

	var payload struct {
		Data   []json.RawMessage `json:"data"`
		Models []json.RawMessage `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		result.Message = fmt.Sprintf("failed to parse Kiro-RS models response: %v", err)
		response.Success(c, result)
		return
	}
	result.ModelsCount = len(payload.Data)
	if result.ModelsCount == 0 && len(payload.Models) > 0 {
		result.ModelsCount = len(payload.Models)
	}
	result.Healthy = true
	result.Message = "Kiro-RS sidecar is reachable"
	response.Success(c, result)
}

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
