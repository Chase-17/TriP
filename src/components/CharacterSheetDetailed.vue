<script setup>
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import aspectsData from '@/data/aspects.json'
import diffsData from '@/data/diffs.json'
import itemsData from '@/data/items.json'
import EquipmentManager from './EquipmentManager.vue'
import InventoryPanel from './InventoryPanel.vue'
import HealthDisplay from './HealthDisplay.vue'
import CharacterPortrait from './CharacterPortrait.vue'
import { useCharactersStore } from '@/stores/characters'
import { useSessionStore } from '@/stores/session'
import { getCheckBonus as getCheckBonusFromUtil } from '@/utils/checks'
import { getDefenceData, calculateDefence } from '@/utils/defence'

const charactersStore = useCharactersStore()
const sessionStore = useSessionStore()

const props = defineProps({
  character: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close'])

// Обновление персонажа
const updateCharacter = (updatedChar) => {
  charactersStore.updateCharacter(updatedChar.id, updatedChar)
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
    const charId = props.character.id
    charactersStore.deleteCharacter(charId)
    
    // Уведомляем мастера об удалении
    sessionStore.sendCharacterDelete(charId)
    
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

// Получаем бонус коварства (Treachery) — используется для отображения
const cunningBonus = computed(() => {
  return getCheckBonusFromUtil(props.character, 'shadow')
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
  const difficulty = findDifficulty(value)
  return difficulty?.color || '#FFFFFF'
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
// Использует централизованную функцию из defence.js
const getDefence = (direction, attackType) => {
  const totalDefence = calculateDefence(props.character, direction, attackType)
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

// Защита от ударов (melee) для портрета — используем централизованную функцию
const meleeDefence = computed(() => getDefenceData(props.character, 'melee'))

// Защита от снарядов (ranged) для портрета — используем централизованную функцию
const rangedDefence = computed(() => getDefenceData(props.character, 'ranged'))

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

// Вычисляем штраф от ранений
// Лёгкое ранение = -1 категория = -3 к бонусу
// Тяжёлое ранение = -2 категории = -6 к бонусу
const getWoundsPenalty = () => {
  const combat = props.character.combat
  if (!combat || combat.healthType === 'simple') {
    // В простом режиме штраф от потерянного HP
    const lostHp = (combat?.maxHp || 8) - (combat?.hp || 0)
    return Math.floor(lostHp / 3) * 3 // каждые 3 потерянных HP = -3
  }
  
  // В режиме ранений: лёгкие -3, тяжёлые -6
  const wounds = combat.wounds || {}
  const lightPenalty = (wounds.light || 0) * 3
  const heavyPenalty = (wounds.heavy || 0) * 6
  
  return lightPenalty + heavyPenalty
}

// Вычисляем бонус к проверке для каждого типа
// Использует централизованную формулу из utils/checks.js
const getCheckBonus = (aspectId) => {
  return getCheckBonusFromUtil(props.character, aspectId)
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

// Получаем цвет границы для столбца сложности (возвращает цвет напрямую)
const getDifficultyBorderColor = (difficulty) => {
  return difficulty.color || '#FFFFFF'
}

// Получаем стили для вертикальной линии столбца
// Используем repeating-linear-gradient для всех типов линий
// Ширина всегда 4px (две 2px линии рядом) для стабильности разметки
const getDifficultyBorderStyle = (difficulty) => {
  const linetype = difficulty.linetype || 'single'
  const color = difficulty.color || '#FFFFFF'
  
  // Базовые стили для всех типов
  const baseStyle = {
    backgroundSize: '4px 100%',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'left center',
    paddingLeft: '8px' // Отступ от линии
  }
  
  // Паттерн пунктира (4px линия, 4px пробел)
  const dashedPattern = `repeating-linear-gradient(to bottom, ${color} 0px, ${color} 4px, transparent 4px, transparent 8px)`
  // Сплошная линия
  const solidPattern = `linear-gradient(to bottom, ${color}, ${color})`
  // Прозрачная линия
  const transparentPattern = `linear-gradient(to bottom, transparent, transparent)`
  
  if (linetype === 'dashed') {
    // Ниже: [прозрачная 2px][пунктир 2px]
    return {
      ...baseStyle,
      backgroundImage: `${transparentPattern}, ${dashedPattern}`,
      backgroundSize: '2px 100%, 2px 100%',
      backgroundPosition: 'left center, 2px center'
    }
  }
  
  if (linetype === 'double') {
    // Выше: [пунктир 2px][сплошная 2px]
    return {
      ...baseStyle,
      backgroundImage: `${dashedPattern}, ${solidPattern}`,
      backgroundSize: '2px 100%, 2px 100%',
      backgroundPosition: 'left center, 2px center'
    }
  }
  
  // Single (base): [прозрачная 2px][сплошная 2px]
  return {
    ...baseStyle,
    backgroundImage: `${transparentPattern}, ${solidPattern}`,
    backgroundSize: '2px 100%, 2px 100%',
    backgroundPosition: 'left center, 2px center'
  }
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
        <!-- Портрет с ранениями и защитой -->
        <CharacterPortrait
          :portrait="character.portrait"
          :name="character.name"
          :combat="character.combat"
          :stats="character.stats"
          :meleeDefence="meleeDefence"
          :rangedDefence="rangedDefence"
          :showDefence="true"
          defenceLayout="left"
          size="xl"
        />
        
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
    
    <!-- Секция здоровья -->
    <div class="health-section bg-slate-900/60 border border-white/10 rounded-2xl p-4 sm:p-6">
      <h2 class="text-lg sm:text-xl font-bold mb-4 text-slate-300 uppercase tracking-wide">Здоровье:</h2>
      <HealthDisplay
        :combat="character.combat || { healthType: 'simple', hp: 0, maxHp: 8, wounds: { scratch: 0, light: 0, heavy: 0, deadly: 0 } }"
        :stats="character.stats || {}"
        :readonly="true"
      />
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
              <td class="bg-slate-950/60 border border-slate-700 p-2 text-left text-sm text-slate-500 uppercase w-40">
                Навыки:
              </td>
              
              <!-- Заголовки сложностей -->
              <td 
                v-for="(diff, index) in difficulties" 
                :key="diff.value"
                :class="[
                  'border border-slate-700 p-2 text-center text-xs font-bold uppercase tracking-wide',
                  diff.level === 7 ? 'bg-black' : 'bg-slate-950/80'
                ]"
                :style="{
                  color: diff.level === 7 ? '#FFFFFF' : diff.color
                }"
              >
                {{ diff.short }}
              </td>
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
                  'border border-slate-700 p-2 text-center font-bold',
                  // Особый стиль для Невозможной сложности
                  diff.level === 7 ? 'bg-black text-white' : 'bg-slate-950/20',
                  // Цвет текста в зависимости от результата (кроме Невозможной)
                  diff.level !== 7 && getCellContent(checkType.id, diff).type === 'success' ? 'text-emerald-300' : '',
                  diff.level !== 7 && getCellContent(checkType.id, diff).type === 'fail' ? 'text-red-400' : '',
                  diff.level !== 7 && getCellContent(checkType.id, diff).type === 'number' ? 'text-slate-100' : ''
                ]"
                :style="getDifficultyBorderStyle(diff)"
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
  transition: background-color 0.2s ease;
}

.checks-section tbody td:hover {
  background-color: rgba(51, 65, 85, 0.3);
}
</style>
