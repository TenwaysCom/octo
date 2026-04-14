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
        >
          {{ entry.text }}
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
