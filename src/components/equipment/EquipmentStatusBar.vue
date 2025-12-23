<template>
  <div class="status-bar" :class="statusClass">
    <!-- Wealth indicator -->
    <div class="wealth-row">
      <Icon icon="mdi:gold" class="wealth-icon" />
      <div class="wealth-bar">
        <div class="wealth-track">
          <!-- Available part -->
          <div 
            class="wealth-fill available" 
            :style="{ width: availableWidth + '%' }"
          ></div>
          <!-- Blocked part (above limit) -->
          <div 
            class="wealth-fill blocked" 
            :style="{ left: availableWidth + '%', width: blockedWidth + '%' }"
          ></div>
        </div>
        <div class="wealth-labels">
          <span class="wealth-current">{{ wealthLimit }}</span>
          <span class="wealth-max">/ 10</span>
        </div>
      </div>
    </div>

    <!-- Status message -->
    <div class="status-message">
      <template v-if="validationErrors.length > 0">
        <Icon icon="mdi:close-circle" class="status-icon error" />
        <span class="status-text error">{{ validationErrors[0] }}</span>
      </template>
      <template v-else-if="recommendations.length > 0">
        <Icon icon="mdi:alert-circle" class="status-icon warning" />
        <span class="status-text warning">{{ recommendations[0] }}</span>
      </template>
      <template v-else>
        <Icon icon="mdi:check-circle" class="status-icon success" />
        <span class="status-text success">Снаряжение готово</span>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

const props = defineProps({
  wealth: {
    type: Number,
    default: 5
  },
  wealthLimit: {
    type: Number,
    default: 5
  },
  selectedArmor: {
    type: String,
    default: ''
  },
  selectedWeapons: {
    type: Array,
    default: () => []
  },
  epoch: {
    type: Number,
    default: 10
  },
  validationErrors: {
    type: Array,
    default: () => []
  },
  recommendations: {
    type: Array,
    default: () => []
  },
  isValid: {
    type: Boolean,
    default: true
  }
})

// Wealth bar calculations (out of 10)
const availableWidth = computed(() => {
  return (props.wealthLimit / 10) * 100
})

const blockedWidth = computed(() => {
  return ((10 - props.wealthLimit) / 10) * 100
})

// Status class for the bar
const statusClass = computed(() => {
  if (props.validationErrors.length > 0) return 'status-error'
  if (props.recommendations.length > 0) return 'status-warning'
  return 'status-success'
})
</script>

<style scoped>
.status-bar {
  position: fixed;
  bottom: 4rem; /* Above the confirm button */
  left: 0;
  right: 0;
  z-index: 50;
  padding: 0.5rem 0.75rem;
  background: rgba(15, 23, 42, 0.95);
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.status-bar.status-error {
  border-top-color: rgba(239, 68, 68, 0.4);
}

.status-bar.status-warning {
  border-top-color: rgba(234, 179, 8, 0.4);
}

.status-bar.status-success {
  border-top-color: rgba(34, 197, 94, 0.4);
}

/* Wealth row */
.wealth-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.wealth-icon {
  width: 1rem;
  height: 1rem;
  color: #fbbf24;
  flex-shrink: 0;
}

.wealth-bar {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.wealth-track {
  flex: 1;
  height: 6px;
  background: rgba(71, 85, 105, 0.3);
  border-radius: 3px;
  position: relative;
  overflow: hidden;
}

.wealth-fill {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: 3px;
}

.wealth-fill.available {
  left: 0;
  background: linear-gradient(to right, #22c55e, #eab308);
}

.wealth-fill.blocked {
  background: rgba(71, 85, 105, 0.5);
}

.wealth-labels {
  display: flex;
  align-items: baseline;
  gap: 0.125rem;
  font-size: 0.7rem;
  flex-shrink: 0;
}

.wealth-current {
  font-weight: 700;
  color: #fbbf24;
}

.wealth-max {
  color: #64748b;
}

/* Status message */
.status-message {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.status-icon {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
}

.status-icon.error { color: #ef4444; }
.status-icon.warning { color: #eab308; }
.status-icon.success { color: #22c55e; }

.status-text {
  font-size: 0.7rem;
  line-height: 1.3;
}

.status-text.error { color: #fca5a5; }
.status-text.warning { color: #fde047; }
.status-text.success { color: #86efac; }
</style>
