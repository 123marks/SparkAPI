import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HomeView from '@/views/HomeView.vue'
import { useAppStore } from '@/stores/app'
import type { PublicSettings } from '@/types'

vi.mock('@/i18n', () => ({
  i18n: {
    global: {
      t: (key: string) => key
    }
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('@/api/auth', () => ({
  getPublicSettings: vi.fn()
}))

vi.mock('@/api', () => ({
  authAPI: {
    getCurrentUser: vi.fn(),
    refreshToken: vi.fn(),
    logout: vi.fn(),
    login: vi.fn(),
    login2FA: vi.fn(),
    register: vi.fn()
  },
  isTotp2FARequired: vi.fn(() => false)
}))

function publicSettings(homeContent: string): PublicSettings {
  return {
    registration_enabled: false,
    email_verify_enabled: false,
    force_email_on_third_party_signup: false,
    registration_email_suffix_whitelist: [],
    promo_code_enabled: false,
    password_reset_enabled: false,
    invitation_code_enabled: false,
    turnstile_enabled: false,
    turnstile_site_key: '',
    site_name: 'SparkAPI',
    site_logo: '',
    site_subtitle: '',
    api_base_url: '',
    contact_info: '',
    doc_url: '',
    home_content: homeContent,
    hide_ccs_import_button: false,
    payment_enabled: false,
    risk_control_enabled: false,
    table_default_page_size: 100,
    table_page_size_options: [20, 50, 100],
    custom_menu_items: [],
    custom_endpoints: [],
    linuxdo_oauth_enabled: false,
    wechat_oauth_enabled: false,
    oidc_oauth_enabled: false,
    oidc_oauth_provider_name: 'OIDC',
    github_oauth_enabled: false,
    google_oauth_enabled: false,
    backend_mode_enabled: false,
    version: '',
    balance_low_notify_enabled: false,
    account_quota_notify_enabled: false,
    balance_low_notify_threshold: 0,
    channel_monitor_enabled: false,
    channel_monitor_default_interval_seconds: 60,
    available_channels_enabled: false,
    affiliate_enabled: false
  }
}

describe('HomeView custom content security', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    })
  })

  it('sanitizes custom home HTML before rendering it', () => {
    const appStore = useAppStore()
    appStore.cachedPublicSettings = publicSettings(
      '<h1>Welcome</h1><img src="x" onerror="alert(1)"><script>alert(2)</script>'
    )
    appStore.publicSettingsLoaded = true

    const wrapper = mount(HomeView, {
      global: {
        stubs: {
          RouterLink: true,
          LocaleSwitcher: true,
          Icon: true
        }
      }
    })

    expect(wrapper.text()).toContain('Welcome')
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('img').attributes('onerror')).toBeUndefined()
  })
})
