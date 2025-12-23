<script setup>
/**
 * ItemPicker - универсальный компонент для выбора/создания предметов
 * Используется:
 * - В инвентаре персонажа (добавление предметов)
 * - В логе сцены (найденные партией предметы)
 * - В редакторе NPC и т.д.
 * 
 * Особенности:
 * - Предметы НЕ исчезают из списка после выбора (можно добавить несколько одинаковых)
 * - Можно создавать кастомные предметы
 * - Фильтрация по категориям и поиску
 */
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import itemsData from '@/data/items.json'
import levelsData from '@/data/levels.json'
import ImagePicker from '@/components/shared/ImagePicker.vue'
import { itemImageUrl } from '@/utils/assets'

const props = defineProps({
  // Режим: 'single' - выбрать один, 'multi' - выбрать несколько
  mode: { type: String, default: 'single' },
  // Заголовок модалки
  title: { type: String, default: 'Выбрать предмет' },
  // Показывать кнопку создания кастомного предмета
  allowCustom: { type: Boolean, default: true },
  // Фильтр категорий (если нужно показать только оружие, например)
  categoryFilter: { type: Array, default: null },
  // Уже выбранные предметы (для multi режима)
  selected: { type: Array, default: () => [] },
  // Использовать внешний редактор для создания кастомных предметов
  useExternalEditor: { type: Boolean, default: true }
})

const emit = defineEmits(['select', 'close', 'create-custom'])

// ===== STATE =====
const searchQuery = ref('')
const activeCategory = ref('all')
const showCustomForm = ref(false)

// Кастомный предмет
const customItem = ref(createEmptyItem())

function createEmptyItem() {
  return {
    id: `custom_${Date.now()}`,
    name: '',
    category: 'weapon',
    subcat: '',
    desc: '',
    length: 1,
    hands: 1,
    price: 1,
    epoch: 1,
    attack: { short: 0, long: 0 },
    defence: 0,
    damageType: 'Режущий',
    armorPen: 0,
    damage: {},
    customImage: null,
    isCustom: true
  }
}

// ===== COMPUTED =====
const allItems = computed(() => itemsData.items || [])

const categories = computed(() => {
  const cats = [
    { id: 'all', label: 'Все', icon: 'mdi:view-grid' },
    { id: 'weapon', label: 'Оружие', icon: 'mdi:sword' },
    { id: 'armor', label: 'Броня', icon: 'mdi:shield-account' },
    { id: 'shield', label: 'Щиты', icon: 'mdi:shield' }
  ]
  // Если есть фильтр категорий - оставляем только их
  if (props.categoryFilter) {
    return cats.filter(c => c.id === 'all' || props.categoryFilter.includes(c.id))
  }
  return cats
})

const filteredItems = computed(() => {
  let items = allItems.value
  
  // Фильтр по категории (из пропса)
  if (props.categoryFilter) {
    items = items.filter(i => props.categoryFilter.includes(i.category))
  }
  
  // Фильтр по выбранной вкладке
  if (activeCategory.value !== 'all') {
    items = items.filter(i => i.category === activeCategory.value)
  }
  
  // Поиск
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    items = items.filter(i => 
      i.name.toLowerCase().includes(q) || 
      i.id.toLowerCase().includes(q) ||
      (i.desc && i.desc.toLowerCase().includes(q))
    )
  }
  
  return items
})

// Подкатегории для группировки
const subcategories = computed(() => {
  const groups = {}
  filteredItems.value.forEach(item => {
    const subcat = item.subcat || 'other'
    if (!groups[subcat]) groups[subcat] = []
    groups[subcat].push(item)
  })
  return groups
})

const subcatLabels = {
  spears: 'Копья и древковое',
  bows: 'Луки',
  crossbows: 'Арбалеты',
  slings: 'Пращи',
  daggers: 'Кинжалы',
  swords: 'Мечи',
  axes: 'Топоры',
  maces: 'Дробящее',
  flails: 'Цепы',
  shields: 'Щиты',
  light: 'Лёгкая броня',
  middle: 'Средняя броня',
  heavy: 'Тяжёлая броня',
  other: 'Прочее'
}

// Уровни урона
const damageLevels = computed(() => levelsData.levels || [])

// ===== METHODS =====
const selectItem = (item) => {
  // Создаём копию предмета с уникальным instanceId
  const itemCopy = {
    ...JSON.parse(JSON.stringify(item)),
    instanceId: `${item.id}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
  }
  emit('select', itemCopy)
  
  if (props.mode === 'single') {
    emit('close')
  }
}

// Обработчик кнопки "Создать свой предмет"
const handleCreateCustom = () => {
  if (props.useExternalEditor) {
    // Используем внешний редактор (в CharacterEquipment)
    emit('create-custom')
  } else {
    // Используем встроенную форму
    showCustomForm.value = true
  }
}

const createCustomItem = () => {
  if (!customItem.value.name.trim()) {
    alert('Введите название предмета')
    return
  }
  
  const item = {
    ...customItem.value,
    id: `custom_${Date.now()}`,
    instanceId: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
  }
  
  emit('select', item)
  
  // Сбрасываем форму
  customItem.value = createEmptyItem()
  showCustomForm.value = false
  
  if (props.mode === 'single') {
    emit('close')
  }
}

const cancelCustom = () => {
  customItem.value = createEmptyItem()
  showCustomForm.value = false
}

// Формат модификатора атаки
const formatAttack = (val) => {
  if (val === undefined || val === null) return '—'
  return val >= 0 ? `+${val}` : String(val)
}

// Изменение урона в кастомном предмете
const adjustCustomDamage = (levelKey, delta) => {
  const current = customItem.value.damage[levelKey]
  if (current === undefined) {
    if (delta > 0) customItem.value.damage[levelKey] = 0
  } else {
    const newVal = current + delta
    if (newVal < 0) {
      delete customItem.value.damage[levelKey]
    } else {
      customItem.value.damage[levelKey] = newVal
    }
  }
}

// Изменение атаки в кастомном предмете
const adjustCustomAttack = (field, delta) => {
  if (!customItem.value.attack) customItem.value.attack = {}
  const current = customItem.value.attack[field]
  if (current === undefined) {
    if (delta !== 0) customItem.value.attack[field] = delta > 0 ? 0 : -1
  } else {
    customItem.value.attack[field] = current + delta
  }
}

const clearCustomAttack = (field) => {
  if (customItem.value.attack) {
    delete customItem.value.attack[field]
  }
}

// Выбор изображения для кастомного предмета
const onCustomImageSelected = (imageData) => {
  customItem.value.customImage = imageData
}
</script>

<template>
  <div class="item-picker-overlay" @click="$emit('close')">
    <div class="item-picker" @click.stop>
      <!-- Header -->
      <div class="picker-header">
        <h3>{{ showCustomForm ? 'Создать предмет' : title }}</h3>
        <button class="close-btn" @click="$emit('close')"><Icon icon="mdi:close" /></button>
      </div>
      
      <!-- Форма создания кастомного предмета -->
      <div v-if="showCustomForm" class="custom-form">
        <div class="form-scroll">
          <!-- Основные данные -->
          <div class="form-section">
            <label class="form-label">Название</label>
            <input v-model="customItem.name" class="form-input" placeholder="Название предмета" />
          </div>
          
          <div class="form-row">
            <div class="form-section flex-1">
              <label class="form-label">Категория</label>
              <select v-model="customItem.category" class="form-select">
                <option value="weapon">Оружие</option>
                <option value="armor">Броня</option>
                <option value="shield">Щит</option>
              </select>
            </div>
            <div class="form-section flex-1">
              <label class="form-label">Тип урона</label>
              <select v-model="customItem.damageType" class="form-select">
                <option>Режущий</option>
                <option>Колющий</option>
                <option>Дробящий</option>
                <option>Рубящий</option>
              </select>
            </div>
          </div>
          
          <div class="form-section">
            <label class="form-label">Описание</label>
            <textarea v-model="customItem.desc" class="form-textarea" placeholder="Описание предмета..." rows="2"></textarea>
          </div>
          
          <!-- Характеристики оружия -->
          <template v-if="customItem.category === 'weapon'">
            <div class="form-row">
              <div class="form-section flex-1">
                <label class="form-label">Длина</label>
                <select v-model.number="customItem.length" class="form-select">
                  <option :value="1">Короткое (1)</option>
                  <option :value="2">Длинное (2)</option>
                </select>
              </div>
              <div class="form-section flex-1">
                <label class="form-label">Руки</label>
                <select v-model.number="customItem.hands" class="form-select">
                  <option :value="0.5">Половина (0.5)</option>
                  <option :value="1">Одна (1)</option>
                  <option :value="1.5">Полторы (1.5)</option>
                  <option :value="2">Две (2)</option>
                </select>
              </div>
            </div>
            
            <div class="form-row">
              <div class="form-section flex-1">
                <label class="form-label">Защита</label>
                <input v-model.number="customItem.defence" type="number" class="form-input" />
              </div>
              <div class="form-section flex-1">
                <label class="form-label">Пробитие</label>
                <input v-model.number="customItem.armorPen" type="number" class="form-input" />
              </div>
            </div>
            
            <!-- Атака -->
            <div class="form-section">
              <label class="form-label">Модификаторы атаки</label>
              <div class="attack-row">
                <div class="attack-field">
                  <span class="attack-label"><Icon icon="mdi:knife" />Ближ.</span>
                  <div class="stepper">
                    <button @click="adjustCustomAttack('short', -1)">−</button>
                    <span class="value" @dblclick="clearCustomAttack('short')">
                      {{ customItem.attack?.short !== undefined ? formatAttack(customItem.attack.short) : '—' }}
                    </span>
                    <button @click="adjustCustomAttack('short', 1)">+</button>
                  </div>
                </div>
                <div class="attack-field">
                  <span class="attack-label"><Icon icon="mdi:spear" />Дальн.</span>
                  <div class="stepper">
                    <button @click="adjustCustomAttack('long', -1)">−</button>
                    <span class="value" @dblclick="clearCustomAttack('long')">
                      {{ customItem.attack?.long !== undefined ? formatAttack(customItem.attack.long) : '—' }}
                    </span>
                    <button @click="adjustCustomAttack('long', 1)">+</button>
                  </div>
                </div>
                <div class="attack-field">
                  <span class="attack-label"><Icon icon="mdi:bow-arrow" />Стрел.</span>
                  <div class="stepper">
                    <button @click="adjustCustomAttack('ranged', -1)">−</button>
                    <span class="value" @dblclick="clearCustomAttack('ranged')">
                      {{ customItem.attack?.ranged !== undefined ? formatAttack(customItem.attack.ranged) : '—' }}
                    </span>
                    <button @click="adjustCustomAttack('ranged', 1)">+</button>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Урон -->
            <div class="form-section">
              <label class="form-label">Пороги урона</label>
              <div class="damage-grid">
                <div 
                  v-for="level in damageLevels" 
                  :key="level.key" 
                  class="damage-level"
                  :class="{ active: customItem.damage[level.key] !== undefined }"
                  :style="{ '--level-color': level.color }"
                >
                  <div class="level-header" :style="{ background: level.color + '30' }">
                    {{ level.short }}
                  </div>
                  <div class="level-stepper">
                    <button @click="adjustCustomDamage(level.key, -1)">−</button>
                    <span class="value">
                      {{ customItem.damage[level.key] !== undefined ? customItem.damage[level.key] : '—' }}
                    </span>
                    <button @click="adjustCustomDamage(level.key, 1)">+</button>
                  </div>
                </div>
              </div>
            </div>
          </template>
          
          <!-- Характеристики брони -->
          <template v-if="customItem.category === 'armor'">
            <div class="form-row">
              <div class="form-section flex-1">
                <label class="form-label">Защита</label>
                <input v-model.number="customItem.defence" type="number" class="form-input" />
              </div>
              <div class="form-section flex-1">
                <label class="form-label">Резист</label>
                <input v-model.number="customItem.resist" type="number" class="form-input" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-section flex-1">
                <label class="form-label">Движение</label>
                <input v-model.number="customItem.movement" type="number" class="form-input" />
              </div>
              <div class="form-section flex-1">
                <label class="form-label">Порывы</label>
                <input v-model.number="customItem.bursts" type="number" class="form-input" />
              </div>
            </div>
          </template>
          
          <!-- Характеристики щита -->
          <template v-if="customItem.category === 'shield'">
            <div class="form-section">
              <label class="form-label">Защита (простая)</label>
              <input v-model.number="customItem.defence" type="number" class="form-input" />
              <span class="form-hint">Или используйте редактор предмета после добавления для сложной защиты</span>
            </div>
          </template>
          
          <!-- Изображение -->
          <div class="form-section">
            <label class="form-label">Изображение</label>
            <ImagePicker 
              :value="customItem.customImage"
              @update:value="onCustomImageSelected"
              placeholder="Выбрать изображение"
            />
          </div>
        </div>
        
        <!-- Кнопки -->
        <div class="form-actions">
          <button class="btn cancel" @click="cancelCustom">Отмена</button>
          <button class="btn primary" @click="createCustomItem">
            <Icon icon="mdi:plus" />Создать
          </button>
        </div>
      </div>
      
      <!-- Список предметов -->
      <template v-else>
        <!-- Поиск и фильтры -->
        <div class="picker-filters">
          <div class="search-box">
            <Icon icon="mdi:magnify" class="search-icon" />
            <input v-model="searchQuery" placeholder="Поиск..." class="search-input" />
            <button v-if="searchQuery" class="clear-search" @click="searchQuery = ''">
              <Icon icon="mdi:close" />
            </button>
          </div>
          
          <div class="category-tabs">
            <button 
              v-for="cat in categories" 
              :key="cat.id" 
              class="cat-tab"
              :class="{ active: activeCategory === cat.id }"
              @click="activeCategory = cat.id"
            >
              <Icon :icon="cat.icon" />
              <span>{{ cat.label }}</span>
            </button>
          </div>
        </div>
        
        <!-- Список -->
        <div class="picker-content">
          <div v-if="filteredItems.length === 0" class="empty-state">
            <Icon icon="mdi:package-variant-remove" />
            <span>Ничего не найдено</span>
          </div>
          
          <template v-else>
            <div v-for="(items, subcat) in subcategories" :key="subcat" class="item-group">
              <div class="group-header">{{ subcatLabels[subcat] || subcat }}</div>
              <div class="items-grid">
                <div 
                  v-for="item in items" 
                  :key="item.id" 
                  class="item-card"
                  @click="selectItem(item)"
                >
                  <div class="item-img">
                    <img :src="itemImageUrl(item.id)" :alt="item.name" />
                  </div>
                  <div class="item-info">
                    <span class="item-name">{{ item.name }}</span>
                    <div class="item-stats">
                      <span v-if="item.attack?.short !== undefined" class="stat atk">
                        <Icon icon="mdi:knife" />{{ formatAttack(item.attack.short) }}
                      </span>
                      <span v-if="item.attack?.long !== undefined" class="stat atk">
                        <Icon icon="mdi:spear" />{{ formatAttack(item.attack.long) }}
                      </span>
                      <span v-if="item.defence && typeof item.defence === 'number'" class="stat def">
                        <Icon icon="mdi:shield" />{{ item.defence }}
                      </span>
                      <span v-if="item.resist" class="stat res">
                        <Icon icon="mdi:water" />{{ item.resist }}
                      </span>
                    </div>
                  </div>
                  <Icon icon="mdi:plus-circle" class="add-icon" />
                </div>
              </div>
            </div>
          </template>
        </div>
        
        <!-- Кнопка создания кастомного -->
        <div v-if="allowCustom" class="picker-footer">
          <button class="create-custom-btn" @click="handleCreateCustom">
            <Icon icon="mdi:plus" />
            Создать свой предмет
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style>
/* Overlay должен быть без scoped чтобы работать с Teleport */
.item-picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 1rem;
}
</style>

<style scoped>
.item-picker {
  width: 100%;
  max-width: 560px;
  max-height: 85vh;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 0.75rem;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: rgba(30, 41, 59, 0.5);
  border-bottom: 1px solid rgba(100, 116, 139, 0.2);
}

.picker-header h3 {
  margin: 0;
  font-size: 1rem;
  color: #e2e8f0;
}

.close-btn {
  width: 28px;
  height: 28px;
  background: rgba(100, 116, 139, 0.2);
  border: none;
  border-radius: 0.25rem;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.close-btn:hover { background: rgba(248, 113, 113, 0.3); color: #f87171; }

/* Filters */
.picker-filters {
  padding: 0.75rem;
  border-bottom: 1px solid rgba(100, 116, 139, 0.15);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 0.75rem;
  color: #64748b;
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: 0.5rem 2rem 0.5rem 2.25rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(100, 116, 139, 0.25);
  border-radius: 0.375rem;
  color: #e2e8f0;
  font-size: 0.85rem;
}
.search-input:focus { outline: none; border-color: rgba(56, 189, 248, 0.5); }
.search-input::placeholder { color: #64748b; }
.clear-search {
  position: absolute;
  right: 0.5rem;
  width: 20px;
  height: 20px;
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.category-tabs {
  display: flex;
  gap: 0.25rem;
  overflow-x: auto;
  scrollbar-width: none;
}
.category-tabs::-webkit-scrollbar { display: none; }

.cat-tab {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.75rem;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(100, 116, 139, 0.25);
  border-radius: 1rem;
  color: #94a3b8;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}
.cat-tab:hover { border-color: rgba(56, 189, 248, 0.4); color: #e2e8f0; }
.cat-tab.active { 
  background: rgba(56, 189, 248, 0.15); 
  border-color: rgba(56, 189, 248, 0.5); 
  color: #38bdf8; 
}

/* Content */
.picker-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: #64748b;
  gap: 0.5rem;
}
.empty-state svg { width: 48px; height: 48px; opacity: 0.3; }

.item-group {
  margin-bottom: 1rem;
}

.group-header {
  font-size: 0.7rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.35rem;
}

.items-grid {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.item-card {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: rgba(30, 41, 59, 0.4);
  border: 1px solid rgba(100, 116, 139, 0.15);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}
.item-card:hover {
  background: rgba(56, 189, 248, 0.1);
  border-color: rgba(56, 189, 248, 0.3);
}

.item-card .item-img {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.item-card .item-img img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.item-card .item-info {
  flex: 1;
  min-width: 0;
}
.item-card .item-name {
  display: block;
  font-size: 0.85rem;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item-card .item-stats {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.15rem;
}
.item-card .stat {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  font-size: 0.7rem;
  color: #94a3b8;
}
.item-card .stat svg { width: 12px; height: 12px; }
.item-card .stat.atk { color: #f87171; }
.item-card .stat.def { color: #34d399; }
.item-card .stat.res { color: #60a5fa; }

.item-card .add-icon {
  width: 24px;
  height: 24px;
  color: #10b981;
  opacity: 0;
  transition: opacity 0.15s;
}
.item-card:hover .add-icon { opacity: 1; }

/* Footer */
.picker-footer {
  padding: 0.75rem;
  border-top: 1px solid rgba(100, 116, 139, 0.15);
}

.create-custom-btn {
  width: 100%;
  padding: 0.6rem 1rem;
  background: rgba(139, 92, 246, 0.15);
  border: 1px solid rgba(139, 92, 246, 0.4);
  border-radius: 0.375rem;
  color: #a78bfa;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.15s;
}
.create-custom-btn:hover {
  background: rgba(139, 92, 246, 0.25);
  border-color: rgba(139, 92, 246, 0.6);
}

/* ===== Custom Form ===== */
.custom-form {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.form-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-row {
  display: flex;
  gap: 0.75rem;
}
.flex-1 { flex: 1; }

.form-label {
  font-size: 0.7rem;
  color: #64748b;
  text-transform: uppercase;
}

.form-input, .form-select, .form-textarea {
  padding: 0.5rem 0.75rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(100, 116, 139, 0.25);
  border-radius: 0.375rem;
  color: #e2e8f0;
  font-size: 0.85rem;
}
.form-input:focus, .form-select:focus, .form-textarea:focus {
  outline: none;
  border-color: rgba(56, 189, 248, 0.5);
}
.form-textarea { resize: vertical; min-height: 60px; }
.form-hint {
  font-size: 0.65rem;
  color: #64748b;
  font-style: italic;
}

/* Attack row */
.attack-row {
  display: flex;
  gap: 0.5rem;
}
.attack-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}
.attack-label {
  font-size: 0.65rem;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 0.2rem;
}
.attack-label svg { width: 12px; height: 12px; }

.stepper {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.stepper button {
  width: 24px;
  height: 24px;
  background: rgba(100, 116, 139, 0.2);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 0.25rem;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
}
.stepper button:hover { background: rgba(56, 189, 248, 0.2); color: #e2e8f0; }
.stepper .value {
  min-width: 32px;
  text-align: center;
  font-size: 0.85rem;
  color: #e2e8f0;
  cursor: pointer;
}

/* Damage grid */
.damage-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.25rem;
}

.damage-level {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(100, 116, 139, 0.2);
  border-radius: 0.25rem;
  overflow: hidden;
  opacity: 0.5;
  transition: all 0.15s;
}
.damage-level.active {
  opacity: 1;
  border-color: var(--level-color);
}

.damage-level .level-header {
  padding: 0.2rem;
  text-align: center;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--level-color);
}

.damage-level .level-stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.15rem;
  background: rgba(15, 23, 42, 0.5);
}
.damage-level .level-stepper button {
  width: 18px;
  height: 18px;
  padding: 0;
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  font-size: 0.9rem;
}
.damage-level .level-stepper button:hover { color: #e2e8f0; }
.damage-level .level-stepper .value {
  font-size: 0.75rem;
  color: #e2e8f0;
}

/* Form actions */
.form-actions {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid rgba(100, 116, 139, 0.15);
}

.btn {
  flex: 1;
  padding: 0.6rem 1rem;
  border-radius: 0.375rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  transition: all 0.15s;
}
.btn.cancel {
  background: rgba(100, 116, 139, 0.15);
  border: 1px solid rgba(100, 116, 139, 0.3);
  color: #94a3b8;
}
.btn.cancel:hover { background: rgba(100, 116, 139, 0.25); color: #e2e8f0; }
.btn.primary {
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.5);
  color: #10b981;
}
.btn.primary:hover { background: rgba(16, 185, 129, 0.3); }
</style>
