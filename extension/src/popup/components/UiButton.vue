<template>
  <button
    :type="nativeType"
    class="ui-button"
    :class="[
      `ui-button--${variant}`,
      `ui-button--${size}`,
      {
        'ui-button--block': block,
      },
    ]"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  variant?: "default" | "primary" | "ghost";
  size?: "sm" | "md";
  block?: boolean;
  disabled?: boolean;
  nativeType?: "button" | "submit" | "reset";
}>(), {
  variant: "default",
  size: "md",
  block: false,
  disabled: false,
  nativeType: "button",
});
</script>

<style scoped>
.ui-button {
  appearance: none;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #ffffff;
  color: #0f172a;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    color 140ms ease,
    transform 140ms ease,
    box-shadow 140ms ease;
}

.ui-button:hover:not(:disabled) {
  border-color: #94a3b8;
  transform: translateY(-1px);
}

.ui-button:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.ui-button--md {
  min-height: 38px;
  padding: 9px 14px;
  font-size: 13px;
}

.ui-button--sm {
  min-height: 30px;
  padding: 6px 10px;
  font-size: 12px;
}

.ui-button--block {
  width: 100%;
}

.ui-button--default {
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  color: #1e293b;
}

.ui-button--primary {
  border-color: #2563eb;
  background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
  color: #ffffff;
  box-shadow: 0 10px 24px rgb(37 99 235 / 20%);
}

.ui-button--primary:hover:not(:disabled) {
  border-color: #1d4ed8;
}

.ui-button--ghost {
  border-color: transparent;
  background: transparent;
  color: #475569;
  padding-inline: 8px;
}

.ui-button--ghost:hover:not(:disabled) {
  background: rgb(148 163 184 / 10%);
  border-color: transparent;
  transform: none;
}
</style>
