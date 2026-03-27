<template>
  <div class="popup-notebook" data-test="popup-notebook">
    <a-segmented
      :value="modelValue"
      :options="options"
      block
      @change="handleChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PopupNotebookPage } from "../types.js";

const props = defineProps<{
  modelValue: PopupNotebookPage;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: PopupNotebookPage];
}>();

const options = computed(() => [
  {
    label: "主页",
    value: "home",
  },
  {
    label: "设置",
    value: "settings",
  },
]);

function handleChange(value: string | number) {
  emit("update:modelValue", value as PopupNotebookPage);
}
</script>

<style scoped>
.popup-notebook {
  width: 100%;
}
</style>
