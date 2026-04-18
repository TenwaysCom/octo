<template>
  <section class="ui-card">
    <header
      v-if="title || $slots.actions"
      class="ui-card__header"
    >
      <h3 v-if="title" class="ui-card__title">{{ title }}</h3>
      <div v-if="$slots.actions" class="ui-card__actions">
        <slot name="actions" />
      </div>
    </header>

    <div class="ui-card__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title?: string;
}>();
</script>

<style scoped>
.ui-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgb(148 163 184 / 20%);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 96%) 0%, rgb(248 250 252 / 96%) 100%);
  box-shadow: 0 18px 38px rgb(15 23 42 / 7%);
}

.ui-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ui-card__title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.ui-card__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.ui-card__body {
  display: grid;
  gap: 12px;
}
</style>
