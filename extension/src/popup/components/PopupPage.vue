<template>
  <section class="popup-page" data-test="popup-page">
    <header v-if="title || subtitle" class="popup-page__header">
      <div class="popup-page__copy">
        <h2 v-if="title" class="popup-page__title">{{ title }}</h2>
        <p v-if="subtitle" class="popup-page__subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="popup-page__actions">
        <slot name="actions" />
      </div>
    </header>

    <div class="popup-page__body">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="popup-page__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title?: string;
  subtitle?: string;
}>();
</script>

<style scoped>
.popup-page {
  display: grid;
  gap: 16px;
}

.popup-page__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.popup-page__copy {
  min-width: 0;
}

.popup-page__title {
  margin: 0;
  font-size: 18px;
  line-height: 1.15;
  color: #0f172a;
}

.popup-page__subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: #64748b;
}

.popup-page__body {
  display: grid;
  gap: 12px;
}

.popup-page__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
