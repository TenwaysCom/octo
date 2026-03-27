<template>
  <a-card size="small">
    <a-empty description="当前页面不支持">
      <template #image>
        <div class="unsupported-icon">🚫</div>
      </template>
      <p class="unsupported-hint">请在 Lark 或 Meegle 页面使用</p>
    </a-empty>
  </a-card>
</template>

<style scoped>
.unsupported-icon {
  font-size: 40px;
}

.unsupported-hint {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}
</style>
