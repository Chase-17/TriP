<template>
  <div class="equipment-selector">
    <!-- Wealth & Epoch -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <!-- Wealth Selector -->
      <div class="selector-card">
        <h3 class="card-title">
          <Icon icon="mdi:gold" class="w-6 h-6 text-amber-400" />
          Уровень благосостояния
        </h3>
        
        <div class="space-y-4">
          <input
            type="range"
            min="1"
            max="10"
            v-model.number="wealth"
            class="wealth-slider"
          />
          
          <div class="value-display">
            <span class="value-number">{{ wealth }}</span>
            <span class="value-separator">-</span>
            <span class="value-name">{{ wealthName }}</span>
          </div>
          
          <p class="hint-text">
            Максимальная цена: <span class="highlight">{{ wealth }}</span>
          </p>
        </div>
      </div>

      <!-- Epoch Selector -->
      <div class="selector-card">
        <h3 class="card-title">
          <Icon icon="mdi:clock-outline" class="w-6 h-6 text-sky-400" />
          Максимальная эпоха
        </h3>
        
        <div class="space-y-4">
          <input
            type="range"
            min="1"
            max="10"
            v-model.number="epoch"
            class="epoch-slider"
          />
          
          <div class="value-display">
            <span class="value-number">{{ epoch }}</span>
            <span class="value-separator">-</span>
            <span class="value-name">{{ epochName }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Armor Selection -->
    <div class="selector-card mb-6">
      <h3 class="card-title">
        <Icon icon="mdi:shield" class="w-6 h-6 text-emerald-400" />
        Выбор доспеха
      </h3>
      <p class="card-description">
        В бой Вы сможете брать только два набора снаряжения и один доспех. Например, лук со стрелами для дальнего боя и меч с щитом для ближнего.
      </p>
      
      <ArmorCarousel
        v-model="selectedArmor"
        :wealth="wealth"
        :epoch="epoch"
      />
    </div>

    <!-- Weapons Selection -->
    <div class="selector-card">
      <h3 class="card-title">
        <Icon icon="mdi:sword-cross" class="w-6 h-6 text-red-400" />
        Выбор оружия
      </h3>
      
      <!-- Filter buttons -->
      <div class="filter-buttons">
        <button
          @click="weaponFilter = null"
          class="filter-btn"
          :class="{ active: weaponFilter === null }"
        >
          Всё
        </button>
        <button
          v-for="(type, key) in weaponTypes"
          :key="key"
          @click="weaponFilter = key"
          class="filter-btn"
          :class="{ active: weaponFilter === key }"
        >
          <Icon :icon="type.icon" class="w-4 h-4" />
          {{ type.name }}
        </button>
      </div>

      <!-- Weapons grid -->
      <WeaponSelector
        v-model="selectedWeapons"
        :wealth="wealth"
        :epoch="epoch"
        :category-filter="weaponFilter"
      />

      <!-- Selection summary -->
      <div class="selection-summary">
        <div class="summary-item">
          <span class="summary-label">Выбрано предметов:</span>
          <span class="summary-value">{{ selectedWeapons.length }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Зелёных:</span>
          <span class="summary-value green">{{ greenCount }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Жёлтых:</span>
          <span class="summary-value yellow">{{ yellowCount }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Оранжевых:</span>
          <span class="summary-value orange">{{ orangeCount }}</span>
        </div>
      </div>

      <!-- Validation warnings -->
      <div v-if="validationErrors.length > 0" class="validation-warnings">
        <div
          v-for="(error, idx) in validationErrors"
          :key="idx"
          class="warning-message"
        >
          <Icon icon="mdi:alert" class="w-5 h-5" />
          {{ error }}
        </div>
      </div>

      <!-- No weapon warning -->
      <div v-if="selectedWeapons.length === 0" class="no-weapon-warning">
        <Icon icon="mdi:alert-outline" class="w-5 h-5" />
        Вы не взяли с собой никакого оружия. Уверены, что хотите продолжить?
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import ArmorCarousel from './ArmorCarousel.vue'
import WeaponSelector from './WeaponSelector.vue'
import itemsData from '@/data/items.json'
import itemTypesData from '@/data/itemTypes.json'
import epochsData from '@/data/epochs.json'
import wealthsData from '@/data/wealths.json'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({
      armor: 'clothes',
      weapons: [],
      wealth: 5,
      epoch: 10
    })
  }
})

const emit = defineEmits(['update:modelValue', 'validation-change'])

const wealth = ref(props.modelValue?.wealth ?? 5)
const epoch = ref(props.modelValue?.epoch ?? 10)
const selectedArmor = ref(props.modelValue?.armor ?? 'clothes')
const selectedWeapons = ref(props.modelValue?.weapons ?? [])
const weaponFilter = ref(null)

const weaponTypes = itemTypesData.weaponTypes
const epochs = epochsData
const wealths = wealthsData
const allItems = itemsData.items

const wealthName = computed(() => wealths[wealth.value]?.name || '')
const epochName = computed(() => epochs[epoch.value]?.name || '')

// Watch for external changes to modelValue
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    if (newVal.wealth !== undefined) wealth.value = newVal.wealth
    if (newVal.epoch !== undefined) epoch.value = newVal.epoch
    if (newVal.armor !== undefined) selectedArmor.value = newVal.armor
    if (newVal.weapons !== undefined) selectedWeapons.value = newVal.weapons
  }
}, { deep: true })

// Count items by availability
const greenCount = computed(() => {
  return selectedWeapons.value.filter(id => {
    const item = allItems.find(i => i.id === id)
    return item && item.price < wealth.value
  }).length
})

const yellowCount = computed(() => {
  return selectedWeapons.value.filter(id => {
    const item = allItems.find(i => i.id === id)
    return item && item.price === wealth.value
  }).length
})

const orangeCount = computed(() => {
  return selectedWeapons.value.filter(id => {
    const item = allItems.find(i => i.id === id)
    return item && item.price === wealth.value + 1
  }).length
})

// Validation
const validationErrors = computed(() => {
  const errors = []
  
  // Rule 2: Max 2 yellow items
  if (yellowCount.value > 2) {
    errors.push(`Предметов "жёлтой" доступности не может быть больше двух (у вас: ${yellowCount.value})`)
  }
  
  // Rule 3: If there's an orange item, no yellow items allowed
  if (orangeCount.value > 0 && yellowCount.value > 0) {
    errors.push('Если взят предмет "оранжевой" доступности, нельзя брать "жёлтые" предметы')
  }
  
  // Rule 3: Max 1 orange item
  if (orangeCount.value > 1) {
    errors.push(`Предмет "оранжевой" доступности может быть только один (у вас: ${orangeCount.value})`)
  }
  
  return errors
})

const isValid = computed(() => {
  return validationErrors.value.length === 0
})

// Watch for changes and emit
watch([wealth, epoch, selectedArmor, selectedWeapons], () => {
  emit('update:modelValue', {
    armor: selectedArmor.value,
    weapons: selectedWeapons.value,
    wealth: wealth.value,
    epoch: epoch.value
  })
}, { deep: true })

watch(isValid, (valid) => {
  emit('validation-change', valid)
})

// Initialize validation state
emit('validation-change', isValid.value)
</script>

<style scoped>
.equipment-selector {
  padding: 1.5rem;
}

.selector-card {
  background: rgba(30, 41, 59, 0.3);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  padding: 1.5rem;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.25rem;
  font-weight: 700;
  color: #e2e8f0;
  margin-bottom: 0.75rem;
}

.card-description {
  color: #94a3b8;
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
  line-height: 1.6;
}

.wealth-slider,
.epoch-slider {
  width: 100%;
  height: 12px;
  border-radius: 0.5rem;
  -webkit-appearance: none;
  appearance: none;
  outline: none;
  cursor: pointer;
}

.wealth-slider {
  background: linear-gradient(to right, 
    #dc2626 0%, 
    #ea580c 20%, 
    #eab308 40%, 
    #22c55e 60%, 
    #3b82f6 80%, 
    #a855f7 100%
  );
}

.epoch-slider {
  background: linear-gradient(to right, 
    #78716c 0%, 
    #57534e 20%, 
    #44403c 40%, 
    #292524 60%, 
    #0c4a6e 80%, 
    #0369a1 100%
  );
}

.wealth-slider::-webkit-slider-thumb,
.epoch-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  background: #f59e0b;
  border: 3px solid #1e293b;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  transition: all 0.2s;
}

.epoch-slider::-webkit-slider-thumb {
  background: #0ea5e9;
}

.wealth-slider::-webkit-slider-thumb:hover,
.epoch-slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.value-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 0.5rem;
}

.value-number {
  font-size: 1.5rem;
  font-weight: 700;
  color: #f59e0b;
}

.value-separator {
  color: #64748b;
}

.value-name {
  font-weight: 500;
  color: #cbd5e1;
}

.hint-text {
  text-align: center;
  font-size: 0.875rem;
  color: #94a3b8;
}

.highlight {
  color: #f59e0b;
  font-weight: 600;
}

.filter-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.filter-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.5rem;
  color: #94a3b8;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-btn:hover {
  border-color: rgba(148, 163, 184, 0.4);
  background: rgba(30, 41, 59, 0.7);
}

.filter-btn.active {
  background: rgba(56, 189, 248, 0.2);
  border-color: rgba(56, 189, 248, 0.5);
  color: #38bdf8;
}

.selection-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 0.5rem;
  margin-top: 1rem;
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.summary-label {
  color: #94a3b8;
  font-size: 0.875rem;
}

.summary-value {
  font-weight: 700;
  font-size: 1.125rem;
  color: #e2e8f0;
}

.summary-value.green { color: #22c55e; }
.summary-value.yellow { color: #eab308; }
.summary-value.orange { color: #f97316; }

.validation-warnings {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.warning-message {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.5rem;
  color: #ef4444;
  font-size: 0.875rem;
}

.no-weapon-warning {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  margin-top: 1rem;
  background: rgba(234, 179, 8, 0.1);
  border: 1px solid rgba(234, 179, 8, 0.3);
  border-radius: 0.5rem;
  color: #eab308;
  font-size: 0.875rem;
}
</style>
