// @vitest-environment jsdom

import { flushPromises, shallowMount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PopupFeatureAction, PopupLogEntry, PopupSettingsForm, PopupStatusChip } from "./types.js";
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
    expect(wrapper.find('[data-test="unsupported-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="lark-view"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="meegle-view"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="popup-shell"]').text()).toContain("当前页面不支持");
  });

  it("renders the lark page view with lark actions", async () => {
    popupAppMock.current = createPopupAppMock("lark");
    const wrapper = mountApp();

    await flushPromises();

    expect(wrapper.find('[data-test="unsupported-view"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="lark-view"]').text()).toContain("分析当前页面");
    expect(wrapper.find('[data-test="meegle-view"]').exists()).toBe(false);
  });

  it("renders the meegle page view with meegle actions", async () => {
    popupAppMock.current = createPopupAppMock("meegle");
    const wrapper = mountApp();

    await flushPromises();

    expect(wrapper.find('[data-test="unsupported-view"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="lark-view"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="meegle-view"]').text()).toContain("查看来源上下文");
  });

  it("does not render the settings modal until it is opened", async () => {
    const wrapper = mountApp();

    await flushPromises();

    expect(wrapper.find('[data-test="settings-modal"]').exists()).toBe(false);
  });

  it("renders the settings modal after it is opened", async () => {
    popupAppMock.current = createPopupAppMock("unsupported");
    popupAppMock.current.settingsOpen.value = true;
    const wrapper = mountApp();

    await flushPromises();

    expect(wrapper.find('[data-test="settings-modal"]').exists()).toBe(true);
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
          template: "<div data-test='popup-shell'>{{ subtitle }}<slot /></div>",
        },
        UnsupportedPageView: {
          template: "<div data-test='unsupported-view'>unsupported</div>",
        },
        LarkPageView: {
          props: ["actions"],
          template: "<div data-test='lark-view'>{{ actions[0]?.label }}</div>",
        },
        MeeglePageView: {
          props: ["actions"],
          template: "<div data-test='meegle-view'>{{ actions[0]?.label }}</div>",
        },
        LogPanel: {
          props: ["entries"],
          template: "<div data-test='log-panel'>{{ entries.length }}</div>",
        },
        SettingsModal: {
          props: ["open"],
          template: "<div data-test='settings-modal'>{{ open }}</div>",
        },
      },
    },
  });
}

function createPopupAppMock(pageType: PopupPageType) {
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
    openSettings: vi.fn(),
    closeSettings: vi.fn(),
    saveSettingsForm: vi.fn(),
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
