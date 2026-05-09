<script setup lang="ts">
import { useToasts } from './toast'

const { toasts, removeToast } = useToasts()
</script>

<template>
  <Teleport to="body">
    <div class="toast-stack">
      <div
        v-for="t in toasts"
        :key="t.id"
        :class="['toast-item', `toast-${t.type}`]"
        @click="removeToast(t.id)"
      >
        <span class="toast-icon">{{ { success: '✓', error: '✕', info: 'ℹ' }[t.type] }}</span>
        <span class="toast-msg">{{ t.message }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.toast-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  pointer-events: auto;
  animation: slide-in 0.3s ease-out;
  min-width: 240px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
}

.toast-success {
  background: rgba(46, 204, 113, 0.92);
  color: #fff;
}

.toast-error {
  background: rgba(231, 76, 60, 0.92);
  color: #fff;
}

.toast-info {
  background: rgba(52, 152, 219, 0.92);
  color: #fff;
}

.toast-icon {
  font-size: 16px;
  font-weight: 700;
}

.toast-msg {
  flex: 1;
}

@keyframes slide-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>
