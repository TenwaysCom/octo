<template>
  <UiCard>
    <div class="unsupported-view">
      <div class="unsupported-icon">!</div>
      <div class="unsupported-copy">
        <p class="unsupported-title">当前页面不支持</p>
        <p class="unsupported-hint">请在 Lark 或 Meegle 页面使用</p>
      </div>
    </div>
  </UiCard>
</template>

<script setup lang="ts">
import UiCard from "../components/UiCard.vue";
</script>

<style scoped>
.unsupported-view {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  align-items: center;
}

.unsupported-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: linear-gradient(180deg, #fee2e2 0%, #fecaca 100%);
  color: #b91c1c;
  font-size: 24px;
  font-weight: 800;
}

.unsupported-copy {
  display: grid;
  gap: 4px;
}

.unsupported-title {
  margin: 0;
  color: #0f172a;
  font-size: 14px;
  font-weight: 700;
}

.unsupported-hint {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}
</style>
