<template>
  <UiCard :title="title">
    <div class="feature-actions">
      <UiButton
        v-for="action in actions"
        :key="action.key"
        :variant="action.type === 'primary' ? 'primary' : 'default'"
        block
        :disabled="action.disabled"
        @click="$emit('action', action.key)"
      >
        {{ action.label }}
      </UiButton>
    </div>
  </UiCard>
</template>

<script setup lang="ts">
import type { PopupFeatureAction } from "../types.js";
import UiButton from "./UiButton.vue";
import UiCard from "./UiCard.vue";

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
