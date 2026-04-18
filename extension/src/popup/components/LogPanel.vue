<template>
  <UiCard title="日志">
    <template #actions>
      <button class="log-panel__action" type="button" @click="$emit('export')">
        导出日志
      </button>
      <span class="log-panel__action-divider">|</span>
      <button class="log-panel__action" type="button" @click="$emit('clear')">
        清除
      </button>
    </template>

    <div class="log-panel">
      <div v-if="entries.length === 0" class="log-panel__empty">
        暂无日志
      </div>
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="log-panel__entry"
        :data-level="entry.level"
      >
        <span class="log-panel__time">[{{ entry.timestamp }}]</span>
        <span class="log-panel__message">{{ entry.message }}</span>
      </div>
    </div>
  </UiCard>
</template>

<script setup lang="ts">
import type { PopupLogEntry } from "../types.js";
import UiCard from "./UiCard.vue";

defineProps<{
  entries: PopupLogEntry[];
}>();
defineEmits<{
  clear: [];
  export: [];
}>();
</script>

<style scoped>
.log-panel {
  display: grid;
  gap: 6px;
  max-height: 600px;
  overflow-y: auto;
  padding: 2px 0;
  font-family:
    "SF Mono",
    "Roboto Mono",
    "PingFang SC",
    monospace;
}

.log-panel__empty {
  color: #64748b;
  font-size: 12px;
}

.log-panel__entry {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 10px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 11px;
}

.log-panel__entry[data-level="success"] {
  color: #bbf7d0;
}

.log-panel__entry[data-level="warn"] {
  color: #fde68a;
}

.log-panel__entry[data-level="error"] {
  color: #fecaca;
}

.log-panel__time {
  color: rgba(226, 232, 240, 0.62);
}

.log-panel__message {
  word-break: break-word;
}

.log-panel__action {
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}

.log-panel__action:hover {
  color: #2563eb;
}

.log-panel__action-divider {
  color: #94a3b8;
  font-size: 12px;
}
</style>
