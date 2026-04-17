// @vitest-environment jsdom

import { flushPromises, shallowMount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PopupFeatureAction,
  PopupLogEntry,
  PopupNotebookPage,
  PopupSettingsForm,
  PopupStatusChip,
} from "./types.js";
import type { PopupPageType, PopupViewModel } from "./view-model.js";

const popupAppMock = vi.hoisted(() => ({
  current: null as ReturnType<typeof createPopupAppMock> | null,
}));

vi.mock("./composables/use-popup-app", () => ({
  usePopupApp: () => popupAppMock.current,
}));

import App from "./App.vue";

describe("popup App", () => {
  beforeEach(() => {
    popupAppMock.current = createPopupAppMock("unsupported");
  });

  it("renders the automation page by default", async () => {
    const wrapper = mountApp();

    await flushPromises();

    expect(popupAppMock.current?.initialize).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-test="automation-page"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="settings-page"]').exists()).toBe(false);
  });

  it("renders the unsupported view inside the automation page", async () => {
    const wrapper = mountApp();

    await flushPromises();

    expect(wrapper.find('[data-test="settings-page"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="automation-page"]').text()).toContain("unsupported");
  });

  it("renders the automation page with lark actions", async () => {
    popupAppMock.current = createPopupAppMock("lark");
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-test="vertical-tab-automation"]').trigger("click");

    expect(wrapper.find('[data-test="automation-page"]').exists()).toBe(true);
    expect(wrapper.get('[data-test="automation-page"]').text()).toContain("分析当前页面");
  });

  it("renders the automation page with meegle actions", async () => {
    popupAppMock.current = createPopupAppMock("meegle");
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-test="vertical-tab-automation"]').trigger("click");

    expect(wrapper.find('[data-test="automation-page"]').exists()).toBe(true);
    expect(wrapper.get('[data-test="automation-page"]').text()).toContain("更新Lark及推送");
  });

  it("switches to settings via the vertical tab bar", async () => {
    popupAppMock.current = createPopupAppMock("lark");
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-test="vertical-tab-settings"]').trigger("click");

    expect(wrapper.find('[data-test="settings-page"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="chat-page"]').exists()).toBe(false);
  });

  it("switches to profile via the vertical tab bar", async () => {
    popupAppMock.current = createPopupAppMock("lark");
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-test="vertical-tab-profile"]').trigger("click");

    expect(wrapper.find('[data-test="profile-page"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="chat-page"]').exists()).toBe(false);
  });
});

function mountApp() {
  return shallowMount(App, {
    global: {
      stubs: {
        "a-config-provider": {
          template: "<div data-test='config-provider'><slot /></div>",
        },
        "a-app": {
          template: "<div data-test='ant-app'><slot /></div>",
        },
        PopupShell: {
          props: ["subtitle"],
          template: `
            <div data-test='popup-shell'>
              {{ subtitle }}
              <slot />
            </div>
          `,
        },
        VerticalTabBar: {
          props: ["modelValue"],
          template: `
            <div data-test='vertical-tab-bar'>
              <button data-test='vertical-tab-chat' @click="$emit('update:modelValue', 'chat')">chat</button>
              <button data-test='vertical-tab-automation' @click="$emit('update:modelValue', 'automation')">automation</button>
              <button data-test='vertical-tab-settings' @click="$emit('update:modelValue', 'settings')">settings</button>
              <button data-test='vertical-tab-profile' @click="$emit('update:modelValue', 'profile')">profile</button>
              {{ modelValue }}
            </div>
          `,
        },
        ChatPage: {
          props: ["state", "viewModel", "larkActions", "meegleActions", "logs"],
          template: `
            <div data-test='chat-page'>
              <span v-if="viewModel?.showUnsupported">unsupported</span>
              <span v-else-if="state?.pageType === 'lark'">{{ larkActions?.[0]?.label }}</span>
              <span v-else>{{ meegleActions?.[0]?.label }}</span>
            </div>
          `,
        },
        AutomationPage: {
          props: ["state", "viewModel", "larkActions", "meegleActions"],
          template: `
            <div data-test='automation-page'>
              <span v-if="viewModel?.showUnsupported">unsupported</span>
              <span v-else-if="state?.pageType === 'lark'">{{ larkActions?.[0]?.label }}</span>
              <span v-else>{{ meegleActions?.[0]?.label }}</span>
            </div>
          `,
        },
        SettingsPage: {
          template: "<div data-test='settings-page'>settings</div>",
        },
        ProfilePage: {
          template: "<div data-test='profile-page'>profile</div>",
        },
      },
    },
  });
}

function createPopupAppMock(pageType: PopupPageType) {
  const activePage = ref<PopupNotebookPage>("automation");

  return {
    state: reactive({
      pageType,
      currentTabId: 1,
      currentTabOrigin: pageType === "unsupported" ? null : "https://tenant.meegle.com",
      currentUrl: null,
      identity: {
        larkId: pageType === "meegle" ? null : "ou_test",
        meegleUserKey: pageType === "lark" ? null : "user_test",
      },
      isAuthed: {
        lark: false,
        meegle: false,
      },
      meegleAuth: undefined,
      larkAuth: undefined,
    }),
    logs: ref<PopupLogEntry[]>([]),
    isLoading: ref(false),
    activePage,
    settingsOpen: ref(false),
    settingsForm: reactive<PopupSettingsForm>({
      SERVER_URL: "http://localhost:3000",
      MEEGLE_PLUGIN_ID: "plugin_test",
      LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
      meegleUserKey: "",
      larkUserId: "",
    }),
    viewModel: ref(createViewModel(pageType)),
    headerSubtitle: ref(createViewModel(pageType).subtitle),
    meegleStatus: ref<PopupStatusChip>({ tone: "default", text: "-" }),
    larkStatus: ref<PopupStatusChip>({ tone: "default", text: "-" }),
    topMeegleButtonText: ref("授权"),
    topLarkButtonText: ref("授权"),
    topMeegleButtonDisabled: ref(false),
    topLarkButtonDisabled: ref(false),
    larkActions: ref<PopupFeatureAction[]>([
      {
        key: "analyze",
        label: "分析当前页面",
        type: "primary",
        disabled: false,
      },
    ]),
    meegleActions: ref<PopupFeatureAction[]>([
      {
        key: "update-lark-and-push",
        label: "更新Lark及推送",
        type: "primary",
        disabled: false,
      },
    ]),
    initialize: vi.fn().mockResolvedValue(undefined),
    authorizeMeegle: vi.fn(),
    authorizeLark: vi.fn(),
    openSettings: vi.fn(() => {
      activePage.value = "settings";
    }),
    closeSettings: vi.fn(() => {
      activePage.value = "chat";
    }),
    refreshServerConfig: vi.fn(),
    saveSettingsForm: vi.fn(async () => {
      activePage.value = "chat";
    }),
    clearLogs: vi.fn(),
    runFeatureAction: vi.fn(),
    stopKimiChatGeneration: vi.fn(),
  };
}

function createViewModel(pageType: PopupPageType): PopupViewModel {
  if (pageType === "lark") {
    return {
      subtitle: "已连接到 Lark 页面",
      showUnsupported: false,
      showAuthBlockTop: true,
      showLarkFeatureBlock: true,
      showMeegleFeatureBlock: false,
      canAnalyze: true,
      canDraft: false,
      canApply: false,
    };
  }

  if (pageType === "meegle") {
    return {
      subtitle: "已连接到 Meegle 页面",
      showUnsupported: false,
      showAuthBlockTop: true,
      showLarkFeatureBlock: false,
      showMeegleFeatureBlock: true,
      canAnalyze: false,
      canDraft: false,
      canApply: false,
    };
  }

  return {
    subtitle: "当前页面不支持",
    showUnsupported: true,
    showAuthBlockTop: false,
    showLarkFeatureBlock: false,
    showMeegleFeatureBlock: false,
    canAnalyze: false,
    canDraft: false,
    canApply: false,
  };
}
