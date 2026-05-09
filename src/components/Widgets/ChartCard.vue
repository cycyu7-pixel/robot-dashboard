<script setup lang="ts">
defineProps<{
  title: string
  icon?: string
}>()
</script>

<template>
  <div class="chart-card">
    <div class="card-header">
      <span v-if="icon" class="card-icon">{{ icon }}</span>
      <span class="card-title">{{ title }}</span>
    </div>
    <div class="card-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.chart-card {
  background: #16213e;
  border: 1px solid #2c3e50;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 260px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid #2c3e50;
}

.card-icon {
  font-size: 14px;
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: #ecf0f1;
}

.card-body {
  flex: 1;
  padding: 8px;
  min-height: 0;
}
</style>
