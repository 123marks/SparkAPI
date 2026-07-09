package service

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGrokAPIKeyAccountUsesOpenAICompatibleUpstream(t *testing.T) {
	account := &Account{
		Platform: PlatformGrok,
		Type:     AccountTypeAPIKey,
		Credentials: map[string]any{
			"api_key":  "grok-local-key",
			"base_url": "http://grok2api:8000",
		},
		Extra: map[string]any{
			"openai_passthrough": true,
		},
	}

	require.True(t, account.IsGrok())
	require.True(t, account.IsOpenAICompatible())
	require.True(t, account.IsOpenAICompatibleAPIKey())
	require.Equal(t, "http://grok2api:8000", account.GetOpenAIBaseURL())
	require.Equal(t, "grok-local-key", account.GetOpenAIApiKey())
	require.True(t, account.IsOpenAIPassthroughEnabled())
}

func TestGrokPassthroughAllowsUnmappedModels(t *testing.T) {
	svc := &GatewayService{}
	account := &Account{
		Platform: PlatformGrok,
		Type:     AccountTypeAPIKey,
		Extra: map[string]any{
			"openai_passthrough": true,
		},
	}

	require.True(t, svc.isModelSupportedByAccount(account, "grok-4.20-fast"))
	require.True(t, svc.isModelSupportedByAccount(account, "grok-imagine-image-pro"))
}

func TestAllowedQuotaPlatformsIncludesGrok(t *testing.T) {
	require.True(t, IsAllowedQuotaPlatform(PlatformGrok))
}

func TestOpenAIGatewayService_SelectAccountWithSchedulerForPlatform_GrokKeepsPoolIsolated(t *testing.T) {
	resetOpenAIAdvancedSchedulerSettingCacheForTest()
	ctx := context.Background()
	groupID := int64(42001)
	repo := schedulerTestOpenAIAccountRepo{
		accounts: []Account{
			{
				ID:          1,
				Name:        "openai-account",
				Platform:    PlatformOpenAI,
				Type:        AccountTypeAPIKey,
				Status:      StatusActive,
				Schedulable: true,
				GroupIDs:    []int64{groupID},
			},
			{
				ID:          2,
				Name:        "grok-sidecar",
				Platform:    PlatformGrok,
				Type:        AccountTypeAPIKey,
				Status:      StatusActive,
				Schedulable: true,
				GroupIDs:    []int64{groupID},
				Extra: map[string]any{
					"openai_passthrough": true,
				},
			},
		},
	}
	svc := &OpenAIGatewayService{accountRepo: repo}

	selection, _, err := svc.SelectAccountWithSchedulerForPlatform(
		ctx,
		PlatformGrok,
		&groupID,
		"",
		"",
		"grok-4.20-fast",
		nil,
		OpenAIUpstreamTransportHTTPSSE,
		false,
	)

	require.NoError(t, err)
	require.NotNil(t, selection)
	require.NotNil(t, selection.Account)
	require.Equal(t, int64(2), selection.Account.ID)
	require.Equal(t, PlatformGrok, selection.Account.Platform)
}

func TestOpenAIGatewayService_SelectAccountWithSchedulerForImagesPlatform_GrokRequiresNativeAPIKey(t *testing.T) {
	resetOpenAIAdvancedSchedulerSettingCacheForTest()
	ctx := context.Background()
	groupID := int64(42002)
	repo := schedulerTestOpenAIAccountRepo{
		accounts: []Account{
			{
				ID:          10,
				Name:        "grok-sidecar-image",
				Platform:    PlatformGrok,
				Type:        AccountTypeAPIKey,
				Status:      StatusActive,
				Schedulable: true,
				GroupIDs:    []int64{groupID},
				Extra: map[string]any{
					"openai_passthrough": true,
				},
			},
		},
	}
	svc := &OpenAIGatewayService{accountRepo: repo}

	selection, _, err := svc.SelectAccountWithSchedulerForImagesPlatform(
		ctx,
		PlatformGrok,
		&groupID,
		"",
		"grok-imagine-image-pro",
		nil,
		OpenAIImagesCapabilityNative,
	)

	require.NoError(t, err)
	require.NotNil(t, selection)
	require.NotNil(t, selection.Account)
	require.Equal(t, int64(10), selection.Account.ID)
}

func TestGrokImageModelsUseOpenAICompatibleImageTestPath(t *testing.T) {
	require.True(t, isOpenAIImageModel("grok-imagine"))
	require.True(t, isOpenAIImageModel("grok-imagine-image-pro"))
	require.True(t, isOpenAIImageModel("grok-imagine-edit"))
	require.True(t, isOpenAIImageModel("grok-imagine-image-edit"))
	require.False(t, isOpenAIImageModel("grok-imagine-video-1.5"))
}
