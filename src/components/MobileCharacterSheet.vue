<script setup>
/**
 * MobileCharacterSheet - мобильная версия листа персонажа
 * Адаптивный интерфейс с вкладками для разных секций
 */
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useCharactersStore } from '@/stores/characters'
import { useSessionStore } from '@/stores/session'
import { useUserStore } from '@/stores/user'
import aspectsData from '@/data/aspects.json'
import diffsData from '@/data/diffs.json'
import itemsData from '@/data/items.json'
import EquipmentManager from './EquipmentManager.vue'
import InventoryPanel from './InventoryPanel.vue'
import { getCheckBonus as getCheckBonusFromUtil } from '@/utils/checks'
import { migrateCharacterSkills, getSkillDisplayData } from '@/utils/skillsMigration'

const props = defineProps({
  // Персонаж для отображения (если не передан - берётся из стора)
  character: {
    type: Object,
    default: null
  },
  // Встроенный режим (без своих tabs - управляется извне)
  embedded: {
    type: Boolean,
    default: false
  },
  // Активная вкладка (для embedded режима)
  activeTab: {
    type: String,
    default: 'main'
  }
})

const emit = defineEmits(['close', 'switch-tab', 'update:activeTab'])

const charactersStore = useCharactersStore()
const sessionStore = useSessionStore()
const userStore = useUserStore()
const { myCharacters, activeCharacter, activeCharacterId } = storeToRefs(charactersStore)

// Текущий персонаж (из пропса или из стора)
const currentCharacter = computed(() => props.character || activeCharacter.value)

// Вкладки внутри листа персонажа
const sheetTabs = [
  { id: 'main', label: 'Основное', icon: 'mdi:account' },
  { id: 'items', label: 'Вещи', icon: 'mdi:bag-personal' },
  { id: 'social', label: 'Социум', icon: 'mdi:account-group' },
  { id: 'magic', label: 'Магия', icon: 'mdi:auto-fix' }
]

// Используем внешнюю вкладку в embedded режиме
const internalActiveTab = ref('main')
const activeSheetTab = computed({
  get: () => props.embedded ? props.activeTab : internalActiveTab.value,
  set: (val) => {
    if (props.embedded) {
      emit('update:activeTab', val)
    } else {
      internalActiveTab.value = val
    }
  }
})

// Переключение между персонажами (если их больше одного)
const selectCharacter = (charId) => {
  charactersStore.setActiveCharacter(charId)
}

// Аспекты из общей базы данных (фиксированный порядок)
const aspects = computed(() => {
  // Используем порядок из metadata
  const order = aspectsData.metadata?.circularOrder || aspectsData.aspects.map(a => a.id)
  return order.map(id => aspectsData.aspects.find(a => a.id === id)).filter(Boolean)
})

// Режимы небоевых действий
const actionModes = computed(() => {
  return aspects.value.filter(a => a.mode)
})

// Активный режим действий
const activeMode = ref(null)
const showModeInfo = ref(false)
const selectedModeDetails = ref(null)

// Названия активных режимов
const activeModeNames = computed(() => {
  if (!activeMode.value) return 'не выбран'
  const mode = actionModes.value.find(m => m.id === activeMode.value)
  return mode ? mode.mode.name : 'не выбран'
})

const setActiveMode = (modeId) => {
  activeMode.value = activeMode.value === modeId ? null : modeId
}

const showModeDetails = (mode) => {
  selectedModeDetails.value = mode
}

// === НАВЫКИ И ОСОБЕННОСТИ ===
const showCustomDescriptions = ref(false) // Показ своих заметок
const showOriginalDescription = ref(true) // Показ оригинальных описаний уровней
const skillsSearchQuery = ref('') // Поиск по навыкам
const selectedSkillDetails = ref(null) // Попап с деталями навыка

// Загружаем предпочтения для текущего персонажа
const skillPrefs = computed(() => {
  if (!currentCharacter.value?.id) return { expandedSkills: [], allExpanded: true }
  return userStore.getSkillPreferences(currentCharacter.value.id)
})

// Проверка, раскрыт ли конкретный навык
const isSkillExpanded = (skillId) => {
  // Если глобально раскрыты - проверяем, не закрыт ли индивидуально
  if (skillPrefs.value.allExpanded) {
    return !skillPrefs.value.expandedSkills.includes(skillId) // expandedSkills = список ЗАКРЫТЫХ при allExpanded
  }
  // Если глобально закрыты - проверяем, открыт ли индивидуально
  return skillPrefs.value.expandedSkills.includes(skillId)
}

// Переключение раскрытия конкретного навыка
const toggleSkillExpanded = (skillId) => {
  if (!currentCharacter.value?.id) return
  const charId = currentCharacter.value.id
  const isCurrentlyExpanded = isSkillExpanded(skillId)
  
  if (skillPrefs.value.allExpanded) {
    // Если все раскрыты, expandedSkills = список закрытых
    userStore.setSkillExpanded(charId, skillId, isCurrentlyExpanded) // добавляем в "закрытые"
  } else {
    // Если все закрыты, expandedSkills = список открытых
    userStore.setSkillExpanded(charId, skillId, !isCurrentlyExpanded)
  }
}

// Переключение глобального раскрытия
const toggleAllSkillsExpanded = () => {
  if (!currentCharacter.value?.id) return
  userStore.setAllSkillsExpanded(currentCharacter.value.id, !skillPrefs.value.allExpanded)
}

// Навыки персонажа с полными данными (с автоматической миграцией)
const characterSkills = computed(() => {
  if (!currentCharacter.value?.skills) return []
  
  // Мигрируем навыки из старого формата если нужно
  const { migrated, needsSave } = migrateCharacterSkills(currentCharacter.value.skills)
  
  // Если была миграция - сохраняем обновлённые данные
  if (needsSave && currentCharacter.value.id) {
    console.log('[Skills] Миграция навыков персонажа', currentCharacter.value.name)
    charactersStore.updateCharacter(currentCharacter.value.id, { skills: migrated })
  }
  
  // Преобразуем в данные для отображения
  return migrated.map(skill => getSkillDisplayData(skill)).filter(Boolean)
})

// Фильтрованные и отсортированные навыки
const filteredSkills = computed(() => {
  const query = skillsSearchQuery.value.toLowerCase().trim()
  if (!query) return characterSkills.value
  
  // Функция для расчёта релевантности
  const getRelevance = (skill) => {
    let score = 0
    const name = skill.name.toLowerCase()
    const source = skill.sourceName.toLowerCase()
    const desc = skill.currentDescription?.toLowerCase() || ''
    const customDesc = skill.customDescription?.toLowerCase() || ''
    const customTags = (skill.customTags || []).join(' ').toLowerCase()
    
    // Точное совпадение имени - максимальный приоритет
    if (name === query) score += 100
    // Имя начинается с запроса
    else if (name.startsWith(query)) score += 50
    // Имя содержит запрос
    else if (name.includes(query)) score += 30
    
    // Источник (класс/аспект)
    if (source.includes(query)) score += 15
    
    // Пользовательские теги
    if (customTags.includes(query)) score += 20
    
    // Пользовательское описание
    if (customDesc.includes(query)) score += 10
    
    // Оригинальное описание
    if (desc.includes(query)) score += 5
    
    return score
  }
  
  // Фильтруем и сортируем по релевантности
  return characterSkills.value
    .map(skill => ({ skill, relevance: getRelevance(skill) }))
    .filter(item => item.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .map(item => item.skill)
})

const openSkillDetails = (skill) => {
  // Сохраняем только id навыка, данные будем брать из characterSkills
  selectedSkillDetails.value = skill.id
}

const closeSkillDetails = () => {
  selectedSkillDetails.value = null
}

// Получаем актуальные данные выбранного навыка
const selectedSkillData = computed(() => {
  if (!selectedSkillDetails.value) return null
  return characterSkills.value.find(s => s.id === selectedSkillDetails.value) || null
})

// Сохранение кастомного описания для конкретного уровня навыка
const saveCustomDescription = (skillId, level, description) => {
  if (!currentCharacter.value) return
  const skills = [...(currentCharacter.value.skills || [])]
  const idx = skills.findIndex(s => s.id === skillId)
  if (idx >= 0) {
    const skill = { ...skills[idx] }
    skill.customDescriptions = { ...skill.customDescriptions, [level]: description }
    skills[idx] = skill
    charactersStore.updateCharacter(currentCharacter.value.id, { skills })
  }
}

// Сохранение кастомных тегов для конкретного уровня навыка
const saveCustomTags = (skillId, level, tags) => {
  if (!currentCharacter.value) return
  const skills = [...(currentCharacter.value.skills || [])]
  const idx = skills.findIndex(s => s.id === skillId)
  if (idx >= 0) {
    const skill = { ...skills[idx] }
    skill.customTags = { ...skill.customTags, [level]: tags }
    skills[idx] = skill
    charactersStore.updateCharacter(currentCharacter.value.id, { skills })
  }
}

// Палитра цветов для меток навыков
const skillColorOptions = [
  { name: 'Красный', value: '#ef4444' },
  { name: 'Оранжевый', value: '#f97316' },
  { name: 'Жёлтый', value: '#eab308' },
  { name: 'Зелёный', value: '#22c55e' },
  { name: 'Бирюзовый', value: '#14b8a6' },
  { name: 'Голубой', value: '#06b6d4' },
  { name: 'Синий', value: '#3b82f6' },
  { name: 'Фиолетовый', value: '#8b5cf6' },
  { name: 'Розовый', value: '#ec4899' },
  { name: 'Серый', value: '#64748b' }
]

// Сохранение цвета метки навыка
const saveSkillColor = (skillId, color) => {
  if (!currentCharacter.value) return
  const skills = [...(currentCharacter.value.skills || [])]
  const idx = skills.findIndex(s => s.id === skillId)
  if (idx >= 0) {
    const skill = { ...skills[idx] }
    if (color) {
      skill.customColor = color
    } else {
      delete skill.customColor
    }
    skills[idx] = skill
    charactersStore.updateCharacter(currentCharacter.value.id, { skills })
  }
}

// Сложности из общей базы данных
const difficulties = computed(() => {
  const diffsObj = diffsData.default || diffsData
  return Object.entries(diffsObj)
    .map(([val, data]) => ({ value: parseInt(val), ...data }))
    .sort((a, b) => a.value - b.value)
})

// Получаем бонус проверки для аспекта
const getCheckBonus = (aspectId) => {
  return getCheckBonusFromUtil(currentCharacter.value, aspectId)
}

// Получаем результат для ячейки таблицы
const getCellResult = (aspectId, difficulty) => {
  const bonus = getCheckBonus(aspectId)
  const needed = difficulty - bonus
  
  if (needed <= 2) return { type: 'auto', value: '✓' }
  if (needed <= 12) return { type: 'roll', value: needed }
  return { type: 'fail', value: '✗' }
}

// Находим сложность по значению
const findDifficulty = (value) => {
  const diffs = Object.entries(diffsData.default || diffsData)
    .map(([val, data]) => ({ value: parseInt(val), ...data }))
    .filter(d => d.value >= 0)
    .sort((a, b) => a.value - b.value)
  
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

// Свайп для переключения вкладок
// Обновление персонажа
const updateCharacter = (updatedChar) => {
  charactersStore.updateCharacter(updatedChar.id, updatedChar)
}

// Экипировка предмета из инвентаря
const handleEquipItem = (item) => {
  if (!currentCharacter.value) return
  
  if (item.category === 'armor') {
    const updatedCharacter = {
      ...currentCharacter.value,
      equipment: {
        ...currentCharacter.value.equipment,
        armor: item.id
      }
    }
    updateCharacter(updatedCharacter)
  } else if (item.category === 'weapon' || item.category === 'shield') {
    const sets = [...(currentCharacter.value.equipment?.weaponSets || [])]
    const firstSet = { ...sets[0] }
    
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
        ...currentCharacter.value,
        equipment: {
          ...currentCharacter.value.equipment,
          weaponSets: sets
        }
      }
      updateCharacter(updatedCharacter)
    }
  }
}

// Удаление персонажа
const deleteCharacter = () => {
  if (!currentCharacter.value) return
  if (confirm(`Удалить персонажа "${currentCharacter.value.name}"?`)) {
    const charId = currentCharacter.value.id
    charactersStore.deleteCharacter(charId)
    sessionStore.sendCharacterDelete(charId)
    emit('close')
  }
}
</script>

<template>
  <div class="mobile-character-sheet" :class="{ embedded }">
    <!-- Заголовок с вкладками персонажей (если > 1, только не в embedded режиме) -->
    <div v-if="!embedded && myCharacters.length > 1" class="character-tabs">
      <button
        v-for="char in myCharacters"
        :key="char.id"
        class="char-tab"
        :class="{ active: activeCharacterId === char.id }"
        @click="selectCharacter(char.id)"
      >
        <img 
          v-if="char.portrait" 
          :src="char.portrait" 
          :alt="char.name"
          class="char-tab-avatar"
        />
        <span v-else class="char-tab-avatar-fallback">
          {{ char.name?.charAt(0)?.toUpperCase() || '?' }}
        </span>
        <span class="char-tab-name">{{ char.name }}</span>
      </button>
    </div>
    
    <!-- Горизонтальные вкладки секций листа (только не в embedded режиме) -->
    <div v-if="!embedded" class="sheet-tabs-row">
      <button
        v-for="tab in sheetTabs"
        :key="tab.id"
        class="sheet-tab-btn"
        :class="{ active: activeSheetTab === tab.id }"
        @click="activeSheetTab = tab.id"
      >
        <Icon :icon="tab.icon" class="tab-icon" />
        <span class="tab-label">{{ tab.label }}</span>
      </button>
    </div>
    
    <!-- Контент листа персонажа -->
    <div 
      v-if="currentCharacter"
      class="sheet-content"
    >
      <!-- Вкладка "Основное" -->
      <div v-show="activeSheetTab === 'main'" class="tab-content tab-content-bottom">
        <!-- Блок навыков и особенностей -->
        <div class="skills-section">
          <div class="skills-header">
            <span class="skills-title">НАВЫКИ И ОСОБЕННОСТИ</span>
            <div class="skills-controls">
              <button 
                class="skills-toggle-desc" 
                :class="{ active: !showOriginalDescription }"
                @click="showOriginalDescription = !showOriginalDescription"
                title="Скрыть/показать оригинальные описания"
              >
                <Icon icon="mdi:text-box-remove" />
              </button>
              <button 
                class="skills-toggle-desc" 
                :class="{ active: showCustomDescriptions }"
                @click="showCustomDescriptions = !showCustomDescriptions"
                title="Показать свои заметки"
              >
                <Icon icon="mdi:note-edit" />
              </button>
              <button 
                class="skills-toggle-expand" 
                @click="toggleAllSkillsExpanded"
                :title="skillPrefs.allExpanded ? 'Свернуть все' : 'Развернуть все'"
              >
                <Icon :icon="skillPrefs.allExpanded ? 'mdi:unfold-less-horizontal' : 'mdi:unfold-more-horizontal'" />
              </button>
            </div>
          </div>
          
          <div v-if="characterSkills.length > 0" class="skills-list">
            <div 
              v-for="skill in filteredSkills" 
              :key="skill.id"
              class="skill-item"
              :class="{ expanded: isSkillExpanded(skill.id) }"
              :style="{ '--skill-color': skill.customColor || skill.aspectColor }"
            >
              <!-- Основная строка навыка -->
              <div class="skill-main" @click="toggleSkillExpanded(skill.id)">
                <div class="skill-info">
                  <span class="skill-name">{{ skill.name }}</span>
                  <span class="skill-level">{{ skill.level }}/{{ skill.maxLevel }}</span>
                </div>
                
                <!-- Источник: название класса справа -->
                <div class="skill-source">
                  <span class="skill-source-name">{{ skill.sourceName }}</span>
                  <Icon 
                    :icon="isSkillExpanded(skill.id) ? 'mdi:chevron-up' : 'mdi:chevron-down'" 
                    class="skill-expand-icon"
                  />
                </div>
              </div>
              
              <!-- Описание (раскрываемое) с фоновой картинкой -->
              <div v-if="isSkillExpanded(skill.id)" class="skill-description">
                <!-- Фоновая картинка класса -->
                <div 
                  v-if="skill.sourceType === 'class' && skill.sourceImage" 
                  class="skill-bg-image"
                  :style="{ backgroundImage: `url(${skill.sourceImage})` }"
                ></div>
                
                <!-- Все открытые уровни -->
                <div class="skill-levels-list">
                  <!-- Оригинальные описания (можно скрыть) -->
                  <template v-if="showOriginalDescription">
                    <div 
                      v-for="lvl in skill.unlockedLevels" 
                      :key="lvl.level" 
                      class="skill-level-item"
                    >
                      <span class="skill-level-badge">{{ lvl.level }}</span>
                      <p>{{ lvl.description }}</p>
                    </div>
                  </template>
                  <!-- Общая заметка к навыку (когда включён режим заметок) -->
                  <div v-if="showCustomDescriptions && skill.customDescription" class="skill-custom-note">
                    <span class="skill-note-badge">📝</span>
                    <p>{{ skill.customDescription }}</p>
                  </div>
                  <!-- Если скрыты описания и нет заметки - подсказка -->
                  <div v-if="!showOriginalDescription && !(showCustomDescriptions && skill.customDescription)" class="skill-hidden-hint">
                    <Icon icon="mdi:eye-off" />
                    <span>Описания скрыты</span>
                  </div>
                </div>
                
                <button class="skill-details-btn" @click.stop="openSkillDetails(skill)">
                  <Icon icon="mdi:dots-horizontal" />
                </button>
              </div>
            </div>
          </div>
          
          <!-- Заглушка когда навыков нет -->
          <div v-else class="skills-empty">
            <Icon icon="mdi:book-open-variant" class="skills-empty-icon" />
            <span>Навыки появятся по мере развития персонажа</span>
          </div>
          
          <!-- Поиск навыков -->
          <div v-if="characterSkills.length > 0" class="skills-filter">
            <Icon icon="mdi:magnify" class="skills-filter-icon" />
            <input 
              type="text" 
              v-model="skillsSearchQuery"
              placeholder="Поиск навыков..." 
              class="skills-filter-input" 
            />
            <button 
              v-if="skillsSearchQuery" 
              class="skills-filter-clear"
              @click="skillsSearchQuery = ''"
            >
              <Icon icon="mdi:close" />
            </button>
          </div>
        </div>

        <!-- Попап с деталями навыка -->
        <div v-if="selectedSkillData" class="skill-details-overlay" @click="closeSkillDetails">
          <div class="skill-details-card" @click.stop>
            <div class="skill-details-header" :style="{ borderColor: selectedSkillData.customColor || selectedSkillData.aspectColor }">
              <Icon :icon="selectedSkillData.sourceIcon" class="skill-details-source-icon" />
              <div class="skill-details-title">
                <span class="skill-details-name">{{ selectedSkillData.name }}</span>
                <span class="skill-details-level">Уровень {{ selectedSkillData.level }} / {{ selectedSkillData.maxLevel }}</span>
              </div>
              <button class="skill-details-close-btn" @click="closeSkillDetails">
                <Icon icon="mdi:close" />
              </button>
            </div>
            
            <div class="skill-details-body">
              <!-- Описания всех открытых уровней -->
              <div class="skill-details-levels">
                <div 
                  v-for="lvl in selectedSkillData.unlockedLevels" 
                  :key="lvl.level" 
                  class="skill-details-level"
                >
                  <span class="skill-details-level-badge">{{ lvl.level }}</span>
                  <p class="skill-details-desc-text">{{ lvl.description }}</p>
                </div>
              </div>
              
              <!-- Единая заметка для всего навыка -->
              <div class="skill-details-section">
                <h4>Заметка</h4>
                <textarea 
                  class="skill-custom-desc-input"
                  :value="selectedSkillData.customDescription"
                  @input="e => saveCustomDescription(selectedSkillData.id, 0, e.target.value)"
                  placeholder="Добавьте заметку к навыку..."
                ></textarea>
              </div>
              
              <!-- Единые теги для всего навыка -->
              <div class="skill-details-section">
                <h4>Теги для поиска</h4>
                <input 
                  type="text"
                  class="skill-tags-input"
                  :value="selectedSkillData.customTags?.join(', ')"
                  @input="e => saveCustomTags(selectedSkillData.id, 0, e.target.value.split(',').map(t => t.trim()).filter(Boolean))"
                  placeholder="тег1, тег2, тег3..."
                />
              </div>
              
              <!-- Выбор цвета метки -->
              <div class="skill-details-section">
                <h4>Цвет метки</h4>
                <div class="skill-color-picker">
                  <button 
                    v-for="color in skillColorOptions" 
                    :key="color.value"
                    class="skill-color-option"
                    :class="{ active: (selectedSkillData.customColor || selectedSkillData.aspectColor) === color.value }"
                    :style="{ backgroundColor: color.value }"
                    :title="color.name"
                    @click="saveSkillColor(selectedSkillData.id, color.value)"
                  ></button>
                  <button 
                    class="skill-color-option reset"
                    :class="{ active: !selectedSkillData.customColor }"
                    title="Сбросить (цвет аспекта)"
                    @click="saveSkillColor(selectedSkillData.id, null)"
                  >
                    <Icon icon="mdi:refresh" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Блок выбора режима небоевых действий -->
        <div class="action-mode-section">
          <div class="mode-header">
            <div class="mode-header-center">
              <span class="mode-title">РЕЖИМ ДЕЙСТВИЙ:</span>
              <span class="mode-active-name">{{ activeModeNames }}</span>
            </div>
            <button class="mode-info-btn" @click="showModeInfo = !showModeInfo">
              <Icon icon="mdi:information-outline" />
            </button>
          </div>
          <div class="mode-buttons">
            <button
              v-for="mode in actionModes"
              :key="mode.id"
              class="mode-btn"
              :class="{ active: activeMode === mode.id }"
              :style="{ '--mode-color': mode.color }"
              @click="setActiveMode(mode.id)"
              :title="mode.mode.name"
            >
              <Icon :icon="mode.mode.icon" class="mode-icon" />
              <button 
                class="mode-detail-btn" 
                @click.stop="showModeDetails(mode)"
              >
                <Icon icon="mdi:help-circle-outline" />
              </button>
            </button>
          </div>
        </div>

        <!-- Общая пояснялка по режимам -->
        <div v-if="showModeInfo" class="mode-info-panel">
          <p>Выбранный режим виден мастеру и влияет на контекст сцены.</p>
          <p>При высоких показателях соответствующего Атрибута режимы становятся эффективнее и дают особые бонусы.</p>
          <p>По умолчанию можно выбрать только один режим. Особые умения увеличивают лимит.</p>
          <p class="mode-info-warning">В бою режимы менять нельзя.</p>
        </div>

        <!-- Модалка с деталями режима -->
        <div v-if="selectedModeDetails" class="mode-details-overlay" @click="selectedModeDetails = null">
          <div class="mode-details-card" @click.stop>
            <div class="mode-details-header" :style="{ color: selectedModeDetails.color }">
              <Icon :icon="selectedModeDetails.mode.icon" class="mode-details-icon" />
              <span class="mode-details-name">{{ selectedModeDetails.mode.name }}</span>
            </div>
            <p class="mode-details-desc">{{ selectedModeDetails.mode.description }}</p>
            <div class="mode-details-info">
              <p>Мастер видит ваш выбранный режим. Контекст сцены может меняться в зависимости от вашего подхода.</p>
            </div>
            <button class="mode-details-close" @click="selectedModeDetails = null">Закрыть</button>
          </div>
        </div>

        <!-- Таблица проверок -->
        <div class="checks-section">
          <div class="checks-table-container">
            <!-- Фиксированный столбец проверок -->
            <div class="aspects-column">
              <div class="aspect-header-cell">
                <span class="checks-title">ПРОВЕРКИ</span>
              </div>
              <div 
                v-for="aspect in aspects" 
                :key="aspect.id"
                class="aspect-row-cell"
                :style="{ color: aspect.color }"
              >
                <Icon :icon="aspect.checkIcon || aspect.icon || 'mdi:circle'" class="aspect-icon" />
                <span class="aspect-name">{{ aspect.check?.name || aspect.name }}</span>
              </div>
            </div>
            <!-- Прокручиваемый блок со значениями -->
            <div class="checks-scroll-area">
              <div class="checks-grid">
                <!-- Заголовки сложностей -->
                <div class="diff-headers-row">
                  <div 
                    v-for="diff in difficulties" 
                    :key="diff.value"
                    class="diff-header-cell"
                    :class="'linetype-' + diff.linetype"
                    :style="{ '--diff-color': diff.color }"
                    :title="diff.name"
                  >
                    {{ diff.short }}
                  </div>
                </div>
                <!-- Строки значений -->
                <div v-for="aspect in aspects" :key="aspect.id" class="checks-row">
                  <div 
                    v-for="diff in difficulties" 
                    :key="diff.value"
                    class="check-cell"
                    :class="['linetype-' + diff.linetype, getCellResult(aspect.id, diff.value).type]"
                    :style="{ '--diff-color': diff.color }"
                  >
                    {{ getCellResult(aspect.id, diff.value).value }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Вкладка "Вещи" -->
      <div v-show="activeSheetTab === 'items'" class="tab-content">
        <div class="section-card">
          <h2 class="section-title">Снаряжение</h2>
          <EquipmentManager
            :character="currentCharacter"
            @update="updateCharacter"
          />
        </div>
        
        <div class="section-card">
          <h2 class="section-title">Инвентарь</h2>
          <InventoryPanel
            :character="currentCharacter"
            @equip="handleEquipItem"
          />
        </div>
      </div>
      
      <!-- Вкладка "Социум" -->
      <div v-show="activeSheetTab === 'social'" class="tab-content">
        <div class="section-card placeholder">
          <Icon icon="mdi:account-group" class="placeholder-icon" />
          <p>Социальные связи</p>
          <span class="placeholder-hint">В разработке</span>
        </div>
      </div>
      
      <!-- Вкладка "Магия" -->
      <div v-show="activeSheetTab === 'magic'" class="tab-content">
        <div class="section-card placeholder">
          <Icon icon="mdi:auto-fix" class="placeholder-icon" />
          <p>Магические способности</p>
          <span class="placeholder-hint">В разработке</span>
        </div>
      </div>
    </div>
    
    <!-- Пустое состояние -->
    <div v-else class="empty-state">
      <Icon icon="mdi:account-off" class="empty-icon" />
      <p>Персонаж не выбран</p>
    </div>
  </div>
</template>

<style scoped>
.mobile-character-sheet {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f172a;
  color: #f1f5f9;
}

/* Вкладки персонажей */
.character-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.95);
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  overflow-x: auto;
  flex-shrink: 0;
}

.char-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(51, 65, 85, 0.3);
  border: 1px solid transparent;
  color: #94a3b8;
  font-size: 12px;
  white-space: nowrap;
  transition: all 150ms;
}

.char-tab.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.3);
  color: #38bdf8;
}

.char-tab-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}

.char-tab-avatar-fallback {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
}

.char-tab-name {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Горизонтальные вкладки секций */
.sheet-tabs-row {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.95);
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  overflow-x: auto;
  flex-shrink: 0;
}

.sheet-tab-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(51, 65, 85, 0.3);
  border: 1px solid transparent;
  color: #64748b;
  font-size: 12px;
  white-space: nowrap;
  transition: all 150ms;
}

.sheet-tab-btn.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.3);
  color: #38bdf8;
}

.sheet-tab-btn .tab-icon {
  width: 16px;
  height: 16px;
}

.sheet-tab-btn .tab-label {
  font-weight: 500;
}

/* Контент листа */
.sheet-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  padding-bottom: 12px;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Контент выровненный по низу */
.tab-content-bottom {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 16px;
}

/* === СЕКЦИЯ НАВЫКОВ === */
.skills-section {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skills-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.skills-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #e2e8f0;
}

.skills-controls {
  display: flex;
  gap: 4px;
}

.skills-toggle-desc,
.skills-toggle-expand {
  background: none;
  border: none;
  color: #64748b;
  padding: 4px;
  cursor: pointer;
  border-radius: 4px;
}

.skills-toggle-desc:hover,
.skills-toggle-expand:hover {
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.1);
}

.skills-toggle-desc.active {
  color: #22c55e;
}

.skills-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skills-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  color: #64748b;
  font-size: 12px;
  text-align: center;
  font-style: italic;
}

.skills-empty-icon {
  font-size: 24px;
  opacity: 0.6;
}

.skill-item {
  position: relative;
  background: rgba(30, 41, 59, 0.6);
  border-radius: 8px;
  border-left: 3px solid var(--skill-color, #64748b);
  overflow: hidden;
  transition: all 0.2s ease;
}

.skill-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
}

.skill-main:hover {
  background: rgba(51, 65, 85, 0.4);
}

.skill-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.skill-name {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
}

.skill-level {
  font-size: 11px;
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
}

.skill-source {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  opacity: 0.8;
}

.skill-source-name {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.skill-expand-icon {
  font-size: 18px;
  color: #64748b;
  transition: transform 0.2s ease;
}

.skill-item.expanded .skill-expand-icon {
  transform: rotate(180deg);
}

.skill-description {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
  background: rgba(15, 23, 42, 0.5);
  overflow: hidden;
}

.skill-levels-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  z-index: 1;
}

.skill-level-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.skill-level-badge {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(148, 163, 184, 0.2);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  color: #cbd5e1;
}

.skill-level-item p {
  flex: 1;
  margin: 0;
}

/* Заметка игрока к навыку */
.skill-custom-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed rgba(148, 163, 184, 0.3);
}

.skill-note-badge {
  flex-shrink: 0;
  font-size: 14px;
}

.skill-custom-note p {
  flex: 1;
  margin: 0;
  color: #fbbf24;
  font-style: italic;
}

/* Фоновая картинка класса - внутри описания */
.skill-bg-image {
  position: absolute;
  right: -10px;
  top: 50%;
  transform: translateY(-50%);
  width: 100px;
  height: 100px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  opacity: 0.2;
  pointer-events: none;
  filter: grayscale(20%);
}

.skill-description p {
  flex: 1;
  margin: 0;
  position: relative;
  z-index: 1;
}

.skill-details-btn {
  flex-shrink: 0;
  background: rgba(148, 163, 184, 0.15);
  border: none;
  border-radius: 4px;
  color: #64748b;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  position: relative;
  z-index: 1;
}

.skill-details-btn:hover {
  background: rgba(148, 163, 184, 0.25);
  color: #94a3b8;
}

.skills-filter {
  margin-top: 4px;
  position: relative;
  display: flex;
  align-items: center;
}

.skills-filter-icon {
  position: absolute;
  left: 12px;
  color: #64748b;
  font-size: 16px;
  pointer-events: none;
}

.skills-filter-input {
  width: 100%;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  padding: 8px 12px 8px 36px;
  font-size: 13px;
  color: #e2e8f0;
}

.skills-filter-input::placeholder {
  color: #64748b;
}

.skills-filter-clear {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.15s;
}

.skills-filter-clear:hover {
  background: rgba(148, 163, 184, 0.2);
  color: #94a3b8;
}

/* Подсказка когда описания скрыты */
.skill-hidden-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #64748b;
  font-size: 12px;
  font-style: italic;
}

/* Попап деталей навыка */
.skill-details-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 1000;
  padding: 10px;
  padding-top: 260px;
  overflow-y: auto;
}

.skill-details-card {
  background: #1e293b;
  border-radius: 12px;
  width: 100%;
  max-width: 500px;
  margin-bottom: 20px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  display: flex;
  flex-direction: column;
}

.skill-details-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 2px solid;
  flex-shrink: 0;
}

.skill-details-source-icon {
  font-size: 24px;
  color: #94a3b8;
}

.skill-details-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.skill-details-name {
  font-size: 16px;
  font-weight: 700;
  color: #e2e8f0;
}

.skill-details-level {
  font-size: 12px;
  color: #94a3b8;
}

.skill-details-close-btn {
  background: none;
  border: none;
  color: #64748b;
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.skill-details-close-btn:hover {
  color: #94a3b8;
}

.skill-details-body {
  padding: 12px 16px;
}

.skill-details-levels {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.skill-details-levels .skill-details-level {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 8px;
}

.skill-details-level-badge {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(148, 163, 184, 0.2);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #cbd5e1;
}

.skill-details-desc-text {
  flex: 1;
  font-size: 13px;
  color: #cbd5e1;
  margin: 0;
  line-height: 1.5;
}

.skill-details-section {
  margin-bottom: 12px;
}

.skill-details-section:last-child {
  margin-bottom: 0;
}

.skill-details-section h4 {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.skill-custom-desc-input {
  width: 100%;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  padding: 10px;
  font-size: 13px;
  color: #e2e8f0;
  resize: vertical;
  min-height: 50px;
}

.skill-tags-input {
  width: 100%;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  color: #e2e8f0;
}

.skill-custom-desc-input::placeholder,
.skill-tags-input::placeholder {
  color: #64748b;
}

/* Палитра цветов для метки навыка */
.skill-color-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.skill-color-option {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.skill-color-option:hover {
  transform: scale(1.1);
}

.skill-color-option.active {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3);
}

.skill-color-option.reset {
  background: rgba(148, 163, 184, 0.2);
  color: #94a3b8;
  font-size: 14px;
}

.skill-color-option.reset:hover {
  background: rgba(148, 163, 184, 0.3);
}

/* Секция режима действий */
.action-mode-section {
  flex-shrink: 0;
}

.mode-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 8px;
}

.mode-header-center {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  justify-content: center;
}

.mode-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #94a3b8;
}

.mode-active-name {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
}

.mode-info-btn {
  background: none;
  border: none;
  color: #64748b;
  padding: 4px;
  cursor: pointer;
  flex-shrink: 0;
}

.mode-buttons {
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.mode-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 10px 4px;
  background: rgba(30, 41, 59, 0.6);
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
}

.mode-btn:hover {
  background: rgba(51, 65, 85, 0.6);
}

.mode-btn.active {
  border-color: var(--mode-color);
  background: color-mix(in srgb, var(--mode-color) 15%, transparent);
}

/* Особый стиль для Тени - более заметная чёрная граница */
.mode-btn.active[style*="#374151"] {
  border-color: #000000;
  background: rgba(0, 0, 0, 0.15);
}

.mode-icon {
  width: 24px;
  height: 24px;
  color: var(--mode-color);
}

.mode-detail-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  background: none;
  border: none;
  padding: 2px;
  color: #64748b;
  cursor: pointer;
  font-size: 12px;
}

.mode-detail-btn:hover {
  color: #94a3b8;
}

/* Оверлей с деталями режима */
.mode-details-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.mode-details-card {
  background: #1e293b;
  border-radius: 16px;
  padding: 20px;
  max-width: 320px;
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.mode-details-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.mode-details-icon {
  width: 32px;
  height: 32px;
}

.mode-details-name {
  font-size: 20px;
  font-weight: 700;
}

.mode-details-desc {
  color: #94a3b8;
  font-size: 14px;
  margin: 0 0 16px;
  line-height: 1.5;
}

.mode-details-info {
  background: rgba(51, 65, 85, 0.4);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.mode-details-info p {
  color: #94a3b8;
  font-size: 13px;
  margin: 0;
  line-height: 1.5;
}

/* Панель пояснений по режимам */
.mode-info-panel {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 10px;
  padding: 12px;
}

.mode-info-panel p {
  color: #94a3b8;
  font-size: 12px;
  margin: 0 0 8px;
  line-height: 1.4;
}

.mode-info-panel p:last-child {
  margin-bottom: 0;
}

.mode-info-warning {
  color: #f59e0b !important;
  font-weight: 500;
}

.mode-details-bonuses {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.bonus-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #cbd5e1;
}

.bonus-check {
  color: #22c55e;
  width: 16px;
  height: 16px;
}

.mode-details-close {
  width: 100%;
  padding: 10px;
  background: rgba(51, 65, 85, 0.8);
  border: none;
  border-radius: 8px;
  color: #e2e8f0;
  font-size: 14px;
  cursor: pointer;
}

.mode-details-close:hover {
  background: rgba(71, 85, 105, 0.8);
}

/* Секция проверок */
.checks-section {
  flex-shrink: 0;
}

.checks-table-container {
  display: flex;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

/* Фиксированный столбец аспектов */
.aspects-column {
  flex-shrink: 0;
  width: 110px;
}

.aspect-header-cell {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.checks-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #e2e8f0;
}

.aspect-row-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 40px;
  padding: 0 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  white-space: nowrap;
}

.aspect-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.aspect-name {
  font-weight: 500;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Прокручиваемая область со значениями */
.checks-scroll-area {
  width: calc(100% - 110px); /* 110px = ширина aspects-column */
  overflow-x: scroll;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x;
}

.checks-grid {
  display: inline-flex;
  flex-direction: column;
  min-width: max-content;
}

.diff-headers-row {
  display: flex;
  height: 36px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.diff-header-cell {
  width: 44px;
  min-width: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 12px;
  color: #94a3b8;
  position: relative;
}

/* Границы столбцов через псевдоэлементы */
.diff-header-cell::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--diff-color, transparent);
}

/* Пунктир для "ниже" */
.diff-header-cell.linetype-dashed::before {
  background: repeating-linear-gradient(
    to bottom,
    var(--diff-color) 0px,
    var(--diff-color) 4px,
    transparent 4px,
    transparent 8px
  );
}

/* Сплошная для базовых */
.diff-header-cell.linetype-single::before {
  background: var(--diff-color);
}

/* Крепостная стена для "выше" - сплошная слева, пунктир справа */
.diff-header-cell.linetype-double::before {
  width: 2px;
  background: var(--diff-color);
}
.diff-header-cell.linetype-double::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: repeating-linear-gradient(
    to bottom,
    var(--diff-color) 0px,
    var(--diff-color) 4px,
    transparent 4px,
    transparent 8px
  );
}

.checks-row {
  display: flex;
  height: 40px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.check-cell {
  width: 44px;
  min-width: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  position: relative;
}

/* Границы для ячеек */
.check-cell::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--diff-color, transparent);
}

.check-cell.linetype-dashed::before {
  background: repeating-linear-gradient(
    to bottom,
    var(--diff-color) 0px,
    var(--diff-color) 4px,
    transparent 4px,
    transparent 8px
  );
}

.check-cell.linetype-single::before {
  background: var(--diff-color);
}

.check-cell.linetype-double::before {
  width: 2px;
  background: var(--diff-color);
}
.check-cell.linetype-double::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: repeating-linear-gradient(
    to bottom,
    var(--diff-color) 0px,
    var(--diff-color) 4px,
    transparent 4px,
    transparent 8px
  );
}

/* Цвета ячеек - приглушённые */
.check-cell.auto {
  background: rgba(34, 197, 94, 0.1);
  color: #a3e635; /* лаймово-зелёный, не слишком яркий */
}

.check-cell.roll {
  background: rgba(251, 191, 36, 0.08);
  color: #cbd5e1; /* светло-серый */
}

.check-cell.fail {
  background: rgba(239, 68, 68, 0.08);
  color: #475569; /* тёмно-серый, неактивный */
}

/* Заголовочная карточка */
.header-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: rgba(30, 41, 59, 0.6);
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.header-info {
  flex: 1;
  min-width: 0;
}

.char-name {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 2px;
  word-break: break-word;
}

.char-class {
  font-size: 13px;
  color: #94a3b8;
  margin: 0 0 10px;
}

/* Сетка статов */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.stat-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid;
}

.stat-badge.armor {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.3);
}

.stat-badge.speed {
  background: rgba(6, 182, 212, 0.15);
  border-color: rgba(6, 182, 212, 0.3);
}

.stat-badge.bursts {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.3);
}

.stat-badge.level {
  background: rgba(168, 85, 247, 0.15);
  border-color: rgba(168, 85, 247, 0.3);
}

.stat-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.stat-badge.armor .stat-icon { color: #3b82f6; }
.stat-badge.speed .stat-icon { color: #06b6d4; }
.stat-badge.bursts .stat-icon { color: #f59e0b; }
.stat-badge.level .stat-icon { color: #a855f7; }

.stat-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #94a3b8;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
}

/* Секции */
.section-card {
  padding: 12px;
  background: rgba(30, 41, 59, 0.6);
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #94a3b8;
  margin: 0 0 12px;
}

/* Компактные навыки */
.skills-compact {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 8px;
}

.skill-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
}

.skill-icon {
  width: 16px;
  height: 16px;
}

.skill-bonus {
  font-size: 14px;
  font-weight: 700;
  color: #22c55e;
}

/* Плейсхолдеры */
.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
  color: #64748b;
}

.placeholder-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.placeholder-hint {
  font-size: 12px;
  color: #475569;
  margin-top: 4px;
}

/* Пустое состояние */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #64748b;
}

.empty-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

/* Embedded режим - контент занимает всю высоту */
.mobile-character-sheet.embedded {
  overflow: hidden;
  height: 100%;
}

.mobile-character-sheet.embedded .sheet-content {
  flex: 1;
  overflow-y: auto;
  padding-top: 260px;
  height: 100%;
  box-sizing: border-box;
}
</style>
