package service

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestOpenAIGatewayServiceParseOpenAIImagesRequest_GrokImagineModel(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		name  string
		model string
	}{
		{name: "quality image", model: "grok-imagine-image-pro"},
		{name: "default imagine alias", model: "grok-imagine"},
		{name: "edit alias", model: "grok-imagine-edit"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body := []byte(`{"model":"` + tc.model + `","prompt":"draw a neon fox","size":"1024x1024","n":2}`)

			req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Request = req

			svc := &OpenAIGatewayService{}
			parsed, err := svc.ParseOpenAIImagesRequest(c, body)

			require.NoError(t, err)
			require.Equal(t, tc.model, parsed.Model)
			require.Equal(t, "draw a neon fox", parsed.Prompt)
			require.Equal(t, 2, parsed.N)
			require.Equal(t, OpenAIImagesCapabilityNative, parsed.RequiredCapability)
		})
	}
}
