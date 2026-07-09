// Package grok provides the curated Grok/grok2api model catalog used by
// SparkAPI admin and gateway model-list fallbacks.
package grok

import "github.com/Wei-Shaw/sub2api/internal/pkg/openai"

const (
	// DefaultTestModel is a low-cost Grok text model that grok2api can route to
	// an available account tier during account connection tests.
	DefaultTestModel = "grok-4.20-fast"
	modelCreatedAt   = int64(1735689600)
)

var defaultModelIDs = []string{
	"grok-4.20-0309-non-reasoning",
	"grok-4.20-0309",
	"grok-4.20-0309-reasoning",
	"grok-4.20-0309-non-reasoning-super",
	"grok-4.20-0309-super",
	"grok-4.20-0309-reasoning-super",
	"grok-4.20-0309-non-reasoning-heavy",
	"grok-4.20-0309-heavy",
	"grok-4.20-0309-reasoning-heavy",
	"grok-4.20-multi-agent-0309",
	"grok-4.20-fast",
	"grok-4.20-auto",
	"grok-4.20-expert",
	"grok-4.20-heavy",
	"grok-4.3-beta",
	"grok-4",
	"grok-4-0709",
	"grok-3-beta",
	"grok-3-mini-beta",
	"grok-3-fast-beta",
	"grok-2",
	"grok-2-vision",
	"grok-2-image",
	"grok-beta",
	"grok-vision-beta",
	"grok-imagine-image-lite",
	"grok-imagine-image",
	"grok-imagine-image-pro",
	"grok-imagine-image-edit",
	"grok-imagine-video",
}

// DefaultOpenAIModels returns Grok models in OpenAI-compatible model-list shape.
func DefaultOpenAIModels() []openai.Model {
	models := make([]openai.Model, 0, len(defaultModelIDs))
	for _, id := range defaultModelIDs {
		models = append(models, openai.Model{
			ID:          id,
			Object:      "model",
			Created:     modelCreatedAt,
			OwnedBy:     "grok2api",
			Type:        "model",
			DisplayName: id,
		})
	}
	return models
}

// DefaultModelIDs returns the default Grok model ID list.
func DefaultModelIDs() []string {
	ids := make([]string, len(defaultModelIDs))
	copy(ids, defaultModelIDs)
	return ids
}
