<template>
  <section class="kimi-chat-panel" data-test="kimi-chat-panel">
    <header class="kimi-chat-panel__header">
      <div>
        <div class="kimi-chat-panel__eyebrow">Kimi ACP</div>
        <h3 class="kimi-chat-panel__title">连续会话</h3>
      </div>
      <span class="kimi-chat-panel__status" :data-busy="String(busy)">
        {{ busy ? "处理中" : "就绪" }}
      </span>
    </header>

    <div class="kimi-chat-panel__transcript" data-test="kimi-chat-transcript">
      <p v-if="transcript.length === 0" class="kimi-chat-panel__empty">
        还没有消息。
      </p>
      <ul v-else class="kimi-chat-panel__list">
        <li
          v-for="entry in transcript"
          :key="entry.id"
          class="kimi-chat-panel__entry"
          :data-kind="entry.kind"
        >
          <template v-if="entry.kind === 'raw'">
            <div class="kimi-chat-panel__entry-label">
              原始事件
              <span v-if="entry.label" class="kimi-chat-panel__entry-pill">
                {{ entry.label }}
              </span>
            </div>
            <pre class="kimi-chat-panel__raw">{{ entry.raw }}</pre>
          </template>
          <template v-else>
            <div class="kimi-chat-panel__entry-label">
              {{ resolveEntryLabel(entry.kind) }}
            </div>
            <p v-if="entry.text" class="kimi-chat-panel__entry-text">
              {{ entry.text }}
            </p>

            <section
              v-if="entry.kind === 'assistant' && entry.thoughts?.length"
              class="kimi-chat-panel__detail-section"
            >
              <div class="kimi-chat-panel__detail-title">思路</div>
              <ul class="kimi-chat-panel__detail-list">
                <li v-for="thought in entry.thoughts" :key="thought.id">
                  {{ thought.text }}
                </li>
              </ul>
            </section>

            <section
              v-if="entry.kind === 'assistant' && entry.toolCalls?.length"
              class="kimi-chat-panel__detail-section"
            >
              <div class="kimi-chat-panel__detail-title">工具</div>
              <ul class="kimi-chat-panel__detail-list">
                <li
                  v-for="toolCall in entry.toolCalls"
                  :key="toolCall.id"
                  class="kimi-chat-panel__tool-call"
                >
                  <span>{{ toolCall.title }}</span>
                  <span
                    v-if="toolCall.status"
                    class="kimi-chat-panel__entry-pill"
                  >
                    {{ resolveToolStatus(toolCall.status) }}
                  </span>
                  <div
                    v-if="toolCall.detail"
                    class="kimi-chat-panel__tool-detail"
                  >
                    {{ toolCall.detail }}
                  </div>
                </li>
              </ul>
            </section>
          </template>
        </li>
      </ul>
    </div>

    <form class="kimi-chat-panel__composer">
      <input
        :value="message"
        data-test="kimi-chat-input"
        class="kimi-chat-panel__input"
        type="text"
        placeholder="输入一条消息"
        :disabled="busy"
        @input="handleInput"
      />
      <button
        data-test="kimi-chat-send"
        class="kimi-chat-panel__send"
        type="button"
        :disabled="busy || !message.trim()"
        @click="handleSubmit"
      >
        发送
      </button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { KimiChatTranscriptEntry } from "../../types/acp-kimi.js";

const props = defineProps<{
  transcript: KimiChatTranscriptEntry[];
  busy: boolean;
  draftMessage?: string;
}>();

const emit = defineEmits<{
  send: [message: string];
  "update:draftMessage": [message: string];
}>();

const message = ref(props.draftMessage ?? "");

watch(
  () => props.draftMessage,
  (value) => {
    message.value = value ?? "";
  },
);

function handleInput(event: Event) {
  const nextMessage = (event.target as HTMLInputElement).value;
  message.value = nextMessage;
  emit("update:draftMessage", nextMessage);
}

function handleSubmit() {
  const nextMessage = message.value.trim();
  if (!nextMessage) {
    return;
  }

  emit("send", nextMessage);
  emit("update:draftMessage", "");
  message.value = "";
}

function resolveEntryLabel(kind: KimiChatTranscriptEntry["kind"]): string {
  switch (kind) {
    case "user":
      return "你";
    case "assistant":
      return "Kimi";
    case "status":
      return "状态";
    case "raw":
      return "原始事件";
  }
}

function resolveToolStatus(status: string): string {
  switch (status) {
    case "pending":
      return "待处理";
    case "in_progress":
      return "进行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    default:
      return status;
  }
}
</script>

<style scoped>
.kimi-chat-panel {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff, #f7fbff);
}

.kimi-chat-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.kimi-chat-panel__eyebrow {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #2563eb;
}

.kimi-chat-panel__title {
  margin: 2px 0 0;
  font-size: 18px;
  line-height: 1.2;
}

.kimi-chat-panel__status {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 600;
}

.kimi-chat-panel__transcript {
  min-height: 120px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.03);
}

.kimi-chat-panel__empty {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.kimi-chat-panel__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.kimi-chat-panel__entry {
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.8);
  color: #0f172a;
  display: grid;
  gap: 8px;
}

.kimi-chat-panel__entry[data-kind="assistant"] {
  background: rgba(255, 255, 255, 0.96);
}

.kimi-chat-panel__entry[data-kind="status"] {
  background: rgba(37, 99, 235, 0.08);
}

.kimi-chat-panel__entry[data-kind="raw"] {
  background: rgba(15, 23, 42, 0.08);
}

.kimi-chat-panel__entry-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.kimi-chat-panel__entry-text {
  margin: 0;
  white-space: pre-wrap;
}

.kimi-chat-panel__detail-section {
  display: grid;
  gap: 6px;
  padding-top: 4px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
}

.kimi-chat-panel__detail-title {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
}

.kimi-chat-panel__detail-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
}

.kimi-chat-panel__tool-call {
  display: grid;
  gap: 4px;
}

.kimi-chat-panel__tool-detail {
  color: #475569;
  font-size: 12px;
  word-break: break-all;
}

.kimi-chat-panel__entry-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 600;
}

.kimi-chat-panel__raw {
  margin: 0;
  padding: 10px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.92);
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.kimi-chat-panel__composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.kimi-chat-panel__input,
.kimi-chat-panel__send {
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  font: inherit;
}

.kimi-chat-panel__input {
  padding: 0 12px;
}

.kimi-chat-panel__send {
  padding: 0 16px;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
}

.kimi-chat-panel__send:disabled {
  background: #94a3b8;
}
</style>
