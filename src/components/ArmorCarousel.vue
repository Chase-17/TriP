<template>
  <div class="armor-carousel">
    <!-- Navigation buttons -->
    <button
      @click="previousArmor"
      class="nav-button left"
      :disabled="currentIndex === 0"
    >
      <Icon icon="mdi:chevron-left" class="w-6 h-6" />
    </button>

    <!-- Current armor display -->
    <div class="armor-display">
      <div class="armor-header">
        <h3 class="text-2xl font-bold text-slate-100">{{ currentArmor.name }}</h3>
        <div 
          class="availability-badge"
          :class="getAvailabilityClass(currentArmor)"
        >
          {{ getAvailabilityText(currentArmor) }}
        </div>
      </div>

      <!-- Armor image -->
      <div class="armor-image-container">
        <img
          :src="itemImageUrl(currentArmor.id)"
          :alt="currentArmor.name"
          class="armor-image"
          @error="(e) => e.target.style.display = 'none'"
        />
      </div>

      <!-- Stats grid -->
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-label">
            <Icon icon="mdi:shield" class="w-5 h-5" />
            Защита
          </div>
          <div class="stat-value">{{ currentArmor.defence }}</div>
        </div>

        <div class="stat-item">
          <div class="stat-label">
            <Icon icon="mdi:shield-check" class="w-5 h-5" />
            Снижение
          </div>
          <div class="stat-value">{{ currentArmor.resist }}</div>
        </div>

        <div class="stat-item">
          <div class="stat-label">
            <Icon icon="mdi:run-fast" class="w-5 h-5" />
            Скорость
          </div>
          <div class="stat-value" :class="currentArmor.movement < 0 ? 'text-red-400' : 'text-slate-300'">
            {{ currentArmor.movement }}
          </div>
        </div>

        <div class="stat-item">
          <div class="stat-label">
            <Icon icon="mdi:lightning-bolt" class="w-5 h-5" />
            Порывы
          </div>
          <div class="stat-value" :class="currentArmor.bursts < 0 ? 'text-red-400' : 'text-slate-300'">
            {{ currentArmor.bursts }}
          </div>
        </div>
      </div>

      <!-- Price and epoch -->
      <div class="price-epoch-row">
        <div class="price-box">
          <Icon icon="mdi:gold" class="w-5 h-5" />
          <span class="label">Цена</span>
          <span class="value">{{ currentArmor.price }}</span>
        </div>
        <div class="epoch-box">
          <Icon icon="mdi:clock-outline" class="w-5 h-5" />
          <span class="label">Эпоха</span>
          <span class="value">{{ epochs[currentArmor.epoch]?.name }}</span>
        </div>
      </div>

      <!-- Description -->
      <div class="armor-description">
        {{ currentArmor.desc }}
      </div>

      <!-- Availability warning -->
      <div v-if="!canAfford(currentArmor)" class="availability-warning">
        <Icon icon="mdi:alert" class="w-5 h-5" />
        <span>Цена для Вас: <strong>{{ getAvailabilityText(currentArmor) }}</strong></span>
        <Icon icon="mdi:content-copy" class="w-4 h-4 ml-auto" />
      </div>
    </div>

    <!-- Navigation button -->
    <button
      @click="nextArmor"
      class="nav-button right"
      :disabled="currentIndex === armors.length - 1"
    >
      <Icon icon="mdi:chevron-right" class="w-6 h-6" />
    </button>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import itemsData from '@/data/items.json'
import epochsData from '@/data/epochs.json'
import { itemImageUrl } from '@/utils/assets'

const props = defineProps({
  modelValue: {
    type: String,
    default: 'clothes' // Default to basic clothes
  },
  wealth: {
    type: Number,
    default: 5
  },
  epoch: {
    type: Number,
    default: 10
  }
})

const emit = defineEmits(['update:modelValue'])

const epochs = epochsData
const armors = itemsData.items.filter(item => item.category === 'armor')

// Find index of currently selected armor
const currentIndex = ref(armors.findIndex(a => a.id === props.modelValue))

// Watch for external changes
watch(() => props.modelValue, (newVal) => {
  const index = armors.findIndex(a => a.id === newVal)
  if (index !== -1) {
    currentIndex.value = index
  }
})

const currentArmor = computed(() => armors[currentIndex.value])

const previousArmor = () => {
  if (currentIndex.value > 0) {
    currentIndex.value--
    emit('update:modelValue', currentArmor.value.id)
  }
}

const nextArmor = () => {
  if (currentIndex.value < armors.length - 1) {
    currentIndex.value++
    emit('update:modelValue', currentArmor.value.id)
  }
}

const canAfford = (armor) => {
  return armor.price <= props.wealth
}

const getAvailabilityClass = (armor) => {
  const diff = armor.price - props.wealth
  if (diff < 0) return 'availability-green'
  if (diff === 0) return 'availability-yellow'
  if (diff === 1) return 'availability-orange'
  return 'availability-red'
}

const getAvailabilityText = (armor) => {
  const diff = armor.price - props.wealth
  if (diff < 0) return 'Незначительная'
  if (diff === 0) return 'Значительная'
  if (diff === 1) return 'Огромная'
  return 'Запредельная'
}
</script>

<style scoped>
.armor-carousel {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 0;
}

.nav-button {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(51, 65, 85, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.5rem;
  color: #cbd5e1;
  transition: all 0.2s;
  cursor: pointer;
}

.nav-button:hover:not(:disabled) {
  background: rgba(51, 65, 85, 0.8);
  border-color: rgba(148, 163, 184, 0.4);
}

.nav-button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.armor-display {
  flex: 1;
  background: rgba(30, 41, 59, 0.3);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  padding: 1.5rem;
}

.armor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.availability-badge {
  padding: 0.375rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  border: 1px solid;
}

.availability-green {
  background: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.3);
  color: #22c55e;
}

.availability-yellow {
  background: rgba(234, 179, 8, 0.1);
  border-color: rgba(234, 179, 8, 0.3);
  color: #eab308;
}

.availability-orange {
  background: rgba(249, 115, 22, 0.1);
  border-color: rgba(249, 115, 22, 0.3);
  color: #f97316;
}

.availability-red {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.armor-image-container {
  width: 100%;
  max-width: 300px;
  aspect-ratio: 1;
  margin: 0 auto 1.5rem;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.armor-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-item {
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 0.5rem;
  padding: 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #94a3b8;
  font-size: 0.875rem;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #e2e8f0;
}

.price-epoch-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.price-box,
.epoch-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 0.5rem;
  color: #94a3b8;
  font-size: 0.875rem;
}

.price-box .value,
.epoch-box .value {
  margin-left: auto;
  font-weight: 600;
  color: #e2e8f0;
}

.armor-description {
  padding: 1rem;
  background: rgba(15, 23, 42, 0.3);
  border-left: 3px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.375rem;
  color: #cbd5e1;
  font-size: 0.875rem;
  line-height: 1.6;
  font-style: italic;
  margin-bottom: 1rem;
}

.availability-warning {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 0.5rem;
  color: #60a5fa;
  font-size: 0.875rem;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .price-epoch-row {
    flex-direction: column;
  }
}
</style>
