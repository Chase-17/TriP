<script setup>
import { ref, computed } from 'vue'
import itemsData from '@/data/items.json'
import { itemImageUrl } from '@/utils/assets'

const props = defineProps({
  character: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['update:character', 'equip-item'])

// Категории предметов
const categories = [
  { id: 'all', name: 'Всё', icon: '📦' },
  { id: 'weapon', name: 'Оружие', icon: '⚔️' },
  { id: 'shield', name: 'Щиты', icon: '🛡️' },
  { id: 'armor', name: 'Броня', icon: '🦺' },
  { id: 'special', name: 'Особые', icon: '✨' },
  { id: 'quest', name: 'Квестовые', icon: '📜' }
]

const activeCategory = ref('all')
const showAddItemModal = ref(false)
const showItemDetailModal = ref(false)
const selectedItemDetail = ref(null)
const searchQuery = ref('')

// Получаем все предметы персонажа (экипированные + в инвентаре)
const allCharacterItems = computed(() => {
  const items = new Set()
  
  // Экипированная броня
  if (props.character.equipment?.armor) {
    items.add(props.character.equipment.armor)
  }
  
  // Оружие во всех наборах
  props.character.equipment?.weaponSets?.forEach(set => {
    set.weapons.forEach(weaponId => items.add(weaponId))
  })
  
  // Предметы в инвентаре
  props.character.inventory?.forEach(item => {
    if (typeof item === 'string') {
      items.add(item)
    } else if (item.id) {
      items.add(item.id)
    }
  })
  
  return Array.from(items)
})

// Полные данные о предметах персонажа
const characterItemsData = computed(() => {
  return allCharacterItems.value.map(itemId => {
    const item = itemsData.items.find(i => i.id === itemId)
    if (!item) return null
    
    // Проверяем, экипирован ли предмет
    const isArmor = props.character.equipment?.armor === itemId
    const isInWeaponSet = props.character.equipment?.weaponSets?.some(set => 
      set.weapons.includes(itemId)
    )
    
    return {
      ...item,
      equipped: isArmor || isInWeaponSet,
      equippedAs: isArmor ? 'armor' : isInWeaponSet ? 'weapon' : null
    }
  }).filter(Boolean)
})

// Фильтрация по категории и поиску
const filteredItems = computed(() => {
  let items = characterItemsData.value
  
  // Фильтр по категории
  if (activeCategory.value !== 'all') {
    items = items.filter(item => item.category === activeCategory.value)
  }
  
  // Поиск
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    items = items.filter(item => 
      item.name.toLowerCase().includes(query) ||
      item.desc?.toLowerCase().includes(query)
    )
  }
  
  return items
})

// Доступные для добавления предметы (с учётом wealth и epoch)
const availableItems = computed(() => {
  const wealth = props.character.equipment?.wealth || 0
  const epoch = props.character.equipment?.epoch || 0
  
  return itemsData.items.filter(item => {
    // Проверяем, что предмет ещё не добавлен
    if (allCharacterItems.value.includes(item.id)) return false
    
    // Фильтруем по wealth и epoch
    const isAffordable = (item.wealth || item.price || 0) <= wealth
    const isEpochSuitable = (item.epoch || 0) <= epoch
    
    return isAffordable && isEpochSuitable
  })
})

// Добавить предмет в инвентарь
const addItem = (itemId) => {
  const inventory = props.character.inventory || []
  const updatedCharacter = {
    ...props.character,
    inventory: [...inventory, itemId]
  }
  emit('update:character', updatedCharacter)
  showAddItemModal.value = false
}

// Удалить предмет из инвентаря
const removeItem = (itemId) => {
  // Проверяем, не экипирован ли предмет
  const item = characterItemsData.value.find(i => i.id === itemId)
  if (item?.equipped) {
    alert('Нельзя удалить экипированный предмет. Сначала снимите его.')
    return
  }
  
  if (confirm(`Удалить "${item.name}" из инвентаря?`)) {
    const inventory = props.character.inventory.filter(id => {
      if (typeof id === 'string') return id !== itemId
      return id.id !== itemId
    })
    
    const updatedCharacter = {
      ...props.character,
      inventory
    }
    emit('update:character', updatedCharacter)
  }
}

// Экипировать предмет
const equipItem = (item) => {
  emit('equip-item', item)
}

// Открыть/закрыть модалку с подробностями
const openItemDetail = (item) => {
  selectedItemDetail.value = item
  showItemDetailModal.value = true
}

const closeItemDetail = () => {
  selectedItemDetail.value = null
  showItemDetailModal.value = false
}

// Категории для модального окна добавления
const addItemCategory = ref('all')
const addItemSearch = ref('')

const filteredAvailableItems = computed(() => {
  let items = availableItems.value
  
  if (addItemCategory.value !== 'all') {
    items = items.filter(item => item.category === addItemCategory.value)
  }
  
  if (addItemSearch.value) {
    const query = addItemSearch.value.toLowerCase()
    items = items.filter(item => 
      item.name.toLowerCase().includes(query) ||
      item.desc?.toLowerCase().includes(query)
    )
  }
  
  return items
})
</script>

<template>
  <div class="inventory-panel">
    <!-- Заголовок и кнопки -->
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold text-slate-300">Инвентарь</h2>
      <button
        @click="showAddItemModal = true"
        class="px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/60 text-emerald-100 hover:bg-emerald-500/30 transition flex items-center gap-2"
      >
        <span>+</span>
        <span>Добавить предмет</span>
      </button>
    </div>
    
    <!-- Фильтры -->
    <div class="mb-4 space-y-3">
      <!-- Категории -->
      <div class="flex gap-2 flex-wrap">
        <button
          v-for="cat in categories"
          :key="cat.id"
          @click="activeCategory = cat.id"
          :class="[
            'px-3 py-2 rounded-lg text-sm font-medium transition',
            activeCategory === cat.id
              ? 'bg-sky-500/20 border border-sky-400 text-sky-100'
              : 'bg-slate-800/40 border border-slate-700 text-slate-400 hover:bg-slate-800/60'
          ]"
        >
          <span class="mr-1">{{ cat.icon }}</span>
          {{ cat.name }}
        </button>
      </div>
      
      <!-- Поиск -->
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Поиск по названию или описанию..."
        class="w-full px-4 py-2 rounded-lg bg-slate-900/60 border border-slate-700 text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none"
      />
    </div>
    
    <!-- Статистика -->
    <div class="mb-4 p-3 rounded-lg bg-slate-900/40 border border-slate-700 text-sm">
      <div class="flex items-center justify-between">
        <span class="text-slate-400">Всего предметов:</span>
        <span class="text-white font-bold">{{ characterItemsData.length }}</span>
      </div>
      <div class="flex items-center justify-between mt-1">
        <span class="text-slate-400">Экипировано:</span>
        <span class="text-emerald-400 font-bold">{{ characterItemsData.filter(i => i.equipped).length }}</span>
      </div>
      <div class="flex items-center justify-between mt-1">
        <span class="text-slate-400">В инвентаре:</span>
        <span class="text-amber-400 font-bold">{{ characterItemsData.filter(i => !i.equipped).length }}</span>
      </div>
    </div>
    
    <!-- Список предметов -->
    <div v-if="filteredItems.length" class="space-y-2">
      <div
        v-for="item in filteredItems"
        :key="item.id"
        @click="openItemDetail(item)"
        class="p-4 rounded-lg border transition cursor-pointer hover:bg-slate-800/60"
        :class="item.equipped ? 'bg-emerald-900/20 border-emerald-700' : 'bg-slate-950/40 border-slate-700'"
      >
        <div class="flex items-start justify-between mb-2">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <h3 class="font-bold text-white">{{ item.name }}</h3>
              <span
                v-if="item.equipped"
                class="px-2 py-0.5 text-xs rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
              >
                Надето
              </span>
            </div>
            <p class="text-xs text-slate-400 leading-relaxed">{{ item.desc }}</p>
          </div>
          
          <div class="flex items-center gap-2 ml-4">
            <button
              v-if="!item.equipped && (item.category === 'weapon' || item.category === 'shield' || item.category === 'armor')"
              @click.stop="equipItem(item)"
              class="px-3 py-1 text-xs rounded-lg bg-sky-500/20 border border-sky-400/60 text-sky-100 hover:bg-sky-500/30 transition"
              title="Экипировать"
            >
              Надеть
            </button>
            <button
              v-if="!item.equipped"
              @click.stop="removeItem(item.id)"
              class="px-3 py-1 text-xs rounded-lg bg-red-500/20 border border-red-400/40 text-red-300 hover:bg-red-500/30 transition"
              title="Удалить"
            >
              🗑️
            </button>
          </div>
        </div>
        
        <!-- Характеристики -->
        <div class="grid grid-cols-4 gap-2 text-xs mt-3">
          <!-- Для обычного оружия -->
          <div v-if="item.attack !== undefined && typeof item.defence !== 'object'" class="text-center p-2 bg-slate-900/60 rounded">
            <div class="text-slate-500">Атака</div>
            <div class="text-red-400 font-bold">{{ item.attack }}</div>
          </div>
          <div v-if="item.defence !== undefined && typeof item.defence !== 'object'" class="text-center p-2 bg-slate-900/60 rounded">
            <div class="text-slate-500">Защита</div>
            <div class="text-emerald-400 font-bold">{{ item.defence }}</div>
          </div>
          
          <!-- Для щитов с направленной защитой -->
          <template v-if="typeof item.defence === 'object'">
            <div class="col-span-4 p-2 bg-slate-900/60 rounded">
              <div class="text-slate-500 text-center mb-2 font-semibold">Защита щита</div>
              <div class="grid grid-cols-3 gap-1 text-[10px]">
                <div class="text-center">
                  <div class="text-slate-500">Направление</div>
                </div>
                <div class="text-center">
                  <div class="text-slate-500">Удары</div>
                </div>
                <div class="text-center">
                  <div class="text-slate-500">Снаряды</div>
                </div>
                
                <template v-if="item.defence.front">
                  <div class="text-slate-400">Спереди</div>
                  <div class="text-emerald-400 font-bold">{{ item.defence.front.melee || 0 }}</div>
                  <div class="text-sky-400 font-bold">{{ item.defence.front.ranged || 0 }}</div>
                </template>
                
                <template v-if="item.defence.side">
                  <div class="text-slate-400">С фланга</div>
                  <div class="text-emerald-400 font-bold">{{ item.defence.side.melee || 0 }}</div>
                  <div class="text-sky-400 font-bold">{{ item.defence.side.ranged || 0 }}</div>
                </template>
                
                <template v-if="item.defence.back">
                  <div class="text-slate-400">Сзади</div>
                  <div class="text-emerald-400 font-bold">{{ item.defence.back.melee || 0 }}</div>
                  <div class="text-sky-400 font-bold">{{ item.defence.back.ranged || 0 }}</div>
                </template>
              </div>
            </div>
          </template>
          
          <div v-if="item.attack !== undefined && typeof item.defence === 'object'" class="text-center p-2 bg-slate-900/60 rounded">
            <div class="text-slate-500">Атака</div>
            <div class="text-red-400 font-bold">{{ item.attack }}</div>
          </div>
          
          <div v-if="item.resist !== undefined" class="text-center p-2 bg-slate-900/60 rounded">
            <div class="text-slate-500">Резист</div>
            <div class="text-blue-400 font-bold">{{ item.resist }}</div>
          </div>
          <div v-if="item.length !== undefined" class="text-center p-2 bg-slate-900/60 rounded">
            <div class="text-slate-500">Длина</div>
            <div class="text-cyan-400 font-bold">{{ item.length }}</div>
          </div>
          <div v-if="item.hands !== undefined" class="text-center p-2 bg-slate-900/60 rounded">
            <div class="text-slate-500">Руки</div>
            <div class="text-purple-400 font-bold">{{ item.hands }}</div>
          </div>
          <div v-if="item.movement !== undefined" class="text-center p-2 bg-slate-900/60 rounded">
            <div class="text-slate-500">Движение</div>
            <div :class="item.movement >= 0 ? 'text-green-400' : 'text-red-400'" class="font-bold">
              {{ item.movement >= 0 ? '+' : '' }}{{ item.movement }}
            </div>
          </div>
          <div v-if="item.bursts !== undefined" class="text-center p-2 bg-slate-900/60 rounded">
            <div class="text-slate-500">Порывы</div>
            <div :class="item.bursts >= 0 ? 'text-green-400' : 'text-red-400'" class="font-bold">
              {{ item.bursts >= 0 ? '+' : '' }}{{ item.bursts }}
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div v-else class="text-center py-12 text-slate-500">
      <div class="text-4xl mb-3">📦</div>
      <p>Ничего не найдено</p>
    </div>
    
    <!-- Модальное окно добавления предмета -->
    <Teleport to="body">
      <div
        v-if="showAddItemModal"
        class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
        @click.self="showAddItemModal = false"
      >
        <div class="bg-slate-900 rounded-2xl border border-white/10 max-w-4xl w-full max-h-[85vh] overflow-y-auto">
          <div class="sticky top-0 bg-slate-900 border-b border-white/10 p-4 flex items-center justify-between z-10">
            <h2 class="text-xl font-bold">Добавить предмет</h2>
            <button
              @click="showAddItemModal = false"
              class="w-8 h-8 rounded-lg hover:bg-white/10 transition"
            >
              ✕
            </button>
          </div>
          
          <!-- Фильтры в модальном окне -->
          <div class="p-4 space-y-3 border-b border-white/10">
            <div class="flex gap-2 flex-wrap">
              <button
                v-for="cat in categories"
                :key="cat.id"
                @click="addItemCategory = cat.id"
                :class="[
                  'px-3 py-2 rounded-lg text-sm font-medium transition',
                  addItemCategory === cat.id
                    ? 'bg-sky-500/20 border border-sky-400 text-sky-100'
                    : 'bg-slate-800/40 border border-slate-700 text-slate-400 hover:bg-slate-800/60'
                ]"
              >
                <span class="mr-1">{{ cat.icon }}</span>
                {{ cat.name }}
              </button>
            </div>
            
            <input
              v-model="addItemSearch"
              type="text"
              placeholder="Поиск..."
              class="w-full px-4 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none"
            />
          </div>
          
          <!-- Список доступных предметов -->
          <div class="p-4">
            <p class="text-sm text-slate-400 mb-3">
              Доступно предметов: <span class="text-white font-bold">{{ filteredAvailableItems.length }}</span>
            </p>
            
            <div v-if="filteredAvailableItems.length" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                v-for="item in filteredAvailableItems"
                :key="item.id"
                @click="addItem(item.id)"
                class="p-4 rounded-lg border bg-slate-950/40 border-slate-700 hover:bg-slate-800/40 transition text-left"
              >
                <h3 class="font-bold text-white mb-1">{{ item.name }}</h3>
                <p class="text-xs text-slate-400 mb-2 line-clamp-2">{{ item.desc }}</p>
                
                <div class="grid grid-cols-4 gap-1 text-xs">
                  <div v-if="item.attack !== undefined && typeof item.defence !== 'object'" class="text-center p-1 bg-slate-900/60 rounded">
                    <div class="text-slate-500 text-[10px]">Атака</div>
                    <div class="text-red-400 font-bold">{{ item.attack }}</div>
                  </div>
                  <div v-if="item.defence !== undefined && typeof item.defence !== 'object'" class="text-center p-1 bg-slate-900/60 rounded">
                    <div class="text-slate-500 text-[10px]">Защита</div>
                    <div class="text-emerald-400 font-bold">{{ item.defence }}</div>
                  </div>
                  
                  <!-- Для щитов -->
                  <template v-if="typeof item.defence === 'object'">
                    <div class="col-span-4 p-1 bg-slate-900/60 rounded text-[9px]">
                      <div class="text-emerald-400 font-bold text-center mb-1">🛡️ Защита</div>
                      <div v-if="item.defence.front" class="flex justify-between">
                        <span class="text-slate-500">Спереди:</span>
                        <span>
                          <span class="text-emerald-400">{{ item.defence.front.melee || 0 }}</span> / 
                          <span class="text-sky-400">{{ item.defence.front.ranged || 0 }}</span>
                        </span>
                      </div>
                      <div v-if="item.defence.side" class="flex justify-between">
                        <span class="text-slate-500">Фланг:</span>
                        <span>
                          <span class="text-emerald-400">{{ item.defence.side.melee || 0 }}</span> / 
                          <span class="text-sky-400">{{ item.defence.side.ranged || 0 }}</span>
                        </span>
                      </div>
                    </div>
                  </template>
                  
                  <div v-if="item.resist !== undefined" class="text-center p-1 bg-slate-900/60 rounded">
                    <div class="text-slate-500 text-[10px]">Резист</div>
                    <div class="text-blue-400 font-bold">{{ item.resist }}</div>
                  </div>
                  <div v-if="item.hands !== undefined" class="text-center p-1 bg-slate-900/60 rounded">
                    <div class="text-slate-500 text-[10px]">Руки</div>
                    <div class="text-purple-400 font-bold">{{ item.hands }}</div>
                  </div>
                </div>
              </button>
            </div>
            
            <div v-else class="text-center py-8 text-slate-500">
              Нет доступных предметов
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Модальное окно с подробностями предмета -->
    <Teleport to="body">
      <div v-if="showItemDetailModal && selectedItemDetail" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 backdrop-blur-sm" @click="closeItemDetail">
        <div class="bg-slate-900 rounded-2xl border border-slate-700 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" @click.stop>
          <!-- Header -->
          <div class="flex items-center justify-between p-6 border-b border-slate-700">
            <h2 class="text-2xl font-bold text-slate-100">{{ selectedItemDetail.name }}</h2>
            <button @click="closeItemDetail" class="w-10 h-10 rounded-lg hover:bg-slate-800 transition flex items-center justify-center text-slate-400 hover:text-slate-100">
              <span class="text-2xl">✕</span>
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto p-6 space-y-6">
            <!-- Image -->
            <div class="w-48 h-48 mx-auto bg-slate-950/50 rounded-xl p-4 flex items-center justify-center">
              <img
                :src="itemImageUrl(selectedItemDetail.id)"
                :alt="selectedItemDetail.name"
                class="w-full h-full object-contain"
                @error="(e) => e.target.style.display = 'none'"
              />
            </div>

            <!-- Description -->
            <div v-if="selectedItemDetail.desc" class="p-4 bg-slate-950/30 border-l-4 border-slate-600 rounded-r-lg">
              <p class="text-slate-300 text-sm leading-relaxed italic">{{ selectedItemDetail.desc }}</p>
            </div>

            <!-- Main stats grid -->
            <div class="grid grid-cols-2 gap-3">
              <div v-if="selectedItemDetail.attack !== undefined && typeof selectedItemDetail.defence !== 'object'" class="stat-box">
                <div class="stat-label">
                  <span class="text-lg">⚔️</span>
                  Атака
                </div>
                <div class="stat-value text-red-400">{{ selectedItemDetail.attack }}</div>
              </div>

              <div v-if="selectedItemDetail.defence !== undefined && typeof selectedItemDetail.defence !== 'object'" class="stat-box">
                <div class="stat-label">
                  <span class="text-lg">🛡️</span>
                  Защита
                </div>
                <div class="stat-value text-emerald-400">{{ selectedItemDetail.defence }}</div>
              </div>

              <div v-if="selectedItemDetail.resist !== undefined" class="stat-box">
                <div class="stat-label">
                  <span class="text-lg">💎</span>
                  Резист
                </div>
                <div class="stat-value text-blue-400">{{ selectedItemDetail.resist }}</div>
              </div>

              <div v-if="selectedItemDetail.length !== undefined" class="stat-box">
                <div class="stat-label">
                  <span class="text-lg">↔️</span>
                  Дальность
                </div>
                <div class="stat-value text-cyan-400">{{ selectedItemDetail.length }}</div>
              </div>

              <div v-if="selectedItemDetail.hands !== undefined" class="stat-box">
                <div class="stat-label">
                  <span class="text-lg">🤲</span>
                  Руки
                </div>
                <div class="stat-value text-purple-400">{{ selectedItemDetail.hands }}</div>
              </div>

              <div v-if="selectedItemDetail.movement !== undefined" class="stat-box">
                <div class="stat-label">
                  <span class="text-lg">👟</span>
                  Движение
                </div>
                <div class="stat-value" :class="selectedItemDetail.movement >= 0 ? 'text-green-400' : 'text-red-400'">
                  {{ selectedItemDetail.movement >= 0 ? '+' : '' }}{{ selectedItemDetail.movement }}
                </div>
              </div>

              <div v-if="selectedItemDetail.bursts !== undefined" class="stat-box">
                <div class="stat-label">
                  <span class="text-lg">💨</span>
                  Порывы
                </div>
                <div class="stat-value" :class="selectedItemDetail.bursts >= 0 ? 'text-green-400' : 'text-red-400'">
                  {{ selectedItemDetail.bursts >= 0 ? '+' : '' }}{{ selectedItemDetail.bursts }}
                </div>
              </div>

              <div v-if="selectedItemDetail.price !== undefined" class="stat-box">
                <div class="stat-label">
                  <span class="text-lg">💰</span>
                  Цена
                </div>
                <div class="stat-value text-amber-400">{{ selectedItemDetail.price }}</div>
              </div>
            </div>

            <!-- Shield defence table -->
            <div v-if="typeof selectedItemDetail.defence === 'object'" class="bg-slate-950/50 rounded-xl p-4 border border-slate-700">
              <h3 class="text-lg font-bold text-emerald-400 mb-4 flex items-center gap-2">
                <span>🛡️</span>
                Защита щита
              </h3>
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-slate-700">
                      <th class="text-left text-slate-400 pb-2 pr-4">Направление</th>
                      <th class="text-center text-slate-400 pb-2 px-3">Ближний бой</th>
                      <th class="text-center text-slate-400 pb-2 px-3">Дальний бой</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="selectedItemDetail.defence.front" class="border-b border-slate-800">
                      <td class="py-3 pr-4 text-slate-300 font-medium">Спереди</td>
                      <td class="text-center py-3 px-3">
                        <span class="text-emerald-400 font-bold text-lg">{{ selectedItemDetail.defence.front.melee || 0 }}</span>
                      </td>
                      <td class="text-center py-3 px-3">
                        <span class="text-sky-400 font-bold text-lg">{{ selectedItemDetail.defence.front.ranged || 0 }}</span>
                      </td>
                    </tr>
                    <tr v-if="selectedItemDetail.defence.side" class="border-b border-slate-800">
                      <td class="py-3 pr-4 text-slate-300 font-medium">С фланга</td>
                      <td class="text-center py-3 px-3">
                        <span class="text-emerald-400 font-bold text-lg">{{ selectedItemDetail.defence.side.melee || 0 }}</span>
                      </td>
                      <td class="text-center py-3 px-3">
                        <span class="text-sky-400 font-bold text-lg">{{ selectedItemDetail.defence.side.ranged || 0 }}</span>
                      </td>
                    </tr>
                    <tr v-if="selectedItemDetail.defence.back">
                      <td class="py-3 pr-4 text-slate-300 font-medium">Сзади</td>
                      <td class="text-center py-3 px-3">
                        <span class="text-emerald-400 font-bold text-lg">{{ selectedItemDetail.defence.back.melee || 0 }}</span>
                      </td>
                      <td class="text-center py-3 px-3">
                        <span class="text-sky-400 font-bold text-lg">{{ selectedItemDetail.defence.back.ranged || 0 }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Damage table (для оружия) -->
            <div v-if="selectedItemDetail.damage" class="bg-slate-950/50 rounded-xl p-4 border border-slate-700">
              <h3 class="text-lg font-bold text-red-400 mb-4 flex items-center gap-2">
                <span>⚔️</span>
                Превышение защиты
              </h3>
              <div class="space-y-2">
                <div
                  v-for="(effect, threshold) in selectedItemDetail.damage"
                  :key="threshold"
                  class="flex items-center gap-4 p-3 bg-slate-900/50 rounded-lg"
                >
                  <div class="text-2xl font-bold text-slate-100 w-12 text-center">{{ threshold }}</div>
                  <div class="flex-1 text-slate-300">{{ effect }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex gap-3 p-6 border-t border-slate-700">
            <button
              v-if="!selectedItemDetail.equipped && (selectedItemDetail.category === 'weapon' || selectedItemDetail.category === 'shield' || selectedItemDetail.category === 'armor')"
              @click="equipItem(selectedItemDetail); closeItemDetail()"
              class="flex-1 px-4 py-3 rounded-lg bg-sky-500/20 border border-sky-400/60 text-sky-100 hover:bg-sky-500/30 transition font-semibold"
            >
              Надеть
            </button>
            <button
              v-if="!selectedItemDetail.equipped"
              @click="removeItem(selectedItemDetail.id); closeItemDetail()"
              class="flex-1 px-4 py-3 rounded-lg bg-red-500/20 border border-red-400/40 text-red-300 hover:bg-red-500/30 transition font-semibold"
            >
              Удалить
            </button>
            <button
              @click="closeItemDetail"
              class="flex-1 px-4 py-3 rounded-lg bg-slate-700/50 border border-slate-600 text-slate-300 hover:bg-slate-700 transition font-semibold"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.stat-box {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
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
  font-weight: 500;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
