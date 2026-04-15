<template>
  <section class="popup-shell" data-test="popup-shell">
    <div class="popup-shell__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
</script>

<style scoped>
.popup-shell {
  min-height: 0;
}

.popup-shell__body {
  display: grid;
  gap: 12px;
}
</style>
