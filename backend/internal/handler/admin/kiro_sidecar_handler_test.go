package admin

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestKiroSidecarHandlerGetStatusHealthyDoesNotLeakAPIKey(t *testing.T) {
	gin.SetMode(gin.TestMode)

	const secret = "csk_sparkapiSecretValueForTest123"
	var receivedKey string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/models", r.URL.Path)
		receivedKey = r.Header.Get("x-api-key")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"object":"list","data":[{"id":"claude-sonnet-4.8"},{"id":"deepseek-3.2"}]}`))
	}))
	defer upstream.Close()

	t.Setenv("KIRO_RS_INTERNAL_BASE_URL", upstream.URL)
	t.Setenv("KIRO_RS_PUBLIC_ADMIN_URL", "http://127.0.0.1:8990/admin")
	t.Setenv("KIRO_RS_API_KEY", secret)

	handler := NewKiroSidecarHandler()
	handler.client = upstream.Client()

	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/admin/kiro/sidecar/status", nil)

	handler.GetStatus(c)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, secret, receivedKey)
	require.NotContains(t, rec.Body.String(), secret)

	var envelope struct {
		Code int                     `json:"code"`
		Data KiroSidecarStatusResult `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	require.Equal(t, 0, envelope.Code)
	require.True(t, envelope.Data.Configured)
	require.True(t, envelope.Data.Healthy)
	require.True(t, envelope.Data.APIKeyConfigured)
	require.Equal(t, upstream.URL, envelope.Data.InternalBaseURL)
	require.Equal(t, "http://127.0.0.1:8990/admin", envelope.Data.PublicAdminURL)
	require.Equal(t, "http://kiro-rs:8990", envelope.Data.SparkAPIAccountBaseURL)
	require.Equal(t, 2, envelope.Data.ModelsCount)
	require.Equal(t, http.StatusOK, envelope.Data.StatusCode)
	require.NotEmpty(t, envelope.Data.LastCheckedAt)
	_, err := time.Parse(time.RFC3339, envelope.Data.LastCheckedAt)
	require.NoError(t, err)
}

func TestKiroSidecarHandlerGetStatusReportsMissingAPIKey(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Setenv("KIRO_RS_INTERNAL_BASE_URL", "http://kiro-rs:8990")
	t.Setenv("KIRO_RS_PUBLIC_ADMIN_URL", "http://127.0.0.1:8990/admin")
	t.Setenv("KIRO_RS_API_KEY", "")

	handler := NewKiroSidecarHandler()

	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/admin/kiro/sidecar/status", nil)

	handler.GetStatus(c)

	require.Equal(t, http.StatusOK, rec.Code)
	var envelope struct {
		Code int                     `json:"code"`
		Data KiroSidecarStatusResult `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	require.Equal(t, 0, envelope.Code)
	require.False(t, envelope.Data.Configured)
	require.False(t, envelope.Data.Healthy)
	require.False(t, envelope.Data.APIKeyConfigured)
	require.Equal(t, "KIRO_RS_API_KEY is not configured", envelope.Data.Message)
}

func TestKiroSidecarHandlerGetStatusReportsUpstreamError(t *testing.T) {
	gin.SetMode(gin.TestMode)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "denied", http.StatusForbidden)
	}))
	defer upstream.Close()

	t.Setenv("KIRO_RS_INTERNAL_BASE_URL", strings.TrimRight(upstream.URL, "/")+"/")
	t.Setenv("KIRO_RS_PUBLIC_ADMIN_URL", "")
	t.Setenv("KIRO_RS_API_KEY", "csk_sparkapiSecretValueForTest123")

	handler := NewKiroSidecarHandler()
	handler.client = upstream.Client()

	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/admin/kiro/sidecar/status", nil)

	handler.GetStatus(c)

	require.Equal(t, http.StatusOK, rec.Code)
	var envelope struct {
		Data KiroSidecarStatusResult `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	require.True(t, envelope.Data.Configured)
	require.False(t, envelope.Data.Healthy)
	require.Equal(t, http.StatusForbidden, envelope.Data.StatusCode)
	require.Contains(t, envelope.Data.Message, "Kiro-RS returned HTTP 403")
	require.Equal(t, "http://127.0.0.1:8990/admin", envelope.Data.PublicAdminURL)
}
