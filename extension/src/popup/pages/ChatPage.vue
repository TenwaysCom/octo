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

      <section
        v-if="kimiChatHistoryOpen"
        class="chat-page__history-panel"
        data-test="chat-history-panel"
      >
        <div class="chat-page__history-header">
          <div class="chat-page__history-title">历史会话</div>
          <button
            data-test="chat-history-close"
            class="chat-page__history-close"
            type="button"
            @click="$emit('closeKimiChatHistory')"
          >
            关闭
          </button>
        </div>

        <p v-if="kimiChatHistoryLoading" class="chat-page__history-empty">
          正在加载历史会话...
        </p>
        <p
          v-else-if="kimiChatHistoryItems.length === 0"
          class="chat-page__history-empty"
        >
          还没有历史会话。
        </p>
        <ul v-else class="chat-page__history-list">
          <li
            v-for="session in kimiChatHistoryItems"
            :key="session.sessionId"
            class="chat-page__history-item"
          >
            <button
              :data-test="`chat-history-load-${session.sessionId}`"
              class="chat-page__history-load"
              type="button"
              @click="$emit('loadKimiChatHistorySession', session.sessionId)"
            >
              <span class="chat-page__history-copy">
                <span>{{ session.title || session.sessionId }}</span>
                <span
                  v-if="session.updatedAt"
                  class="chat-page__history-updated-at"
                >
                  {{ formatSessionUpdatedAt(session.updatedAt) }}
                </span>
              </span>
              <span v-if="session.sessionId === kimiChatSessionId">
                当前会话
              </span>
            </button>
            <button
              :data-test="`chat-history-delete-${session.sessionId}`"
              class="chat-page__history-delete"
              type="button"
              @click="$emit('deleteKimiChatHistorySession', session.sessionId)"
            >
              删除
            </button>
          </li>
        </ul>
      </section>

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
import type {
  KimiChatSessionSummary,
  KimiChatTranscriptEntry,
} from "../../types/acp-kimi.js";
import AcpChatPanel from "../components/AcpChatPanel.vue";
import type { PopupViewModel } from "../view-model.js";
import UnsupportedPageView from "./UnsupportedPageView.vue";

const props = defineProps<{
  viewModel: PopupViewModel;
  showKimiChat: boolean;
  kimiChatSessionId: string | null;
  kimiChatTranscript: KimiChatTranscriptEntry[];
  kimiChatBusy: boolean;
  kimiChatDraftMessage: string;
  kimiChatHistoryOpen: boolean;
  kimiChatHistoryLoading: boolean;
  kimiChatHistoryItems: KimiChatSessionSummary[];
}>();

defineEmits<{
  sendKimiChatMessage: [message: string];
  stopKimiChatGeneration: [];
  updateKimiChatDraftMessage: [message: string];
  resetKimiChatSession: [];
  openKimiChatHistory: [];
  closeKimiChatHistory: [];
  loadKimiChatHistorySession: [sessionId: string];
  deleteKimiChatHistorySession: [sessionId: string];
}>();

const isEmptySession = computed(() => props.kimiChatTranscript.length === 0);

function formatSessionUpdatedAt(updatedAt: string): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return updatedAt;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
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

.chat-page__history-panel {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(37, 99, 235, 0.14);
}

.chat-page__history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.chat-page__history-title {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.chat-page__history-close,
.chat-page__history-delete,
.chat-page__history-load {
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.92);
  cursor: pointer;
}

.chat-page__history-close,
.chat-page__history-delete {
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
}

.chat-page__history-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.chat-page__history-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-page__history-load {
  flex: 1 1 auto;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-radius: 12px;
  padding: 10px 12px;
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
}

.chat-page__history-copy {
  display: grid;
  gap: 2px;
  justify-items: start;
}

.chat-page__history-updated-at {
  font-size: 11px;
  font-weight: 500;
  color: #64748b;
}

.chat-page__history-delete {
  color: #b91c1c;
}

.chat-page__history-empty {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}
</style>
