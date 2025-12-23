<template>
  <div class="equipment-selector">
    <!-- Armor Selection -->
    <div class="section-divider">
      <Icon icon="mdi:shield" class="text-emerald-400" />
      <span>Доспех</span>
    </div>
    
    <ArmorCarousel
      v-model="selectedArmor"
      :wealth="wealth"
      :epoch="epoch"
    />

    <!-- Weapons Selection (no card wrapper) -->
    <div class="section-divider">
      <Icon icon="mdi:sword-cross" class="text-red-400" />
      <span>Оружие</span>
      <span class="value-badge" :class="selectedWeapons.length > 0 ? 'emerald' : 'slate'">
        {{ selectedWeapons.length }}
      </span>
    </div>
    
    <!-- Compact Filter -->
    <div class="filter-row">
      <button
        @click="weaponFilter = null"
        class="filter-chip"
        :class="{ active: weaponFilter === null }"
      >
        Все
      </button>
      <button
        v-for="(type, key) in weaponTypes"
        :key="key"
        @click="weaponFilter = key"
        class="filter-chip"
        :class="{ active: weaponFilter === key }"
      >
        <Icon :icon="type.icon" />
      </button>
      
      <!-- Availability filter toggle -->
      <button
        @click="showUnavailable = !showUnavailable"
        class="filter-chip availability-toggle"
        :class="{ active: showUnavailable }"
        :title="showUnavailable ? 'Показаны все' : 'Скрыты недоступные'"
      >
        <Icon :icon="showUnavailable ? 'mdi:eye' : 'mdi:eye-off'" />
      </button>
    </div>

    <!-- Weapons grid -->
    <WeaponSelector
      v-model="selectedWeapons"
      :wealth="wealth"
      :epoch="epoch"
      :category-filter="weaponFilter"
      :show-unavailable="showUnavailable"
    />

    <!-- Fixed Status Bar -->
    <EquipmentStatusBar
      :wealth="wealth"
      :wealth-limit="wealthLimit"
      :selected-armor="selectedArmor"
      :selected-weapons="selectedWeapons"
      :epoch="epoch"
      :validation-errors="validationErrors"
      :recommendations="recommendations"
      :is-valid="isValid"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import ArmorCarousel from './ArmorCarousel.vue'
import WeaponSelector from './WeaponSelector.vue'
import EquipmentStatusBar from './EquipmentStatusBar.vue'
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
  },
  // Лимит благосостояния, заданный мастером
  wealthLimit: {
    type: Number,
    default: 5
  }
})

const emit = defineEmits(['update:modelValue', 'validation-change'])

// Wealth и epoch теперь приходят извне (от мастера)
const wealth = ref(props.modelValue?.wealth ?? 5)
const epoch = ref(props.modelValue?.epoch ?? 10)
const selectedArmor = ref(props.modelValue?.armor ?? 'clothes')
const selectedWeapons = ref(props.modelValue?.weapons ?? [])
const weaponFilter = ref(null)
const showUnavailable = ref(false) // По умолчанию скрываем недоступное

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

// Check weapon balance (melee + ranged recommendations)
const hasMeleeWeapon = computed(() => {
  return selectedWeapons.value.some(id => {
    const item = allItems.find(i => i.id === id)
    // Melee weapon = does NOT have ranged attack (even if it has short/long too)
    // This is about player perception: bows/crossbows/slings are "ranged", everything else is "melee"
    if (!item || item.category !== 'weapon') return false
    const attack = item.attack
    if (typeof attack === 'object') {
      // If it has ranged attack - it's NOT a melee weapon (even if it can hit adjacent)
      return attack.ranged === undefined
    }
    // Legacy format - assume melee
    return true
  })
})

const hasReachWeapon = computed(() => {
  return selectedWeapons.value.some(id => {
    const item = allItems.find(i => i.id === id)
    if (!item || item.category !== 'weapon') return false
    // Reach weapon = length 2 and NOT a ranged weapon
    const attack = item.attack
    const hasRanged = typeof attack === 'object' && attack.ranged !== undefined
    return item.length === 2 && !hasRanged
  })
})

const hasRangedWeapon = computed(() => {
  return selectedWeapons.value.some(id => {
    const item = allItems.find(i => i.id === id)
    if (!item || item.category !== 'weapon') return false
    // Ranged weapon = has ranged attack (bows, crossbows, slings)
    const attack = item.attack
    return typeof attack === 'object' && attack.ranged !== undefined
  })
})

// Recommendations (yellow status)
const recommendations = computed(() => {
  const recs = []
  
  // Always recommend having melee weapon
  if (!hasMeleeWeapon.value && !hasReachWeapon.value) {
    recs.push('Рекомендуется взять хотя бы одно оружие ближнего боя')
  }
  
  // Always recommend having ranged weapon
  if (!hasRangedWeapon.value) {
    recs.push('Рекомендуется взять хотя бы одно оружие дальнего боя')
  }
  
  return recs
})

// Validation
const validationErrors = computed(() => {
  const errors = []
  
  // Check armor availability
  const armor = allItems.find(i => i.id === selectedArmor.value)
  if (armor) {
    if (armor.epoch > epoch.value) {
      errors.push(`Выбранный доспех недоступен в эту эпоху`)
    }
    if (armor.price > wealth.value + 1) {
      errors.push(`Выбранный доспех слишком дорогой`)
    }
  }
  
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
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-bottom: 5rem; /* Space for fixed status bar */
}

.section-divider {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: #94a3b8;
  padding: 0.5rem 0;
  margin-top: 0.5rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.section-divider svg {
  width: 1.125rem;
  height: 1.125rem;
}

.value-badge {
  margin-left: auto;
  padding: 0.125rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.8rem;
  font-weight: 700;
}

.value-badge.emerald { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
.value-badge.slate { background: rgba(100, 116, 139, 0.2); color: #94a3b8; }

.filter-row {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.filter-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.375rem 0.625rem;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.375rem;
  color: #94a3b8;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-chip svg {
  width: 1rem;
  height: 1rem;
}

.filter-chip:hover {
  border-color: rgba(148, 163, 184, 0.4);
}

.filter-chip.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.5);
  color: #38bdf8;
}

/* Availability toggle - different style when active (showing unavailable) */
.filter-chip.availability-toggle {
  margin-left: auto;
}

.filter-chip.availability-toggle.active {
  background: rgba(148, 163, 184, 0.15);
  border-color: rgba(148, 163, 184, 0.4);
  color: #94a3b8;
}
</style>
