<template>
  <section class="popup-shell" data-test="popup-shell">
    <header class="popup-shell__header">
      <div class="popup-shell__identity">
        <span class="popup-shell__eyebrow">Tenways Octo</span>
        <h1 class="popup-shell__title">跨平台协同助手</h1>
        <p class="popup-shell__subtitle">{{ subtitle }}</p>
      </div>
      <a-button
        type="text"
        class="popup-shell__settings"
        data-test="popup-shell-settings"
        @click="$emit('settings')"
      >
        设置
      </a-button>
    </header>
    <div class="popup-shell__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  subtitle: string;
}>();

defineEmits<{
  settings: [];
}>();
</script>

<style scoped>
.popup-shell {
  min-height: 240px;
  padding: 12px;
}

.popup-shell__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(37, 99, 235, 0.94), rgba(59, 130, 246, 0.88)),
    linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
  color: #eff6ff;
  box-shadow: 0 18px 36px rgba(37, 99, 235, 0.22);
}

.popup-shell__identity {
  min-width: 0;
}

.popup-shell__eyebrow {
  display: inline-block;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(239, 246, 255, 0.82);
}

.popup-shell__title {
  margin: 0;
  font-size: 20px;
  line-height: 1.15;
  color: #fff;
}

.popup-shell__subtitle {
  margin: 6px 0 0;
  font-size: 12px;
  color: rgba(239, 246, 255, 0.86);
}

.popup-shell__settings {
  align-self: flex-start;
  color: #eff6ff;
}

.popup-shell__body {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}
</style>
