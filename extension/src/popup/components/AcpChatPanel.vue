<template>
  <section class="acp-chat-panel" data-test="acp-chat-panel">
    <div class="acp-chat-panel__transcript" data-test="kimi-chat-transcript">
      <p v-if="transcript.length === 0" class="acp-chat-panel__empty">
        还没有消息。
      </p>
      <ul v-else class="acp-chat-panel__list">
        <li
          v-for="entry in transcript"
          :key="entry.id"
          class="acp-chat-panel__entry"
          :data-kind="entry.kind"
        >
          <template v-if="entry.kind === 'raw'">
            <div class="acp-chat-panel__entry-label">
              原始事件
              <span v-if="entry.label" class="acp-chat-panel__entry-pill">
                {{ entry.label }}
              </span>
            </div>
            <pre class="acp-chat-panel__raw">{{ entry.raw }}</pre>
          </template>
          <template v-else>
            <div class="acp-chat-panel__entry-label">
              {{ resolveEntryLabel(entry.kind) }}
            </div>
            <div
              v-if="entry.kind === 'assistant' && entry.text"
              class="acp-chat-panel__entry-text acp-chat-panel__entry-text--markdown"
              v-html="renderAssistantText(entry.text)"
            />
            <p v-else-if="entry.text" class="acp-chat-panel__entry-text">
              {{ entry.text }}
            </p>

            <section
              v-if="entry.kind === 'assistant' && entry.thoughts?.length"
              class="acp-chat-panel__detail-section"
            >
              <div class="acp-chat-panel__detail-title">思路</div>
              <ul class="acp-chat-panel__detail-list">
                <li v-for="thought in entry.thoughts" :key="thought.id">
                  {{ thought.text }}
                </li>
              </ul>
            </section>

            <section
              v-if="entry.kind === 'assistant' && entry.toolCalls?.length"
              class="acp-chat-panel__detail-section"
            >
              <div class="acp-chat-panel__detail-title">工具</div>
              <ul class="acp-chat-panel__detail-list">
                <li
                  v-for="toolCall in entry.toolCalls"
                  :key="toolCall.id"
                  class="acp-chat-panel__tool-call"
                >
                  <span>{{ toolCall.title }}</span>
                  <span
                    v-if="toolCall.status"
                    class="acp-chat-panel__entry-pill"
                  >
                    {{ resolveToolStatus(toolCall.status) }}
                  </span>
                  <div
                    v-if="toolCall.detail"
                    class="acp-chat-panel__tool-detail"
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

    <form class="acp-chat-panel__composer" @submit.prevent="handleSubmit">
      <input
        :value="message"
        data-test="kimi-chat-input"
        class="acp-chat-panel__input"
        type="text"
        placeholder="输入一条消息"
        :disabled="busy"
        @input="handleInput"
      />
      <button
        data-test="kimi-chat-send"
        class="acp-chat-panel__send"
        type="button"
        :disabled="busy || !message.trim()"
        @click="handleSubmit"
      >
        发送
      </button>
      <button
        v-if="busy"
        data-test="kimi-chat-stop"
        class="acp-chat-panel__stop"
        type="button"
        @click="emit('stop')"
      >
        停止
      </button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { KimiChatTranscriptEntry } from "../../types/acp-kimi.js";
import { renderMarkdownStream } from "../markdown-stream.js";

const props = defineProps<{
  transcript: KimiChatTranscriptEntry[];
  busy: boolean;
  draftMessage?: string;
}>();

const emit = defineEmits<{
  send: [message: string];
  "update:draftMessage": [message: string];
  stop: [];
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

function renderAssistantText(text: string): string {
  return renderMarkdownStream(text);
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
.acp-chat-panel {
  display: grid;
  gap: 12px;
}

.acp-chat-panel__transcript {
  min-height: 120px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.03);
  border: 1px solid rgba(15, 23, 42, 0.05);
}

.acp-chat-panel__empty {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.acp-chat-panel__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.acp-chat-panel__entry {
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.acp-chat-panel__entry[data-kind="assistant"] {
  background: rgba(37, 99, 235, 0.06);
}

.acp-chat-panel__entry[data-kind="status"] {
  background: rgba(15, 23, 42, 0.04);
}

.acp-chat-panel__entry-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.acp-chat-panel__entry-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 600;
  text-transform: none;
  letter-spacing: normal;
}

.acp-chat-panel__entry-text {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: #0f172a;
  white-space: pre-wrap;
}

.acp-chat-panel__entry-text :deep(pre) {
  margin: 8px 0 0;
  padding: 10px 12px;
  overflow-x: auto;
  border-radius: 10px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
}

.acp-chat-panel__detail-section {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.acp-chat-panel__detail-title {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
}

.acp-chat-panel__detail-list {
  margin: 6px 0 0;
  padding-left: 18px;
  color: #475569;
  display: grid;
  gap: 4px;
}

.acp-chat-panel__tool-call {
  display: grid;
  gap: 4px;
}

.acp-chat-panel__tool-detail {
  font-size: 12px;
  color: #64748b;
  word-break: break-word;
}

.acp-chat-panel__raw {
  margin: 8px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #0f172a;
  color: #cbd5e1;
  font-size: 12px;
  overflow-x: auto;
}

.acp-chat-panel__composer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 18px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
}

.acp-chat-panel__input {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #0f172a;
}

.acp-chat-panel__input::placeholder {
  color: #94a3b8;
}

.acp-chat-panel__send,
.acp-chat-panel__stop {
  border: none;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.acp-chat-panel__send {
  background: #2563eb;
  color: #ffffff;
}

.acp-chat-panel__send:disabled {
  cursor: not-allowed;
  background: #bfdbfe;
}

.acp-chat-panel__stop {
  background: rgba(15, 23, 42, 0.08);
  color: #334155;
}
</style>
