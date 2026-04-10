// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import LarkPageView from "./LarkPageView.vue";
import MeeglePageView from "./MeeglePageView.vue";
import type { PopupViewModel } from "../view-model.js";

const authorizedViewModel: PopupViewModel = {
  subtitle: "Meegle",
  showUnsupported: false,
  showAuthBlockTop: true,
  showLarkFeatureBlock: false,
  showMeegleFeatureBlock: true,
  canAnalyze: false,
  canDraft: false,
  canApply: false,
};

const authorizedProps = {
  viewModel: authorizedViewModel,
  meegleStatus: { tone: "success" as const, text: "已授权" },
  larkStatus: { tone: "success" as const, text: "已授权" },
  topMeegleButtonText: "已授权",
  topLarkButtonText: "已授权",
  topMeegleButtonDisabled: true,
  topLarkButtonDisabled: true,
  actions: [],
};

describe("page view auth buttons", () => {
  it("keeps the auth buttons disabled on the Meegle page when auth is ready", () => {
    const wrapper = mount(MeeglePageView, {
      props: authorizedProps,
      global: {
        stubs: {
          AuthStatusCard: {
            props: [
              "meegleButtonDisabled",
              "larkButtonDisabled",
              "meegleButtonText",
              "larkButtonText",
            ],
            template: `
              <div
                data-test="auth-card"
                :data-meegle-disabled="String(Boolean(meegleButtonDisabled))"
                :data-lark-disabled="String(Boolean(larkButtonDisabled))"
                :data-meegle-text="meegleButtonText"
                :data-lark-text="larkButtonText"
              />
            `,
          },
          FeatureActionsCard: true,
        },
      },
    });

    const cards = wrapper.findAll('[data-test="auth-card"]');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.attributes("data-meegle-disabled")).toBe("true");
    expect(cards[0]?.attributes("data-meegle-text")).toBe("已授权");
  });

  it("keeps the auth buttons disabled on the Lark page when auth is ready", () => {
    const wrapper = mount(LarkPageView, {
      props: authorizedProps,
      global: {
        stubs: {
          AuthStatusCard: {
            props: [
              "meegleButtonDisabled",
              "larkButtonDisabled",
              "meegleButtonText",
              "larkButtonText",
            ],
            template: `
              <div
                data-test="auth-card"
                :data-meegle-disabled="String(Boolean(meegleButtonDisabled))"
                :data-lark-disabled="String(Boolean(larkButtonDisabled))"
                :data-meegle-text="meegleButtonText"
                :data-lark-text="larkButtonText"
              />
            `,
          },
          FeatureActionsCard: true,
        },
      },
    });

    const cards = wrapper.findAll('[data-test="auth-card"]');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.attributes("data-meegle-disabled")).toBe("true");
    expect(cards[0]?.attributes("data-lark-disabled")).toBe("true");
  });
});
