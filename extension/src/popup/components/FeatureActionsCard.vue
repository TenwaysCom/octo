<template>
  <a-card :title="title" size="small">
    <div class="feature-actions">
      <a-button
        v-for="action in actions"
        :key="action.key"
        :type="action.type || 'default'"
        block
        :disabled="action.disabled"
        @click="$emit('action', action.key)"
      >
        {{ action.label }}
      </a-button>
    </div>
  </a-card>
</template>

<script setup lang="ts">
import type { PopupFeatureAction } from "../types";

defineProps<{
  title: string;
  actions: PopupFeatureAction[];
}>();

defineEmits<{
  action: [key: string];
}>();
</script>

<style scoped>
.feature-actions {
  display: grid;
  gap: 8px;
}
</style>
