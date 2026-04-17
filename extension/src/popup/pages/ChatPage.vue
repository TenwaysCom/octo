<template>
  <div class="chat-page" data-test="chat-page">
    <UnsupportedPageView
      v-if="viewModel.showUnsupported"
      data-test="unsupported-view"
    />
    <section v-else class="chat-page__shell">
      <header class="chat-page__toolbar">
        <div class="chat-page__toolbar-copy">
          <div class="chat-page__eyebrow">ACP</div>
          <h3 class="chat-page__title">连续会话</h3>
        </div>
        <div class="chat-page__toolbar-actions">
          <button
            data-test="chat-open-history"
            class="chat-page__toolbar-button"
            type="button"
            @click="$emit('openKimiChatHistory')"
          >
            历史会话
          </button>
          <button
            data-test="chat-new-session"
            class="chat-page__toolbar-button chat-page__toolbar-button--primary"
            type="button"
            @click="$emit('resetKimiChatSession')"
          >
            新会话
          </button>
        </div>
      </header>

      <div v-if="isEmptySession" class="chat-page__empty-state">
        <p class="chat-page__empty-title">还没有消息</p>
        <p class="chat-page__empty-copy">
          新会话会从这里开始，后续这里会承载按页面上下文切换的快速开始卡片。
        </p>
      </div>

      <AcpChatPanel
        :transcript="kimiChatTranscript"
        :busy="kimiChatBusy"
        :draft-message="kimiChatDraftMessage"
        @send="$emit('sendKimiChatMessage', $event)"
        @stop="$emit('stopKimiChatGeneration')"
        @update:draft-message="$emit('updateKimiChatDraftMessage', $event)"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { KimiChatTranscriptEntry } from "../../types/acp-kimi.js";
import AcpChatPanel from "../components/AcpChatPanel.vue";
import type { PopupViewModel } from "../view-model.js";
import UnsupportedPageView from "./UnsupportedPageView.vue";

const props = defineProps<{
  viewModel: PopupViewModel;
  showKimiChat: boolean;
  kimiChatTranscript: KimiChatTranscriptEntry[];
  kimiChatBusy: boolean;
  kimiChatDraftMessage: string;
}>();

defineEmits<{
  sendKimiChatMessage: [message: string];
  stopKimiChatGeneration: [];
  updateKimiChatDraftMessage: [message: string];
  resetKimiChatSession: [];
  openKimiChatHistory: [];
}>();

const isEmptySession = computed(() => props.kimiChatTranscript.length === 0);
</script>

<style scoped>
.chat-page {
  display: grid;
  gap: 12px;
}

.chat-page__shell {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 20px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background:
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.12), transparent 32%),
    linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
}

.chat-page__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.chat-page__toolbar-copy {
  min-width: 0;
}

.chat-page__eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #2563eb;
}

.chat-page__title {
  margin: 4px 0 0;
  font-size: 18px;
  line-height: 1.2;
  color: #0f172a;
}

.chat-page__toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-page__toolbar-button {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  padding: 7px 12px;
  background: rgba(255, 255, 255, 0.88);
  color: #334155;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.chat-page__toolbar-button--primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
}

.chat-page__empty-state {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px dashed rgba(37, 99, 235, 0.24);
}

.chat-page__empty-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.chat-page__empty-copy {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #64748b;
}
</style>
