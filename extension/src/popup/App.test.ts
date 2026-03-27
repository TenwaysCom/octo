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

  it("renders the unsupported page view for non-supported tabs", async () => {
    const wrapper = mountApp();

    await flushPromises();

    expect(popupAppMock.current?.initialize).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-test="home-page"]').exists()).toBe(true);
    expect(wrapper.get('[data-test="home-page"]').text()).toContain("unsupported");
    expect(wrapper.find('[data-test="settings-page"]').exists()).toBe(false);
  });

  it("renders the lark page view inside the home page", async () => {
    popupAppMock.current = createPopupAppMock("lark");
    const wrapper = mountApp();

    await flushPromises();

    expect(wrapper.find('[data-test="settings-page"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="home-page"]').text()).toContain("分析当前页面");
  });

  it("renders the meegle page view inside the home page", async () => {
    popupAppMock.current = createPopupAppMock("meegle");
    const wrapper = mountApp();

    await flushPromises();

    expect(wrapper.find('[data-test="settings-page"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="home-page"]').text()).toContain("查看来源上下文");
  });

  it("renders the home page by default", async () => {
    const wrapper = mountApp();

    await flushPromises();

    expect(wrapper.find('[data-test="home-page"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="settings-page"]').exists()).toBe(false);
  });

  it("switches to settings via the notebook tab", async () => {
    popupAppMock.current = createPopupAppMock("lark");
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-test="popup-tab-settings"]').trigger("click");

    expect(wrapper.find('[data-test="settings-page"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="home-page"]').exists()).toBe(false);
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
        PopupNotebook: {
          props: ["modelValue"],
          template: `
            <div data-test='popup-notebook'>
              <button data-test='popup-tab-home' @click="$emit('update:modelValue', 'home')">home</button>
              <button data-test='popup-tab-settings' @click="$emit('update:modelValue', 'settings')">settings</button>
              {{ modelValue }}
            </div>
          `,
        },
        HomePage: {
          props: ["state", "larkActions", "meegleActions"],
          template: `
            <div data-test='home-page'>
              <span v-if="state.pageType === 'unsupported'">unsupported</span>
              <span v-else-if="state.pageType === 'lark'">{{ larkActions[0]?.label }}</span>
              <span v-else>{{ meegleActions[0]?.label }}</span>
            </div>
          `,
        },
        SettingsPage: {
          template: "<div data-test='settings-page'>settings</div>",
        },
      },
    },
  });
}

function createPopupAppMock(pageType: PopupPageType) {
  const activePage = ref<PopupNotebookPage>("home");

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
        key: "meegle-context",
        label: "查看来源上下文",
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
      activePage.value = "home";
    }),
    saveSettingsForm: vi.fn(async () => {
      activePage.value = "home";
    }),
    clearLogs: vi.fn(),
    runFeatureAction: vi.fn(),
  };
}

function createViewModel(pageType: PopupPageType): PopupViewModel {
  if (pageType === "lark") {
    return {
      subtitle: "已连接到 Lark 页面",
      showUnsupported: false,
      showAuthBlockTop: true,
      showAuthBlockBottom: false,
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
      showAuthBlockBottom: false,
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
    showAuthBlockBottom: false,
    showLarkFeatureBlock: false,
    showMeegleFeatureBlock: false,
    canAnalyze: false,
    canDraft: false,
    canApply: false,
  };
}
