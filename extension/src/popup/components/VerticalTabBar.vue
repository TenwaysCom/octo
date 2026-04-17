<template>
  <div class="vertical-tab-bar" data-test="vertical-tab-bar">
    <div class="vertical-tab-bar__top">
      <button
        type="button"
        class="vertical-tab-bar__item"
        :class="{ active: modelValue === 'automation', disabled: isDisabled('automation') }"
        data-test="vertical-tab-automation"
        @click="handleChange('automation')"
      >
        <svg class="vertical-tab-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="10" rx="2"/>
          <circle cx="12" cy="5" r="2"/>
          <path d="M12 7v4"/>
          <line x1="8" y1="15" x2="8" y2="15.01"/>
          <line x1="16" y1="15" x2="16" y2="15.01"/>
        </svg>
        <span class="vertical-tab-bar__label">自动化</span>
      </button>
      <button
        type="button"
        class="vertical-tab-bar__item"
        :class="{ active: modelValue === 'chat', disabled: isDisabled('chat') }"
        data-test="vertical-tab-chat"
        @click="handleChange('chat')"
      >
        <svg class="vertical-tab-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
        <span class="vertical-tab-bar__label">聊天</span>
      </button>
    </div>
    <div class="vertical-tab-bar__bottom">
      <button
        type="button"
        class="vertical-tab-bar__item"
        :class="{ active: modelValue === 'settings', disabled: isDisabled('settings') }"
        data-test="vertical-tab-settings"
        @click="handleChange('settings')"
      >
        <svg class="vertical-tab-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span class="vertical-tab-bar__label">设置</span>
      </button>
      <button
        type="button"
        class="vertical-tab-bar__item"
        :class="{ active: modelValue === 'profile' }"
        data-test="vertical-tab-profile"
        @click="handleChange('profile')"
      >
        <img
          v-if="larkAvatar"
          :src="larkAvatar"
          class="vertical-tab-bar__avatar"
          alt="个人头像"
        />
        <svg
          v-else
          class="vertical-tab-bar__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <span class="vertical-tab-bar__label">个人</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PopupNotebookPage } from "../types.js";

const props = defineProps<{
  modelValue: PopupNotebookPage;
  authorized?: boolean;
  larkAvatar?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: PopupNotebookPage];
}>();

function isDisabled(value: PopupNotebookPage): boolean {
  return !props.authorized && (value === "chat" || value === "automation");
}

function handleChange(value: PopupNotebookPage) {
  if (isDisabled(value)) {
    return;
  }
  emit("update:modelValue", value);
}
</script>

<style scoped>
.vertical-tab-bar {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 56px;
  height: 100%;
  padding: 8px 4px;
  background: #fff;
  border-left: 1px solid #e2e8f0;
  box-sizing: border-box;
}

.vertical-tab-bar__top,
.vertical-tab-bar__bottom {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vertical-tab-bar__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 48px;
  height: 48px;
  padding: 4px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.vertical-tab-bar__item:hover {
  background: #f1f5f9;
  color: #334155;
}

.vertical-tab-bar__item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.vertical-tab-bar__item.disabled:hover {
  background: transparent;
  color: #64748b;
}

.vertical-tab-bar__item.active {
  background: #eff6ff;
  color: #2563eb;
}

.vertical-tab-bar__icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.vertical-tab-bar__avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.vertical-tab-bar__label {
  font-size: 10px;
  line-height: 1;
  font-weight: 500;
}
</style>
