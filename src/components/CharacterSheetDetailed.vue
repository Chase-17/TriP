<script setup>
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import aspectsData from '@/data/aspects.json'
import diffsData from '@/data/diffs.json'
import itemsData from '@/data/items.json'
import EquipmentManager from './EquipmentManager.vue'
import InventoryPanel from './InventoryPanel.vue'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

const props = defineProps({
  character: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close'])

// Обновление персонажа
const updateCharacter = (updatedChar) => {
  userStore.updateCharacter(updatedChar)
}

// Экипировка предмета из инвентаря
const handleEquipItem = (item) => {
  // Открываем модальное окно выбора набора для оружия/щита
  // Для брони - сразу экипируем
  if (item.category === 'armor') {
    const updatedCharacter = {
      ...props.character,
      equipment: {
        ...props.character.equipment,
        armor: item.id
      }
    }
    updateCharacter(updatedCharacter)
  } else if (item.category === 'weapon' || item.category === 'shield') {
    // Добавляем в первый набор, если есть место
    const sets = [...(props.character.equipment?.weaponSets || [])]
    const firstSet = { ...sets[0] }
    
    // Проверяем валидацию
    const weapons = firstSet.weapons.map(weaponId => {
      return itemsData.items.find(i => i.id === weaponId)
    }).filter(Boolean)
    
    weapons.push(item)
    const totalHands = weapons.reduce((sum, w) => sum + (w.hands || 0), 0)
    const longWeaponsCount = weapons.filter(w => w.length === 2).length
    
    if (totalHands <= 2 && longWeaponsCount <= 1) {
      firstSet.weapons = [...firstSet.weapons, item.id]
      sets[0] = firstSet
      
      const updatedCharacter = {
        ...props.character,
        equipment: {
          ...props.character.equipment,
          weaponSets: sets
        }
      }
      updateCharacter(updatedCharacter)
    } else {
      alert('Невозможно экипировать: превышено ограничение по рукам или длинному оружию в Наборе 1')
    }
  }
}

// Удаление персонажа с подтверждением
const deleteCharacter = () => {
  if (confirm(`Вы уверены, что хотите удалить персонажа "${props.character.name}"? Это действие нельзя отменить.`)) {
    userStore.deleteCharacter(props.character.id)
    emit('close')
  }
}

// Маппинг аспектов по ID для быстрого доступа
const aspectsMap = computed(() => {
  const map = {}
  aspectsData.aspects.forEach(aspect => {
    map[aspect.id] = aspect
  })
  return map
})

// Получаем данные об экипировке
const armorData = computed(() => {
  if (!props.character.equipment?.armor) return null
  return itemsData.items.find(item => item.id === props.character.equipment.armor)
})

// Получаем данные об оружии в активном наборе
const activeWeaponsData = computed(() => {
  const activeSetIndex = props.character.equipment?.activeSetIndex || 0
  const activeSet = props.character.equipment?.weaponSets?.[activeSetIndex]
  
  if (!activeSet?.weapons?.length) return []
  
  return activeSet.weapons.map(weaponId => {
    return itemsData.items.find(item => item.id === weaponId)
  }).filter(Boolean)
})

// Получаем бонус коварства (характеристика shadow)
const cunningBonus = computed(() => {
  return props.character.stats?.shadow || 0
})

// Находим ближайшую сложность для значения защиты
const findDifficulty = (value) => {
  const diffs = Object.entries(diffsData.default || diffsData)
    .map(([val, data]) => ({ value: parseInt(val), ...data }))
    .filter(d => d.value >= 0)
    .sort((a, b) => a.value - b.value)
  
  // Находим ближайшую сложность снизу
  let closest = diffs[0]
  for (const diff of diffs) {
    if (diff.value <= value) {
      closest = diff
    } else {
      break
    }
  }
  return closest
}

// Получаем цвет для сложности
const getDifficultyColor = (value) => {
  if (value <= 6) return 'rgb(56 189 248)'   // sky-400
  if (value <= 15) return 'rgb(163 230 53)'  // lime-400
  if (value <= 24) return 'rgb(250 204 21)'  // yellow-400
  if (value <= 33) return 'rgb(251 146 60)'  // orange-400
  return 'rgb(248 113 113)'                  // red-400
}

// Получаем бонус защиты от щитов и оружия
const getWeaponDefenceBonus = (direction, attackType) => {
  let bonus = 0
  
  for (const weapon of activeWeaponsData.value) {
    if (typeof weapon.defence === 'object') {
      // Щит с направленной защитой
      const directionKey = direction === 'front' ? 'front' : direction === 'flank' ? 'side' : 'back'
      const attackKey = attackType === 'melee' ? 'melee' : 'ranged'
      
      if (weapon.defence[directionKey]?.[attackKey]) {
        bonus += weapon.defence[directionKey][attackKey]
      }
    } else if (typeof weapon.defence === 'number') {
      // Обычное оружие с простой защитой
      bonus += weapon.defence
    }
  }
  
  return bonus
}

// Вычисляем защиту для каждой комбинации направление/тип атаки
const getDefence = (direction, attackType) => {
  const armorDefence = armorData.value?.defence || 0
  const halfCunning = Math.floor(cunningBonus.value / 2)
  
  // Бонус от оружия и щитов
  const weaponBonus = getWeaponDefenceBonus(direction, attackType)
  
  let baseDefence = 0
  let cunningMod = 0
  
  if (direction === 'front') {
    baseDefence = 6
    cunningMod = cunningBonus.value
  } else if (direction === 'flank') {
    baseDefence = 3
    cunningMod = halfCunning
  } else if (direction === 'back') {
    baseDefence = 0
    cunningMod = halfCunning
  }
  
  const totalDefence = baseDefence + cunningMod + armorDefence + weaponBonus
  const difficulty = findDifficulty(totalDefence)
  
  return {
    name: difficulty.name,
    value: totalDefence,
    color: getDifficultyColor(totalDefence)
  }
}

// Базовая скорость (4) минус штраф от брони
const speed = computed(() => {
  const base = 4
  const armorPenalty = armorData.value?.movement || 0
  return base + armorPenalty // movement обычно отрицательный или 0
})

// Резист от брони
const resist = computed(() => {
  return armorData.value?.resist || 0
})

// Количество порывов (базовое + от брони)
const bursts = computed(() => {
  const base = 2
  const armorBonus = armorData.value?.bursts || 0
  return base + armorBonus
})

// Уровень персонажа (пока всегда 0)
const level = computed(() => {
  return props.character.level || 0
})

// Сложности проверок по возрастанию
const difficulties = computed(() => {
  return Object.entries(diffsData.default || diffsData)
    .map(([value, data]) => ({
      value: parseInt(value),
      ...data
    }))
    .filter(d => d.value >= 0)
    .sort((a, b) => a.value - b.value)
})

// Список типов проверок (6 аспектов)
const checkTypes = computed(() => {
  return aspectsData.metadata.circularOrder.map(aspectId => {
    const aspect = aspectsMap.value[aspectId]
    
    return {
      id: aspectId,
      name: aspect.check.name,
      icon: aspect.checkIcon || 'game-icons:dice-twenty-faces-twenty',
      color: aspect.color
    }
  })
})

// Вычисляем бонус к проверке для каждого типа
const getCheckBonus = (aspectId) => {
  const stats = props.character.stats || {}
  const skills = props.character.skills || {}
  
  // Базовое значение характеристики
  const statValue = stats[aspectId] || 0
  
  // Бонусы от навыков (если навык связан с этим аспектом)
  let skillBonus = 0
  
  // Проверяем навыки класса
  if (skills.fromClass && Array.isArray(skills.fromClass)) {
    skills.fromClass.forEach(skill => {
      // Навык может давать бонус +3 к своему аспекту
      if (skill.aspect === aspectId) {
        skillBonus += 3
      }
    })
  }
  
  // Проверяем навыки от подрасы (аспект 1)
  if (skills.fromAspect1 && Array.isArray(skills.fromAspect1)) {
    skills.fromAspect1.forEach(skill => {
      if (skill.aspect === aspectId) {
        skillBonus += 3
      }
    })
  }
  
  // Проверяем навыки от подрасы (аспект 2)
  if (skills.fromAspect2 && Array.isArray(skills.fromAspect2)) {
    skills.fromAspect2.forEach(skill => {
      if (skill.aspect === aspectId) {
        skillBonus += 3
      }
    })
  }
  
  return statValue + skillBonus
}

// Определяем, что показывать в ячейке для конкретной проверки и сложности
const getCellContent = (aspectId, difficulty) => {
  const bonus = getCheckBonus(aspectId)
  const diff = difficulty.value
  
  // Автоуспех: бонус >= сложности
  if (bonus >= diff) {
    return { type: 'success', value: '✓' }
  }
  
  // Нужен бросок: сложность - бонус <= 12 (максимум d12)
  // Но помним, что минимум на d12 всегда 1, поэтому если нужно выкинуть 1 - это автоуспех
  const needed = diff - bonus
  if (needed <= 1) {
    return { type: 'success', value: '✓' }
  }
  if (needed <= 12) {
    return { type: 'roll', value: needed }
  }
  
  // Автопровал: даже с максимальным броском (12) не дотянуть
  return { type: 'fail', value: '✗' }
}

// Получаем цвет границы для столбца сложности
const getDifficultyBorderColor = (difficulty) => {
  const value = difficulty.value
  if (value <= 6) return 'border-l-sky-400'
  if (value <= 15) return 'border-l-lime-400'
  if (value <= 24) return 'border-l-yellow-400'
  if (value <= 33) return 'border-l-orange-400'
  return 'border-l-red-400'
}

// Получаем тип границы (solid/dashed/double)
const getDifficultyBorderStyle = (difficulty) => {
  const short = difficulty.short
  if (short.startsWith('Н')) return 'border-l-2 !border-l-dashed' // "Ниже" - dashed
  if (short.startsWith('В')) return 'border-l-[3px]' // "Выше" - толстая
  return 'border-l-2 !border-l-solid' // Базовые - обычная одинарная
}
</script>

<template>
  <div class="character-sheet-detailed bg-slate-950 text-slate-50 min-h-full">
    <div class="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
    
    <!-- Кнопка удаления -->
    <div class="flex items-center justify-end gap-4 mb-4">
      <button
        @click="deleteCharacter"
        class="px-4 py-2 rounded-lg bg-red-900/40 border border-red-700/50 text-red-300 hover:bg-red-900/60 transition flex items-center gap-2"
      >
        <span>🗑️</span>
        <span>Удалить персонажа</span>
      </button>
    </div>
    
    <!-- Заголовок с портретом и основными параметрами -->
    <div class="header-section bg-slate-900/60 border border-white/10 rounded-2xl p-4 sm:p-6">
      <div class="flex items-start gap-4 sm:gap-6">
        <!-- Портрет -->
        <div class="character-avatar flex-shrink-0 self-start">
          <img 
            v-if="character.portrait" 
            :src="`/images/presets/${character.portrait}.png`"
            :alt="character.name"
            class="w-24 h-24 sm:w-32 sm:h-32 rounded-xl border-2 border-slate-700 object-cover bg-slate-800"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"
          />
          <div 
            :class="['w-24 h-24 sm:w-32 sm:h-32 rounded-xl border-2 border-slate-700 bg-slate-800 items-center justify-center text-4xl', character.portrait ? 'hidden' : 'flex']"
          >
            👤
          </div>
        </div>
        
        <!-- Имя и класс -->
        <div class="flex-1 min-w-0 w-full sm:w-auto">
          <h1 class="text-2xl sm:text-3xl font-bold mb-2 break-words">{{ character.name }}</h1>
          <p class="text-slate-400 text-base sm:text-lg mb-4 break-words">{{ character.class || 'Класс не указан' }}</p>
          
          <!-- Основные параметры: броня, скорость, порывы, уровень -->
          <div class="grid grid-cols-2 gap-2 sm:gap-3">
            <!-- Броня (резист) -->
            <div class="stat-badge bg-blue-900/40 border border-blue-700/50 px-2 py-2 sm:px-3 rounded-lg flex items-center gap-1 sm:gap-2 min-w-0">
              <span class="text-lg sm:text-xl flex-shrink-0">🛡️</span>
              <div class="min-w-0 flex-1">
                <div class="text-[10px] sm:text-xs text-blue-300 uppercase truncate">Броня</div>
                <div class="text-base sm:text-lg font-bold">{{ resist }}</div>
              </div>
            </div>
            
            <!-- Скорость -->
            <div class="stat-badge bg-cyan-900/40 border border-cyan-700/50 px-2 py-2 sm:px-3 rounded-lg flex items-center gap-1 sm:gap-2 min-w-0">
              <span class="text-lg sm:text-xl flex-shrink-0">⬡</span>
              <div class="min-w-0 flex-1">
                <div class="text-[10px] sm:text-xs text-cyan-300 uppercase truncate">Скорость</div>
                <div class="text-base sm:text-lg font-bold">{{ speed }}</div>
              </div>
            </div>
            
            <!-- Порывы -->
            <div class="stat-badge bg-amber-900/40 border border-amber-700/50 px-2 py-2 sm:px-3 rounded-lg flex items-center gap-1 sm:gap-2 min-w-0">
              <span class="text-lg sm:text-xl flex-shrink-0">⚡</span>
              <div class="min-w-0 flex-1">
                <div class="text-[10px] sm:text-xs text-amber-300 uppercase truncate">Порывы</div>
                <div class="text-base sm:text-lg font-bold">{{ bursts }}</div>
              </div>
            </div>
            
            <!-- Уровень -->
            <div class="stat-badge bg-purple-900/40 border border-purple-700/50 px-2 py-2 sm:px-3 rounded-lg flex items-center gap-1 sm:gap-2 min-w-0">
              <span class="text-lg sm:text-xl flex-shrink-0">⭐</span>
              <div class="min-w-0 flex-1">
                <div class="text-[10px] sm:text-xs text-purple-300 uppercase truncate">Уровень</div>
                <div class="text-base sm:text-lg font-bold">{{ level }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Таблица проверок -->
    <div class="checks-section bg-slate-900/60 border border-white/10 rounded-2xl p-4 sm:p-6">
      <h2 class="text-lg sm:text-xl font-bold mb-4 text-slate-300 uppercase tracking-wide">Навыки:</h2>
      
      <div class="overflow-x-auto -mx-4 sm:mx-0">
        <div class="inline-block min-w-full align-middle px-4 sm:px-0">
        <table class="w-full border-collapse min-w-[800px]">
          <thead>
            <tr>
              <!-- Пустая ячейка в углу -->
              <th class="bg-slate-950/60 border border-slate-700 p-2 text-left text-sm text-slate-500 uppercase w-40">
                Навыки:
              </th>
              
              <!-- Заголовки сложностей с цветными границами слева -->
              <th 
                v-for="(diff, index) in difficulties" 
                :key="diff.value"
                :class="[
                  'border border-slate-700 p-2 text-center text-xs font-bold uppercase tracking-wide bg-slate-950/80',
                  diff.class
                ]"
                :style="{
                  borderLeftWidth: diff.short.startsWith('В') ? '3px' : '2px',
                  borderLeftStyle: diff.short.startsWith('Н') ? 'dashed' : 'solid',
                  borderLeftColor: 
                    diff.value <= 6 ? 'rgb(56 189 248)' :
                    diff.value <= 15 ? 'rgb(163 230 53)' :
                    diff.value <= 24 ? 'rgb(250 204 21)' :
                    diff.value <= 33 ? 'rgb(251 146 60)' :
                    'rgb(248 113 113)'
                }"
              >
                {{ diff.short }}
              </th>
            </tr>
          </thead>
          
          <tbody>
            <tr v-for="checkType in checkTypes" :key="checkType.id" class="hover:bg-slate-800/20 transition">
              <!-- Название типа проверки -->
              <td 
                class="bg-slate-950/40 border border-slate-700 p-2 font-bold text-sm"
                :style="{ color: checkType.color }"
              >
                <div class="flex items-center gap-2">
                  <Icon :icon="checkType.icon" class="text-lg" />
                  {{ checkType.name }}
                </div>
              </td>
              
              <!-- Ячейки с результатами -->
              <td 
                v-for="diff in difficulties" 
                :key="`${checkType.id}-${diff.value}`"
                :class="[
                  'border border-slate-700 p-2 text-center font-bold bg-slate-950/20',
                  // Цвет текста в зависимости от результата
                  getCellContent(checkType.id, diff).type === 'success' ? 'text-emerald-300' :
                  getCellContent(checkType.id, diff).type === 'fail' ? 'text-red-400' :
                  'text-slate-100'
                ]"
                :style="{
                  borderLeftWidth: diff.short.startsWith('В') ? '3px' : '2px',
                  borderLeftStyle: diff.short.startsWith('Н') ? 'dashed' : 'solid',
                  borderLeftColor: 
                    diff.value <= 6 ? 'rgb(56 189 248)' :
                    diff.value <= 15 ? 'rgb(163 230 53)' :
                    diff.value <= 24 ? 'rgb(250 204 21)' :
                    diff.value <= 33 ? 'rgb(251 146 60)' :
                    'rgb(248 113 113)'
                }"
              >
                <span class="text-base">{{ getCellContent(checkType.id, diff).value }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>
    </div>
    
    <!-- Защита (таблица 2x3) -->
    <div class="defence-section bg-slate-900/60 border border-white/10 rounded-2xl p-4 sm:p-6">
      <h2 class="text-lg sm:text-xl font-bold mb-4 text-slate-300 uppercase tracking-wide">Защита</h2>
      
      <div class="overflow-x-auto">
        <table class="w-full border-collapse">
          <thead>
            <tr>
              <th class="bg-slate-950/60 border border-slate-700 p-3 text-left text-sm text-slate-500 uppercase"></th>
              <th class="bg-slate-950/60 border border-slate-700 p-3 text-center text-sm font-bold text-slate-300">Удары</th>
              <th class="bg-slate-950/60 border border-slate-700 p-3 text-center text-sm font-bold text-slate-300">Снаряды</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="bg-slate-950/40 border border-slate-700 p-3 font-bold text-sm text-slate-300">Фронт</td>
              <td 
                class="border border-slate-700 p-3 text-center bg-slate-950/20 font-semibold"
                :style="{ color: getDefence('front', 'melee').color }"
              >
                {{ getDefence('front', 'melee').name }}
              </td>
              <td 
                class="border border-slate-700 p-3 text-center bg-slate-950/20 font-semibold"
                :style="{ color: getDefence('front', 'ranged').color }"
              >
                {{ getDefence('front', 'ranged').name }}
              </td>
            </tr>
            <tr>
              <td class="bg-slate-950/40 border border-slate-700 p-3 font-bold text-sm text-slate-300">Фланг</td>
              <td 
                class="border border-slate-700 p-3 text-center bg-slate-950/20 font-semibold"
                :style="{ color: getDefence('flank', 'melee').color }"
              >
                {{ getDefence('flank', 'melee').name }}
              </td>
              <td 
                class="border border-slate-700 p-3 text-center bg-slate-950/20 font-semibold"
                :style="{ color: getDefence('flank', 'ranged').color }"
              >
                {{ getDefence('flank', 'ranged').name }}
              </td>
            </tr>
            <tr>
              <td class="bg-slate-950/40 border border-slate-700 p-3 font-bold text-sm text-slate-300">Тыл</td>
              <td 
                class="border border-slate-700 p-3 text-center bg-slate-950/20 font-semibold"
                :style="{ color: getDefence('back', 'melee').color }"
              >
                {{ getDefence('back', 'melee').name }}
              </td>
              <td 
                class="border border-slate-700 p-3 text-center bg-slate-950/20 font-semibold"
                :style="{ color: getDefence('back', 'ranged').color }"
              >
                {{ getDefence('back', 'ranged').name }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <!-- Управление экипировкой -->
    <div class="equipment-section bg-slate-900/60 border border-white/10 rounded-2xl p-4 sm:p-6">
      <h2 class="text-lg sm:text-xl font-bold mb-4 text-slate-300 uppercase tracking-wide">Экипировка</h2>
      
      <EquipmentManager 
        :character="character"
        @update:character="updateCharacter"
      />
    </div>
    
    <!-- Инвентарь -->
    <div class="inventory-section bg-slate-900/60 border border-white/10 rounded-2xl p-4 sm:p-6">
      <InventoryPanel
        :character="character"
        @update:character="updateCharacter"
        @equip-item="handleEquipItem"
      />
    </div>
    </div>
  </div>
</template>

<style scoped>
.character-sheet-detailed {
  max-width: 1200px;
  margin: 0 auto;
}

/* Улучшенная прокрутка таблицы */
.checks-section table {
  min-width: 800px;
}

.checks-section td,
.checks-section th {
  white-space: nowrap;
}

/* Анимация при наведении на ячейки */
.checks-section tbody td {
  transition: all 0.2s ease;
}

.checks-section tbody td:hover {
  transform: scale(1.05);
  z-index: 1;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1);
}
</style>
