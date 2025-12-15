<script setup>
/**
 * NpcCreator - компонент для создания и редактирования NPC/монстров мастером
 * 
 * Функционал:
 * - Ручное создание характеристик (любые значения)
 * - Настройка здоровья (HP или система ранений)
 * - Выбор навыков из списка + создание кастомных
 * - Портрет для токена + галерея изображений для визуализации
 * - Шаблоны с рандомизацией параметров
 * - Редактирование, копирование, удаление
 */
import { ref, computed, watch, reactive } from 'vue'
import { Icon } from '@iconify/vue'
import { useCharactersStore } from '@/stores/characters'
import npcTemplatesData from '@/data/npcTemplates.json'
import classesData from '@/data/classes.json'
import aspectsData from '@/data/aspects.json'

const props = defineProps({
  /** Режим: 'create' | 'edit' */
  mode: { type: String, default: 'create' },
  /** ID NPC для редактирования */
  npcId: { type: String, default: null },
  /** Данные NPC для редактирования (альтернатива npcId) */
  initialData: { type: Object, default: null }
})

const emit = defineEmits(['close', 'created', 'updated', 'deleted'])

const charactersStore = useCharactersStore()

// === ДАННЫЕ ===
const categories = npcTemplatesData.categories
const difficulties = npcTemplatesData.difficulties
const templates = npcTemplatesData.templates
const aspects = aspectsData.aspects

// Собираем все навыки (traits) из всех классов и аспектов
const allSkills = computed(() => {
  const skills = []
  
  // Навыки из классов
  classesData.classes.forEach(cls => {
    if (cls.traits) {
      cls.traits.forEach(trait => {
        skills.push({
          id: trait.id,
          name: trait.name,
          sourceType: 'class',
          sourceId: cls.id,
          sourceName: typeof cls.name === 'object' ? cls.name.m : cls.name,
          maxLevel: trait.levels?.length || 1,
          levels: trait.levels?.map((l, i) => ({
            level: i + 1,
            description: l.text || l.description || ''
          })) || []
        })
      })
    }
  })
  
  // Навыки из аспектов (исключаем временные)
  aspects.forEach(aspect => {
    if (aspect.traits) {
      aspect.traits.forEach(trait => {
        // Пропускаем если ID содержит "temp" или "temporary" 
        if (trait.id?.toLowerCase().includes('temp')) return
        
        skills.push({
          id: `${aspect.id}_${trait.id}`,
          name: trait.name,
          sourceType: 'aspect',
          sourceId: aspect.id,
          sourceName: aspect.name,
          aspectColor: aspect.color,
          maxLevel: trait.levels?.length || 1,
          levels: trait.levels?.map((l, i) => ({
            level: i + 1,
            description: l.text || l.description || ''
          })) || []
        })
      })
    }
  })
  
  return skills
})

// Доступные фракции (можно расширить или загружать из JSON)
const availableFactions = ref([
  { id: 'player', name: 'Игроки', color: '#22c55e' },
  { id: 'enemy', name: 'Враги', color: '#ef4444' },
  { id: 'neutral', name: 'Нейтральные', color: '#94a3b8' },
  { id: 'wildlife', name: 'Дикие звери', color: '#f59e0b' },
  { id: 'undead', name: 'Нежить', color: '#8b5cf6' },
  { id: 'guards', name: 'Стража', color: '#3b82f6' },
  { id: 'bandits', name: 'Бандиты', color: '#dc2626' },
  { id: 'merchants', name: 'Торговцы', color: '#eab308' }
])

// Аспекты для характеристик (основные 6 аспектов)
const statAspects = computed(() => aspects.filter(a => 
  ['war', 'knowledge', 'community', 'shadow', 'mysticism', 'nature'].includes(a.id)
))

// === ФОРМА ===
const form = reactive({
  // Базовая информация
  name: '',
  category: 'humanoid',
  difficulty: 'regular',
  factions: ['enemy'], // массив тегов фракций
  description: '',
  
  // Портрет (для токена на карте)
  portrait: null,
  
  // Галерея изображений (для визуализации игрокам)
  images: [],
  
  // Характеристики
  stats: {
    war: 0,
    knowledge: 0,
    community: 0,
    shadow: 0,
    mysticism: 0,
    nature: 0
  },
  
  // Здоровье
  healthType: 'simple', // simple | wounds
  hp: 10,
  maxHp: 10,
  wounds: {
    scratch: { current: 0, max: 3 },
    light: { current: 0, max: 2 },
    heavy: { current: 0, max: 2 },
    deadly: { current: 0, max: 1 }
  },
  bonusDeadlySlots: 0,
  
  // Навыки
  skills: [], // [{ id, level, isCustom?, customData? }]
  
  // Естественное оружие (для монстров)
  naturalWeapons: [], // [{ name, damage, type, description }]
  
  // Экипировка
  equipment: {
    armor: 'none',
    weapons: [],
    items: []
  },
  
  // Видимость
  visibleToPlayers: true
})

// Активная вкладка
const activeTab = ref('basic') // basic, stats, health, skills, images

// Поле ввода для портрета
const portraitInput = ref('')

// Состояние для добавления кастомного навыка
const showCustomSkillModal = ref(false)
const customSkill = reactive({
  name: '',
  description: '',
  aspectId: null,
  maxLevel: 1,
  levels: [{ level: 1, description: '' }]
})

// Состояние для добавления естественного оружия
const showNaturalWeaponModal = ref(false)
const naturalWeapon = reactive({
  name: '',
  damage: '1d6',
  type: 'slashing',
  description: ''
})

// === ИНИЦИАЛИЗАЦИЯ ===
if (props.mode === 'edit' && props.initialData) {
  Object.assign(form, props.initialData)
}

// === ВЫЧИСЛЯЕМЫЕ ===
const categoryInfo = computed(() => categories.find(c => c.id === form.category))
const difficultyInfo = computed(() => difficulties.find(d => d.id === form.difficulty))

const isValid = computed(() => {
  return form.name.trim().length > 0
})

// Навыки для выбора (исключая уже добавленные)
const availableSkills = computed(() => {
  const addedIds = new Set(form.skills.map(s => s.id))
  return allSkills.value.filter(s => !addedIds.has(s.id))
})

// === МЕТОДЫ ===

// Применить шаблон
const applyTemplate = (templateId) => {
  const template = templates.find(t => t.id === templateId)
  if (!template) return
  
  form.name = template.name
  form.category = template.category
  form.difficulty = template.difficulty
  form.description = template.description || ''
  form.portrait = template.portrait
  form.images = [...(template.images || [])]
  
  // Рандомизация характеристик
  Object.keys(template.stats).forEach(stat => {
    const range = template.stats[stat]
    form.stats[stat] = randomInRange(range.min, range.max)
  })
  
  // Здоровье
  if (template.health) {
    form.healthType = template.health.type || 'simple'
    if (template.health.hp) {
      const hp = randomInRange(template.health.hp.min, template.health.hp.max)
      form.hp = hp
      form.maxHp = hp
    }
  }
  
  // Навыки
  form.skills = (template.skills || []).map(s => ({ ...s }))
  
  // Естественное оружие
  form.naturalWeapons = (template.naturalWeapons || []).map(w => ({ ...w }))
}

// Случайное число в диапазоне
const randomInRange = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Изменить характеристику
const changeStat = (statId, delta) => {
  const newValue = form.stats[statId] + delta
  if (newValue >= -5 && newValue <= 10) {
    form.stats[statId] = newValue
  }
}

// Переключить фракцию
const toggleFaction = (factionId) => {
  const index = form.factions.indexOf(factionId)
  if (index >= 0) {
    form.factions.splice(index, 1)
  } else {
    form.factions.push(factionId)
  }
}

// Добавить кастомную фракцию
const addCustomFaction = (name) => {
  if (!name.trim()) return
  const id = 'custom_' + name.toLowerCase().replace(/\s+/g, '_')
  // Добавляем в список доступных, если ещё нет
  if (!availableFactions.value.find(f => f.id === id)) {
    const colors = ['#f97316', '#10b981', '#6366f1', '#ec4899', '#14b8a6', '#a855f7']
    const color = colors[availableFactions.value.length % colors.length]
    availableFactions.value.push({ id, name: name.trim(), color })
  }
  // Добавляем в выбранные
  if (!form.factions.includes(id)) {
    form.factions.push(id)
  }
}

// Добавить навык
const addSkill = (skillId) => {
  const skill = allSkills.value.find(s => s.id === skillId)
  if (skill) {
    form.skills.push({ id: skillId, level: 1 })
  }
}

// Удалить навык
const removeSkill = (index) => {
  form.skills.splice(index, 1)
}

// Изменить уровень навыка
const changeSkillLevel = (index, delta) => {
  const skill = form.skills[index]
  const skillData = allSkills.value.find(s => s.id === skill.id)
  const maxLevel = skill.isCustom ? (skill.customData?.maxLevel || 3) : (skillData?.maxLevel || 3)
  
  const newLevel = skill.level + delta
  if (newLevel >= 1 && newLevel <= maxLevel) {
    form.skills[index].level = newLevel
  }
}

// Добавить кастомный навык
const addCustomSkill = () => {
  if (!customSkill.name.trim()) return
  
  const customId = 'custom_' + Date.now()
  form.skills.push({
    id: customId,
    level: 1,
    isCustom: true,
    customData: {
      name: customSkill.name,
      description: customSkill.description,
      aspectId: customSkill.aspectId,
      maxLevel: customSkill.maxLevel,
      levels: customSkill.levels.map(l => ({ ...l }))
    }
  })
  
  // Сброс формы
  customSkill.name = ''
  customSkill.description = ''
  customSkill.aspectId = null
  customSkill.maxLevel = 1
  customSkill.levels = [{ level: 1, description: '' }]
  showCustomSkillModal.value = false
}

// Добавить естественное оружие
const addNaturalWeapon = () => {
  if (!naturalWeapon.name.trim()) return
  
  form.naturalWeapons.push({ ...naturalWeapon })
  
  // Сброс формы
  naturalWeapon.name = ''
  naturalWeapon.damage = '1d6'
  naturalWeapon.type = 'slashing'
  naturalWeapon.description = ''
  showNaturalWeaponModal.value = false
}

// Удалить естественное оружие
const removeNaturalWeapon = (index) => {
  form.naturalWeapons.splice(index, 1)
}

// Добавить изображение
const addImage = (url) => {
  if (url && !form.images.includes(url)) {
    form.images.push(url)
  }
}

// Удалить изображение
const removeImage = (index) => {
  form.images.splice(index, 1)
}

// Установить портрет
const setPortrait = (url) => {
  form.portrait = url
  portraitInput.value = ''
}

// Применить URL портрета из поля ввода
const applyPortraitUrl = () => {
  if (portraitInput.value.trim()) {
    form.portrait = portraitInput.value.trim()
    portraitInput.value = ''
  }
}

// Сохранить NPC
const saveNpc = () => {
  if (!isValid.value) return
  
  const npcData = {
    name: form.name,
    category: form.category,
    difficulty: form.difficulty,
    factions: [...form.factions],
    description: form.description,
    portrait: form.portrait,
    images: [...form.images],
    stats: { ...form.stats },
    combat: {
      healthType: form.healthType,
      hp: form.hp,
      maxHp: form.maxHp,
      wounds: form.healthType === 'wounds' ? { ...form.wounds } : null,
      bonusDeadlySlots: form.bonusDeadlySlots
    },
    skills: form.skills.map(s => ({ ...s })),
    naturalWeapons: form.naturalWeapons.map(w => ({ ...w })),
    equipment: { ...form.equipment },
    visibleToPlayers: form.visibleToPlayers,
    isNpc: true
  }
  
  if (props.mode === 'edit' && props.npcId) {
    charactersStore.updateNpc(props.npcId, npcData)
    emit('updated', { id: props.npcId, ...npcData })
  } else {
    const newNpc = charactersStore.createNpc(npcData)
    emit('created', newNpc)
  }
  
  emit('close')
}

// Удалить NPC
const deleteNpc = () => {
  if (props.mode === 'edit' && props.npcId) {
    charactersStore.deleteNpc(props.npcId)
    emit('deleted', props.npcId)
    emit('close')
  }
}

// Дублировать NPC
const duplicateNpc = () => {
  const npcData = { ...form, name: form.name + ' (копия)' }
  const newNpc = charactersStore.createNpc(npcData)
  emit('created', newNpc)
}

// Получить название навыка
const getSkillName = (skill) => {
  if (skill.isCustom) return skill.customData.name
  const data = allSkills.value.find(s => s.id === skill.id)
  return data?.name || skill.id
}

// Получить описание уровня навыка
const getSkillLevelDescription = (skill) => {
  if (skill.isCustom) {
    // Для кастомных навыков проверяем наличие levels
    const levels = skill.customData?.levels || []
    const levelData = levels.find(l => l.level === skill.level)
    // Если нет описания уровня, возвращаем общее описание навыка
    return levelData?.description || skill.customData?.description || ''
  }
  const data = allSkills.value.find(s => s.id === skill.id)
  return data?.levels?.find(l => l.level === skill.level)?.description || ''
}

// Получить иконку аспекта
const getAspectIcon = (aspectId) => {
  const aspect = aspects.find(a => a.id === aspectId)
  return aspect?.icon || 'mdi:help-circle'
}

// Получить цвет аспекта
const getAspectColor = (aspectId) => {
  const aspect = aspects.find(a => a.id === aspectId)
  return aspect?.color || '#94a3b8'
}

// Закрыть
const handleClose = () => {
  emit('close')
}
</script>

<template>
  <div class="npc-creator">
    <!-- Заголовок -->
    <header class="creator-header">
      <div class="header-left">
        <button class="btn-back" @click="handleClose">
          <Icon icon="mdi:arrow-left" />
        </button>
        <h1 class="header-title">
          {{ mode === 'edit' ? 'Редактирование' : 'Создание' }} NPC
        </h1>
      </div>
      <div class="header-actions">
        <button v-if="mode === 'edit'" class="btn-duplicate" @click="duplicateNpc" title="Дублировать">
          <Icon icon="mdi:content-copy" />
        </button>
        <button v-if="mode === 'edit'" class="btn-delete" @click="deleteNpc" title="Удалить">
          <Icon icon="mdi:delete" />
        </button>
        <button class="btn-save" :disabled="!isValid" @click="saveNpc">
          <Icon icon="mdi:check" />
          <span>Сохранить</span>
        </button>
      </div>
    </header>
    
    <!-- Вкладки -->
    <nav class="tabs">
      <button 
        v-for="tab in [
          { id: 'basic', label: 'Основное', icon: 'mdi:card-account-details' },
          { id: 'stats', label: 'Характеристики', icon: 'mdi:chart-radar' },
          { id: 'health', label: 'Здоровье', icon: 'mdi:heart' },
          { id: 'skills', label: 'Навыки', icon: 'mdi:star' },
          { id: 'images', label: 'Изображения', icon: 'mdi:image-multiple' }
        ]"
        :key="tab.id"
        class="tab"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <Icon :icon="tab.icon" />
        <span>{{ tab.label }}</span>
      </button>
    </nav>
    
    <!-- Контент -->
    <div class="creator-content">
      <!-- Вкладка: Основное -->
      <div v-if="activeTab === 'basic'" class="tab-content">
        <!-- Шаблоны -->
        <section class="section">
          <h3 class="section-title">
            <Icon icon="mdi:file-document-outline" />
            Шаблоны
          </h3>
          <div class="templates-grid">
            <button
              v-for="template in templates"
              :key="template.id"
              class="template-btn"
              @click="applyTemplate(template.id)"
            >
              <span class="template-name">{{ template.name }}</span>
              <span class="template-category">{{ categories.find(c => c.id === template.category)?.name }}</span>
            </button>
          </div>
        </section>
        
        <!-- Имя -->
        <section class="section">
          <label class="field">
            <span class="field-label">Имя</span>
            <input v-model="form.name" type="text" class="field-input" placeholder="Название NPC..." />
          </label>
        </section>
        
        <!-- Категория и сложность -->
        <section class="section section-row">
          <label class="field">
            <span class="field-label">Категория</span>
            <select v-model="form.category" class="field-select">
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </select>
          </label>
          
          <label class="field">
            <span class="field-label">Сложность</span>
            <select v-model="form.difficulty" class="field-select">
              <option v-for="diff in difficulties" :key="diff.id" :value="diff.id">
                {{ diff.name }}
              </option>
            </select>
          </label>
        </section>
        
        <!-- Фракции (теги) -->
        <section class="section">
          <div class="section-header">
            <h3 class="section-title">
              <Icon icon="mdi:flag-variant" />
              Фракции
            </h3>
          </div>
          <p class="section-hint">Выберите одну или несколько фракций для NPC</p>
          <div class="factions-grid">
            <button
              v-for="faction in availableFactions"
              :key="faction.id"
              class="faction-tag"
              :class="{ active: form.factions.includes(faction.id) }"
              :style="{ 
                '--faction-color': faction.color,
                borderColor: form.factions.includes(faction.id) ? faction.color : 'transparent',
                backgroundColor: form.factions.includes(faction.id) ? faction.color + '20' : 'transparent'
              }"
              @click="toggleFaction(faction.id)"
            >
              <span class="faction-dot" :style="{ backgroundColor: faction.color }"></span>
              {{ faction.name }}
            </button>
          </div>
          <!-- Добавить свою фракцию -->
          <div class="add-faction">
            <input 
              type="text" 
              class="field-input" 
              placeholder="Новая фракция..."
              @keyup.enter="e => { addCustomFaction(e.target.value); e.target.value = '' }"
            />
          </div>
        </section>
        
        <!-- Описание -->
        <section class="section">
          <label class="field">
            <span class="field-label">Описание</span>
            <textarea v-model="form.description" class="field-textarea" rows="3" placeholder="Описание NPC..."></textarea>
          </label>
        </section>
        
        <!-- Видимость -->
        <section class="section">
          <label class="checkbox-field">
            <input v-model="form.visibleToPlayers" type="checkbox" />
            <span>Виден игрокам на карте</span>
          </label>
        </section>
      </div>
      
      <!-- Вкладка: Характеристики -->
      <div v-if="activeTab === 'stats'" class="tab-content">
        <section class="section">
          <h3 class="section-title">
            <Icon icon="mdi:chart-radar" />
            Характеристики
          </h3>
          <p class="section-hint">Значения от -5 до +10. Обычные персонажи имеют 0-5.</p>
          
          <div class="stats-grid">
            <div v-for="aspect in statAspects" :key="aspect.id" class="stat-row">
              <div class="stat-info">
                <Icon :icon="aspect.characteristicIcon || aspect.icon" :style="{ color: aspect.color }" />
                <div class="stat-names">
                  <span class="stat-name">{{ aspect.characteristic?.name || aspect.name }}</span>
                  <span class="stat-aspect">{{ aspect.name }}</span>
                </div>
              </div>
              <div class="stat-controls">
                <button class="stat-btn" @click="changeStat(aspect.id, -1)">−</button>
                <span class="stat-value" :class="{ negative: form.stats[aspect.id] < 0, positive: form.stats[aspect.id] > 0 }">
                  {{ form.stats[aspect.id] >= 0 ? '+' : '' }}{{ form.stats[aspect.id] }}
                </span>
                <button class="stat-btn" @click="changeStat(aspect.id, 1)">+</button>
              </div>
            </div>
          </div>
        </section>
      </div>
      
      <!-- Вкладка: Здоровье -->
      <div v-if="activeTab === 'health'" class="tab-content">
        <section class="section">
          <h3 class="section-title">
            <Icon icon="mdi:heart" />
            Система здоровья
          </h3>
          
          <div class="health-type-toggle">
            <button 
              class="health-type-btn" 
              :class="{ active: form.healthType === 'simple' }"
              @click="form.healthType = 'simple'"
            >
              <Icon icon="mdi:heart" />
              <span>Простое HP</span>
            </button>
            <button 
              class="health-type-btn" 
              :class="{ active: form.healthType === 'wounds' }"
              @click="form.healthType = 'wounds'"
            >
              <Icon icon="mdi:bandage" />
              <span>Система ранений</span>
            </button>
          </div>
        </section>
        
        <!-- Простое HP -->
        <section v-if="form.healthType === 'simple'" class="section">
          <div class="hp-editor">
            <label class="field">
              <span class="field-label">Текущее HP</span>
              <input v-model.number="form.hp" type="number" min="0" max="999" class="field-input" />
            </label>
            <span class="hp-divider">/</span>
            <label class="field">
              <span class="field-label">Максимум HP</span>
              <input v-model.number="form.maxHp" type="number" min="1" max="999" class="field-input" />
            </label>
          </div>
        </section>
        
        <!-- Система ранений -->
        <section v-if="form.healthType === 'wounds'" class="section">
          <div class="wounds-editor">
            <div v-for="(wound, type) in form.wounds" :key="type" class="wound-row">
              <span class="wound-label">{{ 
                { scratch: 'Царапины', light: 'Лёгкие', heavy: 'Тяжёлые', deadly: 'Смертельные' }[type] 
              }}</span>
              <div class="wound-controls">
                <input v-model.number="wound.current" type="number" min="0" :max="wound.max" class="wound-input" />
                <span>/</span>
                <input v-model.number="wound.max" type="number" min="0" max="10" class="wound-input" />
              </div>
            </div>
            
            <label class="field mt-4">
              <span class="field-label">Бонусные смертельные слоты</span>
              <input v-model.number="form.bonusDeadlySlots" type="number" min="0" max="10" class="field-input" />
            </label>
          </div>
        </section>
        
        <!-- Естественное оружие -->
        <section class="section">
          <div class="section-header">
            <h3 class="section-title">
              <Icon icon="mdi:paw" />
              Естественное оружие
            </h3>
            <button class="btn-add" @click="showNaturalWeaponModal = true">
              <Icon icon="mdi:plus" />
              Добавить
            </button>
          </div>
          
          <div v-if="form.naturalWeapons.length === 0" class="empty-state">
            Нет естественного оружия
          </div>
          <div v-else class="natural-weapons-list">
            <div v-for="(weapon, index) in form.naturalWeapons" :key="index" class="weapon-item">
              <div class="weapon-info">
                <span class="weapon-name">{{ weapon.name }}</span>
                <span class="weapon-damage">{{ weapon.damage }} ({{ weapon.type }})</span>
              </div>
              <button class="btn-remove" @click="removeNaturalWeapon(index)">
                <Icon icon="mdi:close" />
              </button>
            </div>
          </div>
        </section>
      </div>
      
      <!-- Вкладка: Навыки -->
      <div v-if="activeTab === 'skills'" class="tab-content">
        <section class="section">
          <div class="section-header">
            <h3 class="section-title">
              <Icon icon="mdi:star" />
              Навыки
            </h3>
            <button class="btn-add" @click="showCustomSkillModal = true">
              <Icon icon="mdi:plus" />
              Создать свой
            </button>
          </div>
          
          <!-- Добавленные навыки -->
          <div v-if="form.skills.length > 0" class="skills-list">
            <div v-for="(skill, index) in form.skills" :key="skill.id" class="skill-item">
              <div class="skill-header">
                <span class="skill-name">{{ getSkillName(skill) }}</span>
                <div class="skill-level">
                  <button class="level-btn" @click="changeSkillLevel(index, -1)">−</button>
                  <span>Ур. {{ skill.level }}</span>
                  <button class="level-btn" @click="changeSkillLevel(index, 1)">+</button>
                </div>
                <button class="btn-remove" @click="removeSkill(index)">
                  <Icon icon="mdi:close" />
                </button>
              </div>
              <p class="skill-description">{{ getSkillLevelDescription(skill) }}</p>
            </div>
          </div>
          <div v-else class="empty-state">
            Нет навыков
          </div>
        </section>
        
        <!-- Выбор из существующих -->
        <section class="section">
          <h3 class="section-title">Добавить навык</h3>
          <select class="field-select" @change="e => { addSkill(e.target.value); e.target.value = '' }">
            <option value="">Выберите навык...</option>
            <option v-for="skill in availableSkills" :key="skill.id" :value="skill.id">
              {{ skill.name }}
            </option>
          </select>
        </section>
      </div>
      
      <!-- Вкладка: Изображения -->
      <div v-if="activeTab === 'images'" class="tab-content">
        <!-- Портрет -->
        <section class="section">
          <h3 class="section-title">
            <Icon icon="mdi:account-circle" />
            Портрет (токен на карте)
          </h3>
          <div class="portrait-editor">
            <div class="portrait-preview" :class="{ empty: !form.portrait }">
              <img v-if="form.portrait" :src="form.portrait" alt="Портрет" @error="$event.target.style.display = 'none'" />
              <Icon v-else icon="mdi:account" />
            </div>
            <div class="portrait-actions">
              <input 
                v-model="portraitInput"
                type="text" 
                class="field-input" 
                placeholder="URL изображения..."
                @keyup.enter="applyPortraitUrl"
              />
              <button class="btn-apply" @click="applyPortraitUrl" :disabled="!portraitInput">
                <Icon icon="mdi:check" />
              </button>
              <button v-if="form.portrait" class="btn-clear" @click="form.portrait = null">
                <Icon icon="mdi:close" />
              </button>
            </div>
          </div>
        </section>
        
        <!-- Галерея -->
        <section class="section">
          <div class="section-header">
            <h3 class="section-title">
              <Icon icon="mdi:image-multiple" />
              Галерея (для визуализации игрокам)
            </h3>
          </div>
          
          <div class="gallery-add">
            <input 
              type="text" 
              class="field-input" 
              placeholder="URL изображения..."
              @keyup.enter="e => { addImage(e.target.value); e.target.value = '' }"
            />
          </div>
          
          <div v-if="form.images.length > 0" class="gallery-grid">
            <div v-for="(img, index) in form.images" :key="index" class="gallery-item">
              <img :src="img" alt="Изображение" />
              <button class="gallery-remove" @click="removeImage(index)">
                <Icon icon="mdi:close" />
              </button>
              <button class="gallery-set-portrait" @click="setPortrait(img)" title="Установить как портрет">
                <Icon icon="mdi:account-circle" />
              </button>
            </div>
          </div>
          <div v-else class="empty-state">
            Нет изображений в галерее
          </div>
        </section>
      </div>
    </div>
    
    <!-- Модальное окно: Кастомный навык -->
    <Teleport to="body">
      <div v-if="showCustomSkillModal" class="modal-overlay" @click.self="showCustomSkillModal = false">
        <div class="modal">
          <h3 class="modal-title">Создать навык</h3>
          
          <label class="field">
            <span class="field-label">Название</span>
            <input v-model="customSkill.name" type="text" class="field-input" />
          </label>
          
          <label class="field">
            <span class="field-label">Описание</span>
            <textarea v-model="customSkill.description" class="field-textarea" rows="2"></textarea>
          </label>
          
          <label class="field">
            <span class="field-label">Аспект</span>
            <select v-model="customSkill.aspectId" class="field-select">
              <option :value="null">Без аспекта</option>
              <option v-for="aspect in aspects" :key="aspect.id" :value="aspect.id">
                {{ aspect.name }}
              </option>
            </select>
          </label>
          
          <label class="field">
            <span class="field-label">Макс. уровень</span>
            <input v-model.number="customSkill.maxLevel" type="number" min="1" max="5" class="field-input" />
          </label>
          
          <div class="modal-actions">
            <button class="btn-cancel" @click="showCustomSkillModal = false">Отмена</button>
            <button class="btn-confirm" @click="addCustomSkill">Добавить</button>
          </div>
        </div>
      </div>
    </Teleport>
    
    <!-- Модальное окно: Естественное оружие -->
    <Teleport to="body">
      <div v-if="showNaturalWeaponModal" class="modal-overlay" @click.self="showNaturalWeaponModal = false">
        <div class="modal">
          <h3 class="modal-title">Добавить естественное оружие</h3>
          
          <label class="field">
            <span class="field-label">Название</span>
            <input v-model="naturalWeapon.name" type="text" class="field-input" placeholder="Укус, Когти..." />
          </label>
          
          <label class="field">
            <span class="field-label">Урон</span>
            <input v-model="naturalWeapon.damage" type="text" class="field-input" placeholder="1d6, 2d4..." />
          </label>
          
          <label class="field">
            <span class="field-label">Тип урона</span>
            <select v-model="naturalWeapon.type" class="field-select">
              <option value="slashing">Рубящий</option>
              <option value="piercing">Колющий</option>
              <option value="bludgeoning">Дробящий</option>
              <option value="fire">Огненный</option>
              <option value="cold">Холодный</option>
              <option value="poison">Ядовитый</option>
              <option value="acid">Кислотный</option>
            </select>
          </label>
          
          <label class="field">
            <span class="field-label">Описание</span>
            <textarea v-model="naturalWeapon.description" class="field-textarea" rows="2"></textarea>
          </label>
          
          <div class="modal-actions">
            <button class="btn-cancel" @click="showNaturalWeaponModal = false">Отмена</button>
            <button class="btn-confirm" @click="addNaturalWeapon">Добавить</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.npc-creator {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f172a;
  color: #e2e8f0;
}

/* Header */
.creator-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: #1e293b;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-back {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-back:hover {
  background: rgba(148, 163, 184, 0.1);
  color: #e2e8f0;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.btn-duplicate, .btn-delete {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-duplicate:hover {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
  border-color: rgba(59, 130, 246, 0.4);
}

.btn-delete:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.4);
}

.btn-save {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #22c55e;
  border: none;
  border-radius: 8px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-save:hover:not(:disabled) {
  background: #16a34a;
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Tabs */
.tabs {
  display: flex;
  gap: 4px;
  padding: 12px 20px;
  background: #1e293b;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  overflow-x: auto;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #94a3b8;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s;
}

.tab:hover {
  background: rgba(148, 163, 184, 0.1);
  color: #e2e8f0;
}

.tab.active {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}

/* Content */
.creator-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.tab-content {
  max-width: 800px;
}

/* Sections */
.section {
  margin-bottom: 24px;
}

.section-row {
  display: flex;
  gap: 16px;
}

.section-row .field {
  flex: 1;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-hint {
  font-size: 12px;
  color: #64748b;
  margin: -8px 0 12px;
}

/* Fields */
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  color: #94a3b8;
}

.field-input, .field-select, .field-textarea {
  padding: 10px 12px;
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  color: #e2e8f0;
  font-size: 14px;
  transition: border-color 0.15s;
}

.field-input:focus, .field-select:focus, .field-textarea:focus {
  outline: none;
  border-color: #3b82f6;
}

.field-textarea {
  resize: vertical;
  min-height: 60px;
}

.checkbox-field {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-field input {
  width: 18px;
  height: 18px;
}

/* Templates */
.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}

.template-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px;
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  color: #e2e8f0;
  cursor: pointer;
  transition: all 0.15s;
}

.template-btn:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.4);
}

.template-name {
  font-size: 13px;
  font-weight: 500;
}

.template-category {
  font-size: 11px;
  color: #64748b;
}

/* Stats */
.stats-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: #1e293b;
  border-radius: 8px;
}

.stat-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stat-info .iconify {
  font-size: 20px;
}

.stat-names {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-name {
  font-size: 14px;
  font-weight: 500;
}

.stat-aspect {
  font-size: 11px;
  color: #64748b;
}

.stat-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(148, 163, 184, 0.1);
  border: none;
  border-radius: 6px;
  color: #94a3b8;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s;
}

.stat-btn:hover {
  background: rgba(59, 130, 246, 0.3);
  color: #3b82f6;
}

.stat-value {
  width: 40px;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  font-family: monospace;
}

.stat-value.negative { color: #ef4444; }
.stat-value.positive { color: #22c55e; }

/* Health */
.health-type-toggle {
  display: flex;
  gap: 8px;
}

.health-type-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s;
}

.health-type-btn.active {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
  color: #3b82f6;
}

.hp-editor {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.hp-editor .field {
  flex: 1;
}

.hp-divider {
  font-size: 24px;
  color: #64748b;
  padding-bottom: 8px;
}

.wounds-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wound-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: #1e293b;
  border-radius: 8px;
}

.wound-label {
  font-size: 14px;
}

.wound-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wound-input {
  width: 50px;
  padding: 6px;
  background: #0f172a;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  color: #e2e8f0;
  text-align: center;
}

/* Skills */
.skills-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skill-item {
  padding: 12px;
  background: #1e293b;
  border-radius: 8px;
}

.skill-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.skill-name {
  flex: 1;
  font-weight: 500;
}

.skill-level {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #94a3b8;
}

.level-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(148, 163, 184, 0.1);
  border: none;
  border-radius: 4px;
  color: #94a3b8;
  cursor: pointer;
}

.level-btn:hover {
  background: rgba(59, 130, 246, 0.3);
  color: #3b82f6;
}

.skill-description {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

/* Natural Weapons */
.natural-weapons-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.weapon-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: #1e293b;
  border-radius: 8px;
}

.weapon-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.weapon-name {
  font-weight: 500;
}

.weapon-damage {
  font-size: 12px;
  color: #64748b;
}

/* Buttons */
.btn-add {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: rgba(59, 130, 246, 0.2);
  border: none;
  border-radius: 6px;
  color: #3b82f6;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-add:hover {
  background: rgba(59, 130, 246, 0.3);
}

.btn-remove {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  transition: color 0.15s;
}

.btn-remove:hover {
  color: #ef4444;
}

/* Portrait & Gallery */
.portrait-editor {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.portrait-preview {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #1e293b;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.portrait-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.portrait-preview.empty {
  color: #64748b;
  font-size: 32px;
}

.portrait-actions {
  flex: 1;
  display: flex;
  gap: 8px;
}

.btn-clear {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.2);
  border: none;
  border-radius: 8px;
  color: #ef4444;
  cursor: pointer;
}

.btn-apply {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(34, 197, 94, 0.2);
  border: none;
  border-radius: 8px;
  color: #22c55e;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-apply:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.3);
}

.btn-apply:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.gallery-add {
  margin-bottom: 16px;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}

.gallery-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: #1e293b;
}

.gallery-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.gallery-remove, .gallery-set-portrait {
  position: absolute;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}

.gallery-remove {
  top: 4px;
  right: 4px;
}

.gallery-set-portrait {
  bottom: 4px;
  right: 4px;
}

.gallery-item:hover .gallery-remove,
.gallery-item:hover .gallery-set-portrait {
  opacity: 1;
}

.gallery-remove:hover {
  background: rgba(239, 68, 68, 0.8);
}

.gallery-set-portrait:hover {
  background: rgba(59, 130, 246, 0.8);
}

/* Empty state */
.empty-state {
  padding: 24px;
  text-align: center;
  color: #64748b;
  background: #1e293b;
  border-radius: 8px;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.modal {
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  padding: 24px;
  width: 100%;
  max-width: 400px;
}

.modal-title {
  margin: 0 0 20px;
  font-size: 18px;
  font-weight: 600;
}

.modal .field {
  margin-bottom: 16px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.btn-cancel, .btn-confirm {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-cancel {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #94a3b8;
}

.btn-cancel:hover {
  background: rgba(148, 163, 184, 0.1);
}

.btn-confirm {
  background: #3b82f6;
  border: none;
  color: white;
}

.btn-confirm:hover {
  background: #2563eb;
}

/* Factions */
.factions-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.faction-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 16px;
  border: 1px solid transparent;
  background: rgba(30, 41, 59, 0.5);
  color: #e2e8f0;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.faction-tag:hover {
  background: rgba(51, 65, 85, 0.5);
}

.faction-tag.active {
  color: #fff;
}

.faction-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.add-faction {
  margin-top: 8px;
}

.add-faction .field-input {
  max-width: 250px;
}

.mt-4 { margin-top: 16px; }
</style>
