<script setup>
import { ref, computed } from 'vue'
import itemsData from '@/data/items.json'

const props = defineProps({
  character: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['update:character'])

// Получаем все доступные предметы
const allArmors = computed(() => {
  return itemsData.items.filter(item => item.category === 'armor')
})

const allWeapons = computed(() => {
  return itemsData.items.filter(item => item.category === 'weapon' || item.category === 'shield')
})

// Текущий активный набор
const activeSetIndex = computed({
  get: () => props.character.equipment?.activeSetIndex || 0,
  set: (value) => {
    updateEquipment({ activeSetIndex: value })
  }
})

// Получаем текущий набор оружия
const currentWeaponSet = computed(() => {
  return props.character.equipment?.weaponSets?.[activeSetIndex.value] || { name: 'Набор 1', weapons: [] }
})

// Получаем данные о текущей броне
const currentArmor = computed(() => {
  const armorId = props.character.equipment?.armor || 'clothes'
  return allArmors.value.find(item => item.id === armorId)
})

// Получаем данные об оружии в текущем наборе
const currentWeapons = computed(() => {
  return currentWeaponSet.value.weapons.map(weaponId => {
    return allWeapons.value.find(item => item.id === weaponId)
  }).filter(Boolean)
})

// Валидация текущего набора
const currentSetValidation = computed(() => {
  const weapons = currentWeapons.value
  
  // Считаем общее количество рук
  const totalHands = weapons.reduce((sum, weapon) => sum + (weapon.hands || 0), 0)
  
  // Считаем количество длинного оружия (length === 2)
  const longWeaponsCount = weapons.filter(weapon => weapon.length === 2).length
  
  const errors = []
  
  if (totalHands > 2) {
    errors.push(`Сумма рук превышает 2 (текущая: ${totalHands})`)
  }
  
  if (longWeaponsCount > 1) {
    errors.push(`Нельзя держать больше одного длинного оружия (текущее: ${longWeaponsCount})`)
  }
  
  return {
    valid: errors.length === 0,
    errors,
    totalHands,
    longWeaponsCount
  }
})

// Проверка, можно ли добавить оружие в набор
const canAddWeapon = (weaponId) => {
  const weapon = allWeapons.value.find(item => item.id === weaponId)
  if (!weapon) return false
  
  const weapons = [...currentWeapons.value, weapon]
  const totalHands = weapons.reduce((sum, w) => sum + (w.hands || 0), 0)
  const longWeaponsCount = weapons.filter(w => w.length === 2).length
  
  return totalHands <= 2 && longWeaponsCount <= 1
}

// Инвентарь оружия (не в руках) - доступное для персонажа
const inventoryWeapons = computed(() => {
  const wealth = props.character.equipment?.wealth || 0
  const epoch = props.character.equipment?.epoch || 0
  
  // Получаем все ID оружия в инвентаре персонажа
  const inventoryIds = props.character.inventory?.map(item => {
    if (typeof item === 'string') return item
    return item.id
  }) || []
  
  // Получаем все ID оружия, экипированного во всех наборах
  const equippedWeaponIds = props.character.equipment?.weaponSets?.flatMap(set => set.weapons) || []
  
  // Объединяем все оружие и щиты персонажа (и экипированные, и в инвентаре)
  const allCharacterWeaponIds = [...new Set([...equippedWeaponIds, ...inventoryIds])]
  
  // Фильтруем только оружие и щиты из списка предметов персонажа
  const characterWeapons = allWeapons.value.filter(weapon => 
    allCharacterWeaponIds.includes(weapon.id)
  )
  
  // Также добавляем доступные по wealth и epoch предметы (для тестирования)
  const availableWeapons = allWeapons.value.filter(weapon => {
    // Если уже есть у персонажа - не добавляем
    if (allCharacterWeaponIds.includes(weapon.id)) return false
    
    // Проверяем доступность по wealth и epoch
    const isAffordable = (weapon.wealth || weapon.price || 0) <= wealth
    const isEpochSuitable = (weapon.epoch || 0) <= epoch
    
    return isAffordable && isEpochSuitable
  })
  
  return [...characterWeapons, ...availableWeapons]
})

// Функция обновления экипировки
const updateEquipment = (updates) => {
  const updatedCharacter = {
    ...props.character,
    equipment: {
      ...props.character.equipment,
      ...updates
    }
  }
  emit('update:character', updatedCharacter)
}

// Сменить броню
const equipArmor = (armorId) => {
  updateEquipment({ armor: armorId })
}

// Добавить оружие в текущий набор
const equipWeapon = (weaponId) => {
  if (!canAddWeapon(weaponId)) {
    return // Не добавляем, если нарушает правила
  }
  
  const sets = [...(props.character.equipment?.weaponSets || [])]
  const currentSet = { ...sets[activeSetIndex.value] }
  
  if (!currentSet.weapons.includes(weaponId)) {
    currentSet.weapons = [...currentSet.weapons, weaponId]
    sets[activeSetIndex.value] = currentSet
    updateEquipment({ weaponSets: sets })
  }
}

// Убрать оружие из текущего набора
const unequipWeapon = (weaponId) => {
  const sets = [...(props.character.equipment?.weaponSets || [])]
  const currentSet = { ...sets[activeSetIndex.value] }
  
  currentSet.weapons = currentSet.weapons.filter(id => id !== weaponId)
  sets[activeSetIndex.value] = currentSet
  updateEquipment({ weaponSets: sets })
}

// Добавить новый набор оружия
const addWeaponSet = () => {
  const sets = [...(props.character.equipment?.weaponSets || [])]
  const newSetNumber = sets.length + 1
  sets.push({
    name: `Набор ${newSetNumber}`,
    weapons: []
  })
  updateEquipment({ weaponSets: sets })
}

// Модальное окно для выбора предметов
const showArmorModal = ref(false)
const showWeaponModal = ref(false)
</script>

<template>
  <div class="equipment-manager">
    <!-- Выбор активного набора оружия -->
    <div class="weapon-sets-selector bg-slate-900/60 border border-white/10 rounded-2xl p-4 mb-4">
      <h3 class="text-sm font-bold text-slate-400 uppercase mb-3">Активный набор</h3>
      <div class="flex gap-2 flex-wrap">
        <button
          v-for="(set, index) in character.equipment?.weaponSets || []"
          :key="index"
          @click="activeSetIndex = index"
          :class="[
            'flex-1 min-w-[120px] px-4 py-2 rounded-lg font-semibold transition-all',
            activeSetIndex === index
              ? 'bg-amber-500/20 border-2 border-amber-400 text-amber-100'
              : 'bg-slate-800/40 border border-slate-700 text-slate-400 hover:bg-slate-800/60'
          ]"
        >
          {{ set.name }}
        </button>
        <button
          @click="addWeaponSet"
          class="px-4 py-2 rounded-lg border border-dashed border-slate-600 text-slate-500 hover:border-amber-500 hover:text-amber-400 transition-all"
          title="Добавить набор (требуется особая способность)"
        >
          + Новый набор
        </button>
      </div>
    </div>

    <!-- Текущая броня -->
    <div class="armor-section bg-slate-900/60 border border-white/10 rounded-2xl p-4 mb-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-bold text-slate-400 uppercase flex items-center gap-2">
          <span>🛡️</span>
          Броня
        </h3>
        <button
          @click="showArmorModal = true"
          class="px-3 py-1 text-xs rounded-lg bg-sky-500/20 border border-sky-400/60 text-sky-100 hover:bg-sky-500/30 transition"
        >
          Сменить
        </button>
      </div>
      
      <div v-if="currentArmor" class="p-3 bg-slate-950/40 rounded-lg border border-slate-700">
        <h4 class="font-bold text-white mb-1">{{ currentArmor.name }}</h4>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div class="flex items-center justify-between p-2 bg-slate-900/60 rounded">
            <span class="text-slate-400">Защита</span>
            <span class="text-emerald-400 font-bold">{{ currentArmor.defence }}</span>
          </div>
          <div class="flex items-center justify-between p-2 bg-slate-900/60 rounded">
            <span class="text-slate-400">Резист</span>
            <span class="text-blue-400 font-bold">{{ currentArmor.resist }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Текущее оружие -->
    <div class="weapons-section bg-slate-900/60 border border-white/10 rounded-2xl p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-bold text-slate-400 uppercase flex items-center gap-2">
          <span>⚔️</span>
          Оружие ({{ currentWeaponSet.name }})
        </h3>
        <button
          @click="showWeaponModal = true"
          class="px-3 py-1 text-xs rounded-lg bg-amber-500/20 border border-amber-400/60 text-amber-100 hover:bg-amber-500/30 transition"
        >
          Выбрать
        </button>
      </div>
      
      <!-- Индикатор загруженности рук -->
      <div class="mb-3 p-2 rounded-lg" :class="currentSetValidation.valid ? 'bg-slate-950/40 border border-slate-700' : 'bg-red-900/20 border border-red-700'">
        <div class="flex items-center justify-between text-xs mb-1">
          <span class="text-slate-400">Занято рук:</span>
          <span :class="currentSetValidation.totalHands > 2 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'">
            {{ currentSetValidation.totalHands }} / 2
          </span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-slate-400">Длинное оружие:</span>
          <span :class="currentSetValidation.longWeaponsCount > 1 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'">
            {{ currentSetValidation.longWeaponsCount }} / 1
          </span>
        </div>
      </div>
      
      <!-- Ошибки валидации -->
      <div v-if="!currentSetValidation.valid" class="mb-3 p-2 rounded-lg bg-red-900/20 border border-red-700">
        <p v-for="(error, index) in currentSetValidation.errors" :key="index" class="text-xs text-red-300">
          ⚠️ {{ error }}
        </p>
      </div>
      
      <div v-if="currentWeapons.length" class="space-y-2">
        <div
          v-for="weapon in currentWeapons"
          :key="weapon.id"
          class="p-3 bg-slate-950/40 rounded-lg border border-slate-700 flex items-center justify-between"
        >
          <div class="flex-1">
            <h4 class="font-bold text-white text-sm">{{ weapon.name }}</h4>
            <div class="text-xs text-slate-400">
              <span v-if="weapon.attack !== undefined">Атака: {{ weapon.attack }}</span>
              <span v-if="weapon.attack !== undefined && typeof weapon.defence !== 'object'"> • </span>
              <span v-if="typeof weapon.defence !== 'object'">Защита: {{ weapon.defence || 0 }}</span>
              <div v-if="typeof weapon.defence === 'object'" class="mt-1 text-[10px]">
                🛡️ Защита (удар/снаряд):
                <span v-if="weapon.defence.front"> спереди {{ weapon.defence.front.melee }}/{{ weapon.defence.front.ranged }}</span>
                <span v-if="weapon.defence.side">, фланг {{ weapon.defence.side.melee }}/{{ weapon.defence.side.ranged }}</span>
                <span v-if="weapon.defence.back">, сзади {{ weapon.defence.back.melee }}/{{ weapon.defence.back.ranged }}</span>
              </div>
            </div>
          </div>
          <button
            @click="unequipWeapon(weapon.id)"
            class="ml-2 px-2 py-1 text-xs rounded bg-red-500/20 border border-red-400/40 text-red-300 hover:bg-red-500/30"
          >
            Убрать
          </button>
        </div>
      </div>
      <p v-else class="text-slate-500 text-sm text-center py-4">
        Оружие не выбрано
      </p>
    </div>

    <!-- Модальное окно выбора брони -->
    <Teleport to="body">
      <div
        v-if="showArmorModal"
        class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
        @click.self="showArmorModal = false"
      >
        <div class="bg-slate-900 rounded-2xl border border-white/10 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
          <div class="sticky top-0 bg-slate-900 border-b border-white/10 p-4 flex items-center justify-between">
            <h2 class="text-xl font-bold">Выбрать броню</h2>
            <button
              @click="showArmorModal = false"
              class="w-8 h-8 rounded-lg hover:bg-white/10 transition"
            >
              ✕
            </button>
          </div>
          
          <div class="p-4 space-y-2">
            <button
              v-for="armor in allArmors"
              :key="armor.id"
              @click="equipArmor(armor.id); showArmorModal = false"
              :class="[
                'w-full p-4 rounded-lg border transition text-left',
                currentArmor?.id === armor.id
                  ? 'bg-sky-500/20 border-sky-400'
                  : 'bg-slate-950/40 border-slate-700 hover:bg-slate-800/40'
              ]"
            >
              <h3 class="font-bold text-white mb-1">{{ armor.name }}</h3>
              <p class="text-xs text-slate-400 mb-2">{{ armor.desc }}</p>
              <div class="grid grid-cols-4 gap-2 text-xs">
                <div class="text-center">
                  <div class="text-slate-500">Защита</div>
                  <div class="text-emerald-400 font-bold">{{ armor.defence }}</div>
                </div>
                <div class="text-center">
                  <div class="text-slate-500">Резист</div>
                  <div class="text-blue-400 font-bold">{{ armor.resist }}</div>
                </div>
                <div class="text-center">
                  <div class="text-slate-500">Движение</div>
                  <div :class="armor.movement >= 0 ? 'text-green-400' : 'text-red-400'" class="font-bold">
                    {{ armor.movement >= 0 ? '+' : '' }}{{ armor.movement }}
                  </div>
                </div>
                <div class="text-center">
                  <div class="text-slate-500">Порывы</div>
                  <div :class="armor.bursts >= 0 ? 'text-green-400' : 'text-red-400'" class="font-bold">
                    {{ armor.bursts >= 0 ? '+' : '' }}{{ armor.bursts }}
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Модальное окно выбора оружия -->
    <Teleport to="body">
      <div
        v-if="showWeaponModal"
        class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
        @click.self="showWeaponModal = false"
      >
        <div class="bg-slate-900 rounded-2xl border border-white/10 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
          <div class="sticky top-0 bg-slate-900 border-b border-white/10 p-4 flex items-center justify-between">
            <h2 class="text-xl font-bold">Выбрать оружие ({{ currentWeaponSet.name }})</h2>
            <button
              @click="showWeaponModal = false"
              class="w-8 h-8 rounded-lg hover:bg-white/10 transition"
            >
              ✕
            </button>
          </div>
          
          <div class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              v-for="weapon in inventoryWeapons"
              :key="weapon.id"
              @click="currentWeaponSet.weapons.includes(weapon.id) ? unequipWeapon(weapon.id) : equipWeapon(weapon.id)"
              :disabled="!currentWeaponSet.weapons.includes(weapon.id) && !canAddWeapon(weapon.id)"
              :class="[
                'p-4 rounded-lg border transition text-left',
                currentWeaponSet.weapons.includes(weapon.id)
                  ? 'bg-amber-500/20 border-amber-400'
                  : canAddWeapon(weapon.id)
                    ? 'bg-slate-950/40 border-slate-700 hover:bg-slate-800/40'
                    : 'bg-slate-950/20 border-slate-800 opacity-50 cursor-not-allowed'
              ]"
            >
              <div class="flex items-start justify-between mb-1">
                <h3 class="font-bold text-white">{{ weapon.name }}</h3>
                <div v-if="!currentWeaponSet.weapons.includes(weapon.id) && !canAddWeapon(weapon.id)" class="text-red-400 text-xs">
                  ⚠️
                </div>
              </div>
              <p class="text-xs text-slate-400 mb-2 line-clamp-2">{{ weapon.desc }}</p>
              <div class="grid grid-cols-4 gap-2 text-xs">
                <div v-if="weapon.attack !== undefined" class="text-center">
                  <div class="text-slate-500">Атака</div>
                  <div class="text-red-400 font-bold">{{ weapon.attack }}</div>
                </div>
                <div v-if="typeof weapon.defence !== 'object'" class="text-center">
                  <div class="text-slate-500">Защита</div>
                  <div class="text-emerald-400 font-bold">{{ weapon.defence || 0 }}</div>
                </div>
                
                <!-- Для щитов с направленной защитой -->
                <template v-if="typeof weapon.defence === 'object'">
                  <div class="col-span-4 p-2 bg-slate-900/60 rounded">
                    <div class="text-emerald-400 font-semibold text-center mb-1 text-[10px]">🛡️ Защита (удар/снаряд)</div>
                    <div class="space-y-1 text-[9px]">
                      <div v-if="weapon.defence.front" class="flex justify-between">
                        <span class="text-slate-500">Спереди:</span>
                        <span>
                          <span class="text-emerald-400 font-bold">{{ weapon.defence.front.melee || 0 }}</span> / 
                          <span class="text-sky-400 font-bold">{{ weapon.defence.front.ranged || 0 }}</span>
                        </span>
                      </div>
                      <div v-if="weapon.defence.side" class="flex justify-between">
                        <span class="text-slate-500">С фланга:</span>
                        <span>
                          <span class="text-emerald-400 font-bold">{{ weapon.defence.side.melee || 0 }}</span> / 
                          <span class="text-sky-400 font-bold">{{ weapon.defence.side.ranged || 0 }}</span>
                        </span>
                      </div>
                      <div v-if="weapon.defence.back" class="flex justify-between">
                        <span class="text-slate-500">Сзади:</span>
                        <span>
                          <span class="text-emerald-400 font-bold">{{ weapon.defence.back.melee || 0 }}</span> / 
                          <span class="text-sky-400 font-bold">{{ weapon.defence.back.ranged || 0 }}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </template>
                
                <div v-if="weapon.length !== undefined" class="text-center">
                  <div class="text-slate-500">Длина</div>
                  <div class="text-cyan-400 font-bold">{{ weapon.length }}</div>
                </div>
                <div v-if="weapon.hands !== undefined" class="text-center">
                  <div class="text-slate-500">Руки</div>
                  <div class="text-purple-400 font-bold">{{ weapon.hands }}</div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
