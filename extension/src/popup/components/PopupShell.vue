<template>
  <section class="popup-shell" data-test="popup-shell">
    <header class="popup-shell__header">
      <div class="popup-shell__identity">
        <h1 class="popup-shell__title">Tenways Octo</h1>
        <p v-if="subtitle" class="popup-shell__subtitle">{{ subtitle }}</p>
      </div>
    </header>
    <div class="popup-shell__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  subtitle?: string | null;
}>();
</script>

<style scoped>
.popup-shell {
  min-height: 240px;
  padding: 12px;
}

.popup-shell__header {
  display: block;
  padding: 18px 20px;
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(37, 99, 235, 0.94), rgba(59, 130, 246, 0.88)),
    linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
  color: #eff6ff;
  box-shadow: 0 18px 36px rgba(37, 99, 235, 0.22);
}

.popup-shell__identity {
  min-width: 0;
}

.popup-shell__title {
  margin: 0;
  font-size: 11px;
  line-height: 1.2;
  font-weight: 700;
  color: rgba(239, 246, 255, 0.84);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.popup-shell__subtitle {
  margin: 8px 0 0;
  font-size: 18px;
  line-height: 1.2;
  font-weight: 600;
  color: #fff;
}

.popup-shell__body {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}
</style>
