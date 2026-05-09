import { ref } from 'vue'

export interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

const toasts = ref<ToastItem[]>([])
let nextId = 1

export function showToast(message: string, type: ToastItem['type'] = 'info', duration = 4000) {
  const id = nextId++
  toasts.value.push({ id, message, type })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, duration)
}

export function removeToast(id: number) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}

export function useToasts() {
  return { toasts, removeToast }
}
