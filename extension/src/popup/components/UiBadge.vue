<template>
  <span class="ui-badge" :class="`ui-badge--${tone}`">
    <slot />
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  tone?: "success" | "processing" | "warning" | "error" | "default";
}>(), {
  tone: "default",
});
</script>

<style scoped>
.ui-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.ui-badge--success {
  background: #dcfce7;
  border-color: #86efac;
  color: #166534;
}

.ui-badge--processing {
  background: #dbeafe;
  border-color: #93c5fd;
  color: #1d4ed8;
}

.ui-badge--warning {
  background: #fef3c7;
  border-color: #fcd34d;
  color: #92400e;
}

.ui-badge--error {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #b91c1c;
}

.ui-badge--default {
  background: #e2e8f0;
  border-color: #cbd5e1;
  color: #475569;
}
</style>
