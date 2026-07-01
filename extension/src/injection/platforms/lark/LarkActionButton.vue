<template>
  <a-button
    type="primary"
    size="small"
    :loading="loading"
    :disabled="disabled"
    data-tenways-octo-trigger="send-to-meegle"
    @click="emit('click')"
  >
    {{ label }}
  </a-button>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  loading?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "click"): void;
}>();
</script>
