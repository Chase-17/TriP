<script setup>
import { getInitials } from '@/utils/avatar'

const props = defineProps({
  avatar: {
    type: Object,
    default: null
  },
  name: {
    type: String,
    default: ''
  },
  size: {
    type: String,
    default: 'md' // xs, sm, md, lg, xl
  }
})

const sizeClasses = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-2xl'
}
</script>

<template>
  <div
    class="rounded-full flex items-center justify-center font-semibold text-white border-2 border-white/20 flex-shrink-0"
    :class="[
      avatar?.color || 'bg-slate-600',
      sizeClasses[size]
    ]"
  >
    {{ getInitials(name) }}
  </div>
</template>
