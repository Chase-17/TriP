<script setup>
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import itemsData from '@/data/items.json'
import levelsData from '@/data/levels.json'
import { itemImageUrl } from '@/utils/assets'
import { getImageUrl } from '@/utils/images'
import ImagePicker from '@/components/shared/ImagePicker.vue'
import ItemPicker from '@/components/shared/ItemPicker.vue'

const props = defineProps({
  character: { type: Object, required: true },
  isMaster: { type: Boolean, default: false }
})

const emit = defineEmits(['update:character'])

// ===== DATA =====
const allItems = computed(() => itemsData.items)
const allWeapons = computed(() => allItems.value.filter(i => i.category === 'weapon' || i.category === 'shield'))
const allArmors = computed(() => allItems.value.filter(i => i.category === 'armor'))
const levels = levelsData.levels

// Кастомные предметы персонажа (переопределённые мастером)
const customItems = computed(() => props.character.customItems || [])

// Получить предмет по ID или instanceId
// Порядок поиска: customItems -> инвентарь (объекты) -> общий список
const getItem = (id) => {
  if (!id) return null
  
  // Ищем в customItems персонажа
  const custom = customItems.value.find(i => i.id === id || i.instanceId === id)
  if (custom) return custom
  
  // Ищем в инвентаре (могут быть объекты с переопределёнными свойствами)
  const invItem = (props.character.inventory || []).find(item => {
    if (typeof item === 'object') {
      return item.id === id || item.instanceId === id
    }
    return item === id
  })
  
  // Если нашли объект в инвентаре
  if (invItem && typeof invItem === 'object') {
    // Если это полноценный объект предмета (кастомный), возвращаем его
    if (invItem.name || invItem.isCustom) {
      return invItem
    }
    // Иначе это ссылка на базовый предмет { id, instanceId } — ищем базовый по id
    const baseItem = allItems.value.find(i => i.id === invItem.id)
    if (baseItem) {
      // Возвращаем базовый предмет, но добавляем instanceId для идентификации
      return { ...baseItem, instanceId: invItem.instanceId }
    }
  }
  
  // Ищем напрямую в базе предметов
  return allItems.value.find(i => i.id === id)
}

// Получить оружие по ID
const getWeapon = (id) => {
  const item = getItem(id)
  if (item && (item.category === 'weapon' || item.category === 'shield')) return item
  return null
}

// Получить броню по ID
const getArmor = (id) => {
  const item = getItem(id)
  if (item && item.category === 'armor') return item
  return null
}

// ===== STATE =====
const activeSetIndex = ref(props.character.equipment?.activeSetIndex || 0)
const showItemModal = ref(false)
const selectedItem = ref(null)
const showArmorModal = ref(false)
const showAddItemModal = ref(false)
const editingSetName = ref(null)
const newSetName = ref('')

// Редактирование предмета (мастер)
const showEditItemModal = ref(false)
const editingItem = ref(null)

// Рюкзак
const showBackpackModal = ref(false)
const backpackFilter = ref('all') // 'all' | 'weapon' | 'armor' | 'shield' | 'other'

// Анимация переключения
const isAnimating = ref(false)
const animationDirection = ref(null) // 'up' | 'down'

// Подсказки для модалки
const activeHint = ref(null)

// Описания подсказок
const hintDescriptions = {
  attack_short: {
    title: 'Атака вплотную',
    text: 'Модификатор броска атаки при ударе по соседнему противнику (на той же или соседней клетке). Положительное значение — бонус, отрицательное — штраф.'
  },
  attack_long: {
    title: 'Атака через клетку',
    text: 'Модификатор броска атаки при ударе по противнику через одну клетку (длинное оружие). Положительное значение — бонус, отрицательное — штраф.'
  },
  attack_ranged: {
    title: 'Дальняя атака',
    text: 'Модификатор броска атаки для стрельбы. Применяется при атаке на расстоянии более двух клеток.'
  },
  defence: {
    title: 'Защита оружием',
    text: 'Бонус к защите при использовании этого оружия для парирования или отклонения ударов противника.'
  },
  armorPen: {
    title: 'Пробивание брони',
    text: 'Количество очков брони, которое это оружие игнорирует при нанесении урона. Эффективно против бронированных противников.'
  },
  damageType: {
    title: 'Тип урона',
    text: 'Вид повреждений, наносимых оружием. Разные типы урона могут быть более или менее эффективны против определённой брони или существ.'
  },
  price: {
    title: 'Стоимость',
    text: 'Ценовая категория предмета. Определяет минимальный уровень достатка персонажа для приобретения.'
  },
  epoch: {
    title: 'Эпоха',
    text: 'Технологическая эпоха, начиная с которой доступен этот предмет. Более поздние эпохи предлагают лучшее снаряжение.'
  },
  length: {
    title: 'Длина оружия',
    text: 'Длинное оружие позволяет атаковать через клетку, но может быть менее эффективно вплотную. Короткое оружие удобнее в тесном бою.'
  },
  hands: {
    title: 'Хват',
    text: 'Сколько рук требуется для использования. Одноручное оружие оставляет руку свободной для щита или второго оружия. Двуручное обычно мощнее.'
  },
  armor_defence: {
    title: 'Защита брони',
    text: 'Базовая защита, которую даёт броня. Вычитается из урона противника при попадании.'
  },
  armor_resist: {
    title: 'Сопротивление',
    text: 'Устойчивость к стихийному и магическому урону. Снижает урон от огня, холода, молний и т.д.'
  },
  armor_movement: {
    title: 'Влияние на движение',
    text: 'Модификатор скорости передвижения. Тяжёлая броня замедляет, лёгкая может не влиять или даже ускорять.'
  }
}

const damageDescriptions = {
  t: 'Пустяковый урон — наносит царапину. Неприятно, но не опасно.',
  l: 'Лёгкий урон — наносит лёгкое ранение. Персонаж способен пережить несколько таких ран без серьёзных последствий.',
  m: 'Серьёзный урон — наносит тяжёлое ранение. Персонаж выведен из строя и нуждается в срочной помощи.',
  h: 'Тяжёлый урон — смертельное ранение. Без снижения урона персонаж погибает.',
  g: 'Жестокий урон — мгновенная смерть без защиты. Требуется минимум 1 единица снижения урона, чтобы выжить.',
  n: 'Кошмарный урон — мгновенная смерть. Требуется минимум 2 единицы снижения урона, чтобы выжить.',
  i: 'Невыносимый урон — мгновенная смерть. Требуется минимум 3 единицы снижения урона, чтобы выжить.'
}

// ===== COMPUTED =====
const weaponSets = computed(() => {
  const sets = [...(props.character.equipment?.weaponSets || [])]
  while (sets.length < 2) sets.push({ name: `Набор ${sets.length + 1}`, weapons: [] })
  return sets
})

const currentSet = computed(() => weaponSets.value[activeSetIndex.value] || { name: 'Набор 1', weapons: [] })

const currentArmor = computed(() => {
  const armorId = props.character.equipment?.armor || 'clothes'
  return getArmor(armorId)
})

const getSetWeapons = (setIndex) => {
  const set = weaponSets.value[setIndex]
  if (!set) return { left: null, right: null, isTwoHanded: false }
  const weapons = (set.weapons || []).map(id => getWeapon(id)).filter(Boolean)
  const isTwoHanded = weapons[0]?.hands === 2
  return {
    left: weapons[0] || null,
    right: isTwoHanded ? weapons[0] : (weapons[1] || null), // Двуручное — на оба слота
    isTwoHanded
  }
}

const currentWeapons = computed(() => getSetWeapons(activeSetIndex.value))
const prevSetIndex = computed(() => (activeSetIndex.value - 1 + weaponSets.value.length) % weaponSets.value.length)
const nextSetIndex = computed(() => (activeSetIndex.value + 1) % weaponSets.value.length)

const allCharacterItemIds = computed(() => {
  const ids = new Set()
  if (props.character.equipment?.armor) ids.add(props.character.equipment.armor)
  weaponSets.value.forEach(set => (set.weapons || []).forEach(id => ids.add(id)))
  ;(props.character.inventory || []).forEach(item => {
    ids.add(typeof item === 'string' ? item : (item.instanceId || item.id))
  })
  return Array.from(ids)
})

const allCharacterItems = computed(() => allCharacterItemIds.value.map(id => getItem(id)).filter(Boolean))

// Оружие для карусели (только уникальные по базовому id, так как дубликаты отображаются одинаково)
const inventoryWeapons = computed(() => {
  const seen = new Set()
  return allCharacterItems.value
    .filter(i => i.category === 'weapon' || i.category === 'shield')
    .filter(i => {
      // Показываем уникальные по базовому id (для карусели дубликаты не нужны)
      if (seen.has(i.id)) return false
      seen.add(i.id)
      return true
    })
})

const inventoryArmors = computed(() => {
  const invIds = (props.character.inventory || []).map(i => typeof i === 'string' ? i : (i.instanceId || i.id))
  const armors = []
  invIds.forEach(id => {
    const armor = getArmor(id)
    if (armor) armors.push(armor)
  })
  const equipped = getArmor(props.character.equipment?.armor)
  if (equipped && !armors.find(a => a.id === equipped.id)) armors.push(equipped)
  return armors
})

const backpackItems = computed(() => {
  const equipped = new Set()
  equipped.add(props.character.equipment?.armor)
  weaponSets.value.forEach(set => (set.weapons || []).forEach(id => equipped.add(id)))
  
  return (props.character.inventory || [])
    .map(item => {
      // Получаем ID для поиска базового предмета
      const itemId = typeof item === 'string' ? item : (item.instanceId || item.id)
      const baseId = typeof item === 'object' ? item.id : item
      
      // Если это объект с данными - используем его напрямую
      if (typeof item === 'object' && (item.name || item.isCustom)) {
        return { ...item, _instanceId: item.instanceId || item.id }
      }
      
      // Иначе ищем базовый предмет
      const baseItem = getItem(baseId)
      if (!baseItem) return null
      
      return { 
        ...baseItem, 
        _instanceId: itemId  // Храним instanceId для уникальной идентификации
      }
    })
    .filter(Boolean)
    .filter(item => !equipped.has(item._instanceId) && !equipped.has(item.id))
})

// Фильтрованный рюкзак
const filteredBackpackItems = computed(() => {
  if (backpackFilter.value === 'all') return backpackItems.value
  return backpackItems.value.filter(item => {
    if (backpackFilter.value === 'weapon') return item.category === 'weapon'
    if (backpackFilter.value === 'armor') return item.category === 'armor'
    if (backpackFilter.value === 'shield') return item.category === 'shield'
    if (backpackFilter.value === 'other') return !['weapon', 'armor', 'shield'].includes(item.category)
    return true
  })
})

// Количество предметов по категориям в рюкзаке
const backpackCounts = computed(() => ({
  all: backpackItems.value.length,
  weapon: backpackItems.value.filter(i => i.category === 'weapon').length,
  armor: backpackItems.value.filter(i => i.category === 'armor').length,
  shield: backpackItems.value.filter(i => i.category === 'shield').length,
  other: backpackItems.value.filter(i => !['weapon', 'armor', 'shield'].includes(i.category)).length
}))

// ===== STATS =====
const currentSetStats = computed(() => {
  const weapons = currentWeapons.value
  const armor = currentArmor.value
  let totalDefence = armor?.defence || 0
  let totalResist = armor?.resist || 0
  let movement = armor?.movement || 0
  let attackShort = null, attackLong = null, attackRanged = null
  
  const addWeaponStats = (weapon) => {
    if (!weapon) return
    if (typeof weapon.defence === 'object') totalDefence += weapon.defence.front?.melee || 0
    else if (weapon.defence) totalDefence += weapon.defence
    if (weapon.attack && typeof weapon.attack === 'object') {
      if (weapon.attack.short !== undefined) attackShort = Math.max(attackShort ?? -999, weapon.attack.short)
      if (weapon.attack.long !== undefined) attackLong = Math.max(attackLong ?? -999, weapon.attack.long)
      if (weapon.attack.ranged !== undefined) attackRanged = Math.max(attackRanged ?? -999, weapon.attack.ranged)
    }
  }
  addWeaponStats(weapons.left)
  if (!weapons.isTwoHanded) addWeaponStats(weapons.right)
  
  return { defence: totalDefence, resist: totalResist, movement, attackShort, attackLong, attackRanged }
})

// ===== METHODS =====
const updateEquipment = (updates) => {
  emit('update:character', { ...props.character, equipment: { ...props.character.equipment, ...updates } })
}

const updateInventory = (inventory) => {
  emit('update:character', { ...props.character, inventory })
}

const scrollToSet = (direction) => {
  if (isAnimating.value) return
  isAnimating.value = true
  animationDirection.value = direction
  
  setTimeout(() => {
    const newIndex = direction === 'up' ? prevSetIndex.value : nextSetIndex.value
    activeSetIndex.value = newIndex
    updateEquipment({ activeSetIndex: newIndex })
    isAnimating.value = false
    animationDirection.value = null
  }, 250)
}

const addWeaponSet = () => {
  if (!props.isMaster) return
  const sets = [...weaponSets.value]
  sets.push({ name: `Набор ${sets.length + 1}`, weapons: [] })
  updateEquipment({ weaponSets: sets })
}

const deleteWeaponSet = (index) => {
  if (!props.isMaster) return
  if (weaponSets.value.length <= 1) { alert('Нельзя удалить последний набор'); return }
  if (!confirm(`Удалить набор "${weaponSets.value[index]?.name || 'Без имени'}"?`)) return
  
  const sets = [...weaponSets.value]
  sets.splice(index, 1)
  
  // Корректируем активный индекс
  let newActiveIndex = activeSetIndex.value
  if (index === activeSetIndex.value) {
    newActiveIndex = Math.min(index, sets.length - 1)
  } else if (index < activeSetIndex.value) {
    newActiveIndex = activeSetIndex.value - 1
  }
  
  activeSetIndex.value = newActiveIndex
  updateEquipment({ weaponSets: sets, activeSetIndex: newActiveIndex })
}

const canAddWeapon = (weaponId) => {
  const weapon = getWeapon(weaponId)
  if (!weapon) return false
  const currentWeaponsList = (currentSet.value.weapons || []).map(id => getWeapon(id)).filter(Boolean)
  const newWeapons = [...currentWeaponsList, weapon]
  const totalHands = newWeapons.reduce((sum, w) => sum + (w.hands || 1), 0)
  const longCount = newWeapons.filter(w => w.length === 2).length
  return totalHands <= 2 && longCount <= 1
}

const equipWeapon = (weaponId) => {
  if ((currentSet.value.weapons || []).includes(weaponId)) return
  if (!canAddWeapon(weaponId)) return
  const sets = [...weaponSets.value]
  const set = { ...sets[activeSetIndex.value] }
  set.weapons = [...(set.weapons || []), weaponId]
  sets[activeSetIndex.value] = set
  updateEquipment({ weaponSets: sets })
}

const unequipWeapon = (weaponId) => {
  const sets = [...weaponSets.value]
  const set = { ...sets[activeSetIndex.value] }
  set.weapons = (set.weapons || []).filter(id => id !== weaponId)
  sets[activeSetIndex.value] = set
  updateEquipment({ weaponSets: sets })
}

const equipArmor = (armorId) => {
  updateEquipment({ armor: armorId })
  showArmorModal.value = false
}

// Добавить предмет в инвентарь (из ItemPicker)
// item может быть объектом с instanceId (для дубликатов) или кастомным предметом
const addItemFromPicker = (item) => {
  const inventory = [...(props.character.inventory || [])]
  
  if (item.isCustom) {
    // Кастомный предмет — сохраняем полностью как объект
    const itemData = {
      ...item,
      instanceId: item.instanceId || `${item.id}_${Date.now()}`
    }
    inventory.push(itemData)
    
    // Сохраняем в customItems персонажа
    const customItems = [...(props.character.customItems || []), itemData]
    emit('update:character', { 
      ...props.character, 
      inventory,
      customItems 
    })
    return
  }
  
  // Стандартный предмет — сохраняем id и instanceId
  // id — это базовый id предмета (для поиска данных и картинки)
  // instanceId — уникальный идентификатор экземпляра (для дубликатов)
  inventory.push({
    id: item.id,
    instanceId: item.instanceId || `${item.id}_${Date.now()}`
  })
  
  updateInventory(inventory)
}

// Старый метод для совместимости
const addItemToInventory = (itemId) => {
  const inventory = [...(props.character.inventory || []), { 
    id: itemId, 
    instanceId: `${itemId}_${Date.now()}` 
  }]
  updateInventory(inventory)
}

const removeItemFromInventory = (itemId) => {
  const isEquipped = props.character.equipment?.armor === itemId || weaponSets.value.some(set => (set.weapons || []).includes(itemId))
  if (isEquipped) { alert('Сначала снимите предмет'); return }
  // Удаляем по instanceId или id
  const inventory = (props.character.inventory || []).filter(item => {
    const id = typeof item === 'string' ? item : (item.instanceId || item.id)
    return id !== itemId
  })
  updateInventory(inventory)
  
  // Также удаляем из customItems если это кастомный предмет
  const customItems = (props.character.customItems || []).filter(i => i.id !== itemId)
  if (customItems.length !== (props.character.customItems || []).length) {
    emit('update:character', { ...props.character, inventory, customItems })
  }
}

const openItemModal = (item) => { selectedItem.value = item; showItemModal.value = true; activeHint.value = null }
const closeItemModal = () => { selectedItem.value = null; showItemModal.value = false; activeHint.value = null }

// Показать подсказку
const showHint = (hintKey) => {
  if (hintDescriptions[hintKey]) {
    activeHint.value = { type: 'property', key: hintKey, ...hintDescriptions[hintKey] }
  }
}

// Показать подсказку для уровня урона
const showDamageHint = (level, threshold) => {
  const name = level.names?.damage?.ru || level.short
  if (threshold === null || threshold === undefined) {
    activeHint.value = {
      type: 'damage', key: level.key,
      title: `${level.short} — ${name} урон`,
      text: 'Это оружие не способно нанести урон данной категории.'
    }
  } else {
    activeHint.value = {
      type: 'damage', key: level.key,
      title: `${level.short} — ${name} урон`,
      text: `${damageDescriptions[level.key] || name}\n\nТребуется очков превышения защиты: ${threshold}+`
    }
  }
}

// Получить порог урона
const getDamageThreshold = (item, levelKey) => {
  if (!item.damage || item.damage[levelKey] === undefined) return null
  return item.damage[levelKey]
}

// Стили для ячейки урона
const getDamageLevelStyle = (level, isActive) => {
  if (!isActive) return { backgroundColor: '#333', color: '#666' }
  return { backgroundColor: level.color, color: level.lightText ? '#fff' : '#000' }
}

// Короткие лейблы
const getHandsLabel = (hands) => {
  if (hands === 2) return '2 руки'
  if (hands === 1) return '1 рука'
  if (hands === 1.5) return '1.5 руки'
  return `${hands}`
}

const getLengthLabel = (length) => length === 2 ? 'Длинное' : 'Короткое'

// Редактирование названия набора — теперь для всех!
const startEditSetName = (index) => { editingSetName.value = index; newSetName.value = weaponSets.value[index].name }
const saveSetName = () => {
  if (editingSetName.value === null) return
  const sets = [...weaponSets.value]
  sets[editingSetName.value] = { ...sets[editingSetName.value], name: newSetName.value || `Набор ${editingSetName.value + 1}` }
  updateEquipment({ weaponSets: sets })
  editingSetName.value = null
}

const formatAttackValue = (val) => val >= 0 ? `+${val}` : String(val)
const getDamageLevel = (item, key) => item.damage?.[key]

// ===== РЕДАКТИРОВАНИЕ ПРЕДМЕТА (МАСТЕР) =====
const openEditItem = (item) => {
  if (!props.isMaster || !item) return
  // Создаём копию для редактирования
  const copy = JSON.parse(JSON.stringify(item))
  // Инициализируем attack если это оружие
  if (copy.category === 'weapon' || copy.category === 'shield') {
    if (!copy.attack) copy.attack = { short: 0, long: 0, ranged: undefined }
    if (!copy.damage) copy.damage = {}
    if (!copy.hands) copy.hands = 1
    if (!copy.length) copy.length = 1
  }
  // Переносим spec в special для редактирования
  if (copy.spec && !copy.special) copy.special = copy.spec
  editingItem.value = copy
  showEditItemModal.value = true
}

const saveEditedItem = () => {
  if (!editingItem.value) return
  
  const item = editingItem.value
  const customList = [...(props.character.customItems || [])]
  const existingIndex = customList.findIndex(i => i.id === item.id || i.instanceId === item.instanceId)
  
  if (existingIndex !== -1) {
    customList[existingIndex] = item
  } else {
    customList.push(item)
  }
  
  // Если создаём новый предмет — добавляем в инвентарь
  if (isCreatingNewItem.value) {
    const inventory = [...(props.character.inventory || []), item]
    emit('update:character', { ...props.character, inventory, customItems: customList })
    isCreatingNewItem.value = false
  } else {
    emit('update:character', { ...props.character, customItems: customList })
  }
  
  showEditItemModal.value = false
  editingItem.value = null
  
  // Обновляем selectedItem если он редактировался
  if (selectedItem.value?.id === item.id) {
    selectedItem.value = item
  }
}

const cancelEditItem = () => {
  showEditItemModal.value = false
  editingItem.value = null
  isCreatingNewItem.value = false
}

const resetItemToDefault = () => {
  if (!editingItem.value) return
  
  const originalItem = allItems.value.find(i => i.id === editingItem.value.id)
  if (originalItem) {
    // Удаляем из customItems
    const customList = (props.character.customItems || []).filter(i => i.id !== editingItem.value.id)
    emit('update:character', { ...props.character, customItems: customList })
    
    // Обновляем selectedItem
    if (selectedItem.value?.id === editingItem.value.id) {
      selectedItem.value = originalItem
    }
  }
  
  showEditItemModal.value = false
  editingItem.value = null
}

// Проверка - изменён ли предмет
const isItemCustomized = (itemId) => {
  return (props.character.customItems || []).some(i => i.id === itemId)
}

// Создание нового предмета (вызывается из ItemPicker)
const isCreatingNewItem = ref(false)

const createNewItem = () => {
  const newItem = {
    id: `custom_${Date.now()}`,
    instanceId: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    name: 'Новый предмет',
    category: 'weapon',
    subcat: 'swords',
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
    isCustom: true
  }
  editingItem.value = newItem
  isCreatingNewItem.value = true
  showEditItemModal.value = true
  showAddItemModal.value = false
}

// Категории и подкатегории для редактора (с иконками)
const itemCategoryOptions = [
  { value: 'weapon', label: 'Оружие', icon: 'mdi:sword' },
  { value: 'shield', label: 'Щит', icon: 'mdi:shield' },
  { value: 'armor', label: 'Броня', icon: 'mdi:tshirt-crew' },
  { value: 'item', label: 'Предмет', icon: 'mdi:package-variant' },
  { value: 'quest', label: 'Квестовый', icon: 'mdi:exclamation-thick' },
  { value: 'accessory', label: 'Аксессуар', icon: 'mdi:ring' },
  { value: 'consumable', label: 'Расходник', icon: 'mdi:flask' }
]

const weaponSubcatOptions = [
  { value: 'spears', icon: 'mdi:spear' },
  { value: 'swords', icon: 'mdi:sword' },
  { value: 'axes', icon: 'mdi:axe' },
  { value: 'maces', icon: 'mdi:mace' },
  { value: 'flails', icon: 'ph:lasso-bold' },
  { value: 'daggers', icon: 'mdi:knife' },
  { value: 'bows', icon: 'mdi:bow-arrow' },
  { value: 'crossbows', icon: 'mdi:crosshairs' },
  { value: 'slings', icon: 'game-icons:sling' },
  { value: 'firearms', icon: 'mdi:pistol' },
  { value: 'shields', icon: 'mdi:shield' },
  { value: 'exotic', icon: 'mdi:star-four-points' }
]

const armorSubcatOptions = [
  { value: 'light', icon: 'mdi:tshirt-v' },
  { value: 'middle', icon: 'mdi:tshirt-crew' },
  { value: 'heavy', icon: 'mdi:shield-account' }
]

// Подкатегории для аксессуаров
const accessorySubcatOptions = [
  { value: 'ring', icon: 'mdi:ring' },
  { value: 'amulet', icon: 'game-icons:gem-pendant' },
  { value: 'talisman', icon: 'mdi:star-circle' },
  { value: 'cloak', icon: 'game-icons:cape' },
  { value: 'belt', icon: 'game-icons:belt' },
  { value: 'other', icon: 'mdi:dots-horizontal' }
]

const damageTypeOptions = ['Колющий', 'Рубящий', 'Дробящий', 'Режущий', 'Огненный', 'Ледяной', 'Электрический', 'Ядовитый']

// Изменение урона кнопками вверх/вниз
const adjustDamage = (key, delta) => {
  if (!editingItem.value) return
  const current = editingItem.value.damage?.[key]
  const newVal = (current ?? -1) + delta
  
  if (newVal < 0) {
    // Удаляем ключ (ставим прочерк)
    const newDamage = { ...editingItem.value.damage }
    delete newDamage[key]
    editingItem.value.damage = newDamage
  } else {
    editingItem.value.damage = { ...editingItem.value.damage, [key]: newVal }
  }
}

// Сброс урона в прочерк (удаление ключа)
const clearDamage = (key) => {
  if (!editingItem.value) return
  const newDamage = { ...editingItem.value.damage }
  delete newDamage[key]
  editingItem.value.damage = newDamage
}

// Изменение атаки кнопками (с поддержкой прочерка)
const adjustAttack = (type, delta) => {
  if (!editingItem.value) return
  if (!editingItem.value.attack) editingItem.value.attack = {}
  const current = editingItem.value.attack[type]
  
  if (current === undefined) {
    // Прочерк -> 0 (при нажатии +) или остаётся прочерк (при -)
    if (delta > 0) {
      editingItem.value.attack = { ...editingItem.value.attack, [type]: 0 }
    }
  } else {
    editingItem.value.attack = { ...editingItem.value.attack, [type]: current + delta }
  }
}

// Сброс атаки в прочерк
const clearAttack = (type) => {
  if (!editingItem.value || !editingItem.value.attack) return
  const newAttack = { ...editingItem.value.attack }
  delete newAttack[type]
  editingItem.value.attack = newAttack
}

// Изменение числового поля кнопками
const adjustField = (field, delta) => {
  if (!editingItem.value) return
  const path = field.split('.')
  if (path.length === 1) {
    editingItem.value[field] = (editingItem.value[field] || 0) + delta
  } else if (path.length === 2) {
    if (!editingItem.value[path[0]]) editingItem.value[path[0]] = {}
    editingItem.value[path[0]][path[1]] = (editingItem.value[path[0]][path[1]] || 0) + delta
  }
}

// Проверка - является ли защита сложной (объект с направлениями)
const isComplexDefence = computed(() => {
  if (!editingItem.value) return false
  return typeof editingItem.value.defence === 'object' && editingItem.value.defence !== null
})

// Переключение между простой и сложной защитой
const toggleDefenceMode = () => {
  if (!editingItem.value) return
  if (isComplexDefence.value) {
    // Сложная -> простая: берём melee из front или 0
    const front = editingItem.value.defence?.front
    editingItem.value.defence = front?.melee || 0
  } else {
    // Простая -> сложная
    const simple = editingItem.value.defence || 0
    editingItem.value.defence = {
      front: { melee: simple, ranged: simple }
    }
  }
}

// Изменение сложной защиты
const adjustComplexDefence = (direction, type, delta) => {
  if (!editingItem.value || !isComplexDefence.value) return
  if (!editingItem.value.defence[direction]) {
    editingItem.value.defence[direction] = { melee: 0, ranged: 0 }
  }
  editingItem.value.defence[direction][type] = (editingItem.value.defence[direction][type] || 0) + delta
}

// Удалить направление защиты
const removeDefenceDirection = (direction) => {
  if (!editingItem.value || !isComplexDefence.value) return
  const newDefence = { ...editingItem.value.defence }
  delete newDefence[direction]
  editingItem.value.defence = newDefence
}

// Добавить направление защиты
const addDefenceDirection = (direction) => {
  if (!editingItem.value || !isComplexDefence.value) return
  editingItem.value.defence = {
    ...editingItem.value.defence,
    [direction]: { melee: 0, ranged: 0 }
  }
}

watch(() => props.character.equipment?.activeSetIndex, (newVal) => {
  if (newVal !== undefined && newVal !== activeSetIndex.value) activeSetIndex.value = newVal
})
</script>

<template>
  <div class="equipment-view">
    <!-- ===== CURRENT STATS (TOP) ===== -->
    <div class="stats-bar top">
      <div class="stat-item"><Icon icon="mdi:shield" class="stat-icon def" /><span class="stat-value">{{ currentSetStats.defence }}</span><span class="stat-label">Защита</span></div>
      <div class="stat-item"><Icon icon="mdi:water" class="stat-icon res" /><span class="stat-value">{{ currentSetStats.resist }}</span><span class="stat-label">Резист</span></div>
      <div v-if="currentSetStats.attackShort !== null" class="stat-item"><Icon icon="mdi:knife" class="stat-icon atk" /><span class="stat-value">{{ formatAttackValue(currentSetStats.attackShort) }}</span><span class="stat-label">Ближ.</span></div>
      <div v-if="currentSetStats.attackLong !== null" class="stat-item"><Icon icon="mdi:spear" class="stat-icon atk" /><span class="stat-value">{{ formatAttackValue(currentSetStats.attackLong) }}</span><span class="stat-label">Даль.</span></div>
      <div v-if="currentSetStats.attackRanged !== null" class="stat-item"><Icon icon="mdi:bow-arrow" class="stat-icon rng" /><span class="stat-value">{{ formatAttackValue(currentSetStats.attackRanged) }}</span><span class="stat-label">Стрел.</span></div>
      <div v-if="currentSetStats.movement" class="stat-item"><Icon icon="mdi:run" class="stat-icon mov" /><span class="stat-value" :class="currentSetStats.movement > 0 ? 'positive' : 'negative'">{{ currentSetStats.movement > 0 ? '+' : '' }}{{ currentSetStats.movement }}</span><span class="stat-label">Движ.</span></div>
    </div>

    <!-- ===== SLOT MACHINE DOLL ===== -->
    <div 
      class="doll-container" 
      :class="{ animating: isAnimating, 'anim-up': animationDirection === 'up', 'anim-down': animationDirection === 'down' }"
    >
      
      <!-- Left hand carousel -->
      <div class="hand-carousel left">
        <div class="slot-item prev" @click="scrollToSet('up')">
          <div class="weapon-slot ghost" :class="{ 'two-handed': getSetWeapons(prevSetIndex).isTwoHanded }">
            <img v-if="getSetWeapons(prevSetIndex).left" :src="itemImageUrl(getSetWeapons(prevSetIndex).left.id)" class="weapon-img" />
            <Icon v-else icon="mdi:hand-back-left" class="empty-icon" />
            <div v-if="getSetWeapons(prevSetIndex).isTwoHanded" class="link-badge left"><Icon icon="mdi:link-variant" /></div>
          </div>
        </div>
        <div class="slot-item current">
          <div class="weapon-slot" :class="{ occupied: currentWeapons.left, 'two-handed': currentWeapons.isTwoHanded }" @click="currentWeapons.left && openItemModal(currentWeapons.left)">
            <img v-if="currentWeapons.left" :src="itemImageUrl(currentWeapons.left.id)" :alt="currentWeapons.left.name" class="weapon-img" />
            <Icon v-else icon="mdi:hand-back-left" class="empty-icon" />
            <div v-if="currentWeapons.isTwoHanded" class="link-badge left"><Icon icon="mdi:link-variant" /></div>
            <button v-if="currentWeapons.left" @click.stop="unequipWeapon(currentWeapons.left.id)" class="remove-btn"><Icon icon="mdi:close" /></button>
          </div>
          <span class="slot-label">{{ currentWeapons.isTwoHanded ? '2H' : 'Левая' }}</span>
        </div>
        <div class="slot-item next" @click="scrollToSet('down')">
          <div class="weapon-slot ghost" :class="{ 'two-handed': getSetWeapons(nextSetIndex).isTwoHanded }">
            <img v-if="getSetWeapons(nextSetIndex).left" :src="itemImageUrl(getSetWeapons(nextSetIndex).left.id)" class="weapon-img" />
            <Icon v-else icon="mdi:hand-back-left" class="empty-icon" />
            <div v-if="getSetWeapons(nextSetIndex).isTwoHanded" class="link-badge left"><Icon icon="mdi:link-variant" /></div>
          </div>
        </div>
      </div>

      <!-- Armor (center) — КРУПНАЯ -->
      <div class="armor-center">
        <div class="armor-slot" @click="(isMaster || inventoryArmors.length > 1) ? showArmorModal = true : openItemModal(currentArmor)">
          <img v-if="currentArmor" :src="itemImageUrl(currentArmor.id)" :alt="currentArmor.name" class="armor-img" />
          <div class="armor-stats">
            <span class="stat def"><Icon icon="mdi:shield" />{{ currentArmor?.defence || 0 }}</span>
            <span class="stat res"><Icon icon="mdi:water" />{{ currentArmor?.resist || 0 }}</span>
          </div>
        </div>
        <span class="armor-name">{{ currentArmor?.name || 'Нет брони' }}</span>
        
        <!-- Название набора — редактирование для всех -->
        <div class="set-name-display" @click="startEditSetName(activeSetIndex)">
          <template v-if="editingSetName === activeSetIndex">
            <input v-model="newSetName" class="set-name-input" @blur="saveSetName" @keyup.enter="saveSetName" autofocus />
          </template>
          <template v-else>
            <Icon icon="mdi:pencil" class="edit-icon" /><span>{{ currentSet.name }}</span>
          </template>
        </div>
      </div>

      <!-- Right hand carousel -->
      <div class="hand-carousel right">
        <div class="slot-item prev" @click="scrollToSet('up')">
          <div class="weapon-slot ghost" :class="{ 'two-handed': getSetWeapons(prevSetIndex).isTwoHanded }">
            <img v-if="getSetWeapons(prevSetIndex).right" :src="itemImageUrl(getSetWeapons(prevSetIndex).right.id)" class="weapon-img" />
            <Icon v-else icon="mdi:hand-back-right" class="empty-icon" />
            <div v-if="getSetWeapons(prevSetIndex).isTwoHanded" class="link-badge right"><Icon icon="mdi:link-variant" /></div>
          </div>
        </div>
        <div class="slot-item current">
          <div class="weapon-slot" :class="{ occupied: currentWeapons.right, 'two-handed': currentWeapons.isTwoHanded }" @click="currentWeapons.right && openItemModal(currentWeapons.right)">
            <img v-if="currentWeapons.right" :src="itemImageUrl(currentWeapons.right.id)" :alt="currentWeapons.right?.name" class="weapon-img" />
            <Icon v-else icon="mdi:hand-back-right" class="empty-icon" />
            <div v-if="currentWeapons.isTwoHanded" class="link-badge right"><Icon icon="mdi:link-variant" /></div>
            <!-- Кнопка убрать только если НЕ двуручное (иначе убираем через левый слот) -->
            <button v-if="currentWeapons.right && !currentWeapons.isTwoHanded" @click.stop="unequipWeapon(currentWeapons.right.id)" class="remove-btn"><Icon icon="mdi:close" /></button>
          </div>
          <span class="slot-label">{{ currentWeapons.isTwoHanded ? '2H' : 'Правая' }}</span>
        </div>
        <div class="slot-item next" @click="scrollToSet('down')">
          <div class="weapon-slot ghost" :class="{ 'two-handed': getSetWeapons(nextSetIndex).isTwoHanded }">
            <img v-if="getSetWeapons(nextSetIndex).right" :src="itemImageUrl(getSetWeapons(nextSetIndex).right.id)" class="weapon-img" />
            <Icon v-else icon="mdi:hand-back-right" class="empty-icon" />
            <div v-if="getSetWeapons(nextSetIndex).isTwoHanded" class="link-badge right"><Icon icon="mdi:link-variant" /></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== QUICK INVENTORY CAROUSEL ===== -->
    <div class="inventory-carousel">
      <div class="carousel-track">
        <div v-for="item in inventoryWeapons" :key="item.id" class="carousel-item" :class="{ equipped: (currentSet.weapons || []).includes(item.id), disabled: !(currentSet.weapons || []).includes(item.id) && !canAddWeapon(item.id) }" @click="openItemModal(item)">
          <img :src="itemImageUrl(item.id)" :alt="item.name" />
          <div v-if="(currentSet.weapons || []).includes(item.id)" class="equipped-badge"><Icon icon="mdi:check" /></div>
        </div>
        <div v-if="inventoryWeapons.length === 0" class="carousel-empty">Нет оружия</div>
      </div>
      
      <!-- Кнопки управления -->
      <div class="carousel-actions">
        <button class="action-btn backpack" @click="showBackpackModal = true" :class="{ 'has-items': backpackItems.length > 0 }">
          <Icon icon="mdi:bag-personal" />
          <span v-if="backpackItems.length" class="badge">{{ backpackItems.length }}</span>
        </button>
        <button v-if="isMaster" class="action-btn add-set" @click="addWeaponSet">
          <Icon icon="mdi:plus" />
        </button>
        <button v-if="isMaster && weaponSets.length > 2" class="action-btn delete-set" @click="deleteWeaponSet(activeSetIndex)">
          <Icon icon="mdi:delete" />
        </button>
      </div>
    </div>

    <!-- ===== ITEM DETAIL MODAL — полноценная с hints ===== -->
    <Teleport to="body">
      <div v-if="showItemModal && selectedItem" class="modal-overlay" @click="closeItemModal">
        <div class="item-modal" :class="[`category-${selectedItem.category || 'item'}`]" @click.stop>
          <!-- Header -->
          <div class="modal-header">
            <div class="modal-img">
              <img :src="selectedItem.customImage ? getImageUrl(selectedItem.customImage) : itemImageUrl(selectedItem.id)" :alt="selectedItem.name" />
              <Icon v-if="selectedItem.category === 'quest'" icon="mdi:exclamation-thick" class="category-badge quest" />
              <Icon v-else-if="selectedItem.category === 'accessory'" icon="mdi:ring" class="category-badge accessory" />
            </div>
            <div class="modal-title-area">
              <h3 :class="[`category-text-${selectedItem.category || 'item'}`]">{{ selectedItem.name }}</h3>
              <!-- Attack chips — кликабельные -->
              <div v-if="selectedItem.attack && typeof selectedItem.attack === 'object'" class="attack-chips">
                <div 
                  class="attack-chip clickable" 
                  :class="{ negative: selectedItem.attack.short < 0, disabled: selectedItem.attack.short === undefined, selected: activeHint?.key === 'attack_short' }"
                  @click="showHint('attack_short')"
                >
                  <Icon icon="mdi:knife" />
                  <span>{{ selectedItem.attack.short !== undefined ? formatAttackValue(selectedItem.attack.short) : '—' }}</span>
                </div>
                <div 
                  class="attack-chip clickable" 
                  :class="{ negative: selectedItem.attack.long < 0, disabled: selectedItem.attack.long === undefined, selected: activeHint?.key === 'attack_long' }"
                  @click="showHint('attack_long')"
                >
                  <Icon icon="mdi:spear" />
                  <span>{{ selectedItem.attack.long !== undefined ? formatAttackValue(selectedItem.attack.long) : '—' }}</span>
                </div>
                <div 
                  v-if="selectedItem.attack.ranged !== undefined" 
                  class="attack-chip ranged clickable" 
                  :class="{ negative: selectedItem.attack.ranged < 0, selected: activeHint?.key === 'attack_ranged' }"
                  @click="showHint('attack_ranged')"
                >
                  <Icon icon="mdi:bow-arrow" />
                  <span>{{ formatAttackValue(selectedItem.attack.ranged) }}</span>
                </div>
              </div>
            </div>
            <button @click="closeItemModal" class="close-btn"><Icon icon="mdi:close" /></button>
          </div>

          <!-- Body -->
          <div class="modal-body">
            <!-- Secondary stats — кликабельные -->
            <div class="stats-row">
              <div 
                v-if="typeof selectedItem.defence === 'number' && selectedItem.defence > 0" 
                class="stat-chip clickable"
                :class="{ selected: activeHint?.key === 'defence' }"
                @click="showHint('defence')"
              >
                <Icon icon="mdi:shield" /><span>{{ selectedItem.defence }}</span><span class="label">защита</span>
              </div>
              <div 
                v-if="selectedItem.armorPen > 0" 
                class="stat-chip clickable"
                :class="{ selected: activeHint?.key === 'armorPen' }"
                @click="showHint('armorPen')"
              >
                <Icon icon="mdi:shield-off" /><span>{{ selectedItem.armorPen }}</span><span class="label">пробив.</span>
              </div>
              <div 
                v-if="selectedItem.damageType" 
                class="stat-chip type clickable"
                :class="{ selected: activeHint?.key === 'damageType' }"
                @click="showHint('damageType')"
              >
                <Icon icon="mdi:fire" /><span>{{ selectedItem.damageType }}</span>
              </div>
            </div>

            <!-- Shield defence table -->
            <div v-if="typeof selectedItem.defence === 'object'" class="shield-section">
              <div class="shield-table">
                <div class="shield-row header">
                  <div class="shield-cell"></div>
                  <div class="shield-cell">Ближ.</div>
                  <div class="shield-cell">Дальн.</div>
                </div>
                <div class="shield-row" v-if="selectedItem.defence.front">
                  <div class="shield-cell label">Спереди</div>
                  <div class="shield-cell value">{{ selectedItem.defence.front.melee || 0 }}</div>
                  <div class="shield-cell value">{{ selectedItem.defence.front.ranged || 0 }}</div>
                </div>
                <div class="shield-row" v-if="selectedItem.defence.side">
                  <div class="shield-cell label">С фланга</div>
                  <div class="shield-cell value">{{ selectedItem.defence.side.melee || 0 }}</div>
                  <div class="shield-cell value">{{ selectedItem.defence.side.ranged || 0 }}</div>
                </div>
              </div>
            </div>

            <!-- Damage scale — кликабельная -->
            <div v-if="selectedItem.damage" class="damage-section">
              <div class="damage-scale">
                <div
                  v-for="level in levels"
                  :key="level.key"
                  class="damage-level clickable"
                  :class="{ 
                    active: getDamageThreshold(selectedItem, level.key) !== null,
                    selected: activeHint?.type === 'damage' && activeHint?.key === level.key
                  }"
                  :style="getDamageLevelStyle(level, getDamageThreshold(selectedItem, level.key) !== null)"
                  @click="showDamageHint(level, getDamageThreshold(selectedItem, level.key))"
                >
                  <div class="damage-letter">{{ level.short }}</div>
                  <div class="damage-threshold" v-if="getDamageThreshold(selectedItem, level.key) !== null">
                    +{{ getDamageThreshold(selectedItem, level.key) }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Special properties -->
            <div v-if="selectedItem.spec || selectedItem.special" class="spec-box">
              <Icon icon="mdi:star-four-points" />
              <span>{{ selectedItem.special || selectedItem.spec }}</span>
            </div>

            <!-- Description -->
            <div v-if="selectedItem.desc" class="desc-box">
              {{ selectedItem.desc }}
            </div>

            <!-- Bottom info — кликабельные -->
            <div class="info-row">
              <div 
                v-if="selectedItem.price !== undefined" 
                class="info-chip clickable"
                :class="{ selected: activeHint?.key === 'price' }"
                @click="showHint('price')"
              >
                <Icon icon="mdi:gold" /><span>{{ selectedItem.price }}</span>
              </div>
              <div 
                v-if="selectedItem.epoch !== undefined" 
                class="info-chip clickable"
                :class="{ selected: activeHint?.key === 'epoch' }"
                @click="showHint('epoch')"
              >
                <Icon icon="mdi:clock-outline" /><span>{{ selectedItem.epoch }}</span>
              </div>
              <div 
                v-if="selectedItem.length" 
                class="info-chip clickable"
                :class="{ selected: activeHint?.key === 'length' }"
                @click="showHint('length')"
              >
                <Icon :icon="selectedItem.length === 2 ? 'mdi:arrow-expand-horizontal' : 'mdi:minus'" />
                <span>{{ getLengthLabel(selectedItem.length) }}</span>
              </div>
              <div 
                v-if="selectedItem.hands" 
                class="info-chip clickable"
                :class="{ selected: activeHint?.key === 'hands' }"
                @click="showHint('hands')"
              >
                <Icon icon="mdi:hand-back-left" /><span>{{ getHandsLabel(selectedItem.hands) }}</span>
              </div>
            </div>

            <!-- Hint area -->
            <div class="hint-area" v-if="activeHint">
              <div class="hint-title">{{ activeHint.title }}</div>
              <div class="hint-text">{{ activeHint.text }}</div>
            </div>
            <div class="hint-area placeholder" v-else>
              <Icon icon="mdi:gesture-tap" />
              <span>Нажмите на любой элемент для подробностей</span>
            </div>
          </div>

          <!-- Footer -->
          <div class="modal-footer">
            <template v-if="selectedItem.category === 'weapon' || selectedItem.category === 'shield'">
              <button v-if="(currentSet.weapons || []).includes(selectedItem.id)" @click="unequipWeapon(selectedItem.id); closeItemModal()" class="btn warning">
                <Icon icon="mdi:minus-circle" />Убрать
              </button>
              <button v-else-if="canAddWeapon(selectedItem.id)" @click="equipWeapon(selectedItem.id); closeItemModal()" class="btn primary">
                <Icon icon="mdi:plus-circle" />Взять
              </button>
              <button v-else class="btn disabled" disabled>
                <Icon icon="mdi:block-helper" />Нельзя добавить
              </button>
            </template>
            <button v-if="isMaster" @click="openEditItem(selectedItem)" class="btn edit">
              <Icon icon="mdi:pencil" />Редактировать
            </button>
            <button v-if="isMaster && selectedItem.id !== currentArmor?.id && !weaponSets.some(s => (s.weapons || []).includes(selectedItem.id))" @click="removeItemFromInventory(selectedItem.id); closeItemModal()" class="btn danger">
              <Icon icon="mdi:delete" />Удалить
            </button>
            <button @click="closeItemModal" class="btn close">Закрыть</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ===== ARMOR MODAL ===== -->
    <Teleport to="body">
      <div v-if="showArmorModal" class="modal-overlay" @click="showArmorModal = false">
        <div class="armor-modal" @click.stop>
          <div class="modal-header simple"><h3>Выбрать броню</h3><button @click="showArmorModal = false" class="close-btn"><Icon icon="mdi:close" /></button></div>
          <div class="armor-list">
            <div v-for="armor in (isMaster ? allArmors : inventoryArmors)" :key="armor.id" class="armor-option" :class="{ selected: currentArmor?.id === armor.id }" @click="equipArmor(armor.id)">
              <img :src="itemImageUrl(armor.id)" :alt="armor.name" />
              <div class="armor-info"><span class="name">{{ armor.name }}</span><div class="stats"><span>🛡️{{ armor.defence }}</span><span>💧{{ armor.resist }}</span><span v-if="armor.movement">👟{{ armor.movement }}</span></div></div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ===== ADD ITEM MODAL (Master) — используем ItemPicker ===== -->
    <Teleport to="body">
      <ItemPicker 
        v-if="showAddItemModal"
        title="Добавить предмет в инвентарь"
        :allow-custom="true"
        @select="addItemFromPicker"
        @create-custom="createNewItem"
        @close="showAddItemModal = false"
      />
    </Teleport>

    <!-- ===== EDIT ITEM MODAL (MASTER) ===== -->
    <Teleport to="body">
      <div v-if="showEditItemModal && editingItem && isMaster" class="modal-overlay" @click="cancelEditItem">
        <div class="edit-item-modal" :class="{ 'creating': isCreatingNewItem, [`category-${editingItem.category || 'item'}`]: true }" @click.stop>
          <div class="modal-header">
            <h3>{{ isCreatingNewItem ? 'Создание предмета' : 'Редактирование предмета' }}</h3>
            <div v-if="!isCreatingNewItem && isItemCustomized(editingItem.id)" class="custom-badge">
              <Icon icon="mdi:pencil-circle" />изменён
            </div>
            <button @click="cancelEditItem" class="close-btn"><Icon icon="mdi:close" /></button>
          </div>
          
          <div class="edit-modal-body">
            <!-- Верхний ряд: картинка + название + категория -->
            <div class="edit-header-row">
              <ImagePicker
                v-model="editingItem.customImage"
                category="items"
                :fallback-id="editingItem.id"
                :size="72"
              />
              <div class="edit-header-info">
                <input v-model="editingItem.name" type="text" class="edit-name-input" placeholder="Название предмета" />
                <div class="icon-btn-group category-selector">
                  <button v-for="cat in itemCategoryOptions" :key="cat.value" 
                    :class="{ active: editingItem.category === cat.value, [cat.value]: true }"
                    :title="cat.label"
                    @click="editingItem.category = cat.value">
                    <Icon :icon="cat.icon" />
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Подкатегория + цена/эпоха -->
            <div class="edit-meta-row">
              <div v-if="editingItem.category === 'weapon' || editingItem.category === 'shield'" class="icon-btn-group wrap">
                <button v-for="sub in weaponSubcatOptions" :key="sub.value"
                  :class="{ active: editingItem.subcat === sub.value }"
                  :title="sub.value"
                  @click="editingItem.subcat = sub.value">
                  <Icon :icon="sub.icon" />
                </button>
              </div>
              <div v-else-if="editingItem.category === 'armor'" class="icon-btn-group">
                <button v-for="sub in armorSubcatOptions" :key="sub.value"
                  :class="{ active: editingItem.subcat === sub.value }"
                  :title="sub.value"
                  @click="editingItem.subcat = sub.value">
                  <Icon :icon="sub.icon" />
                </button>
              </div>
              <div v-else-if="editingItem.category === 'accessory'" class="icon-btn-group">
                <button v-for="sub in accessorySubcatOptions" :key="sub.value"
                  :class="{ active: editingItem.subcat === sub.value }"
                  :title="sub.value"
                  @click="editingItem.subcat = sub.value">
                  <Icon :icon="sub.icon" />
                </button>
              </div>
              <div v-else class="spacer"></div>
              
              <div class="meta-values">
                <div class="meta-item" title="Цена">
                  <Icon icon="mdi:gold" class="gold" />
                  <input v-model.number="editingItem.price" type="number" min="0" max="15" />
                </div>
                <div class="meta-item" title="Эпоха">
                  <Icon icon="mdi:clock-outline" class="epoch" />
                  <input v-model.number="editingItem.epoch" type="number" min="1" max="10" />
                </div>
              </div>
            </div>
            
            <!-- Для оружия -->
            <template v-if="editingItem.category === 'weapon' || editingItem.category === 'shield'">
              <!-- Руки + Длина -->
              <div class="edit-compact-row">
                <div class="compact-group">
                  <span class="group-label"><Icon icon="mdi:hand-back-left" />Руки</span>
                  <div class="icon-btn-group compact">
                    <button :class="{ active: editingItem.hands === 0.5 }" @click="editingItem.hands = 0.5">½</button>
                    <button :class="{ active: editingItem.hands === 1 }" @click="editingItem.hands = 1">1</button>
                    <button :class="{ active: editingItem.hands === 1.5 }" @click="editingItem.hands = 1.5">1½</button>
                    <button :class="{ active: editingItem.hands === 2 }" @click="editingItem.hands = 2">2</button>
                  </div>
                </div>
                <div class="compact-group">
                  <span class="group-label"><Icon icon="mdi:arrow-expand-horizontal" />Длина</span>
                  <div class="icon-btn-group compact">
                    <button :class="{ active: editingItem.length === 1 }" @click="editingItem.length = 1"><Icon icon="mdi:minus" /></button>
                    <button :class="{ active: editingItem.length === 2 }" @click="editingItem.length = 2"><Icon icon="mdi:arrow-left-right" /></button>
                  </div>
                </div>
              </div>
              
              <!-- Боевые характеристики: атаки -->
              <div class="combat-stats-grid attacks-grid">
                <div class="stat-cell attack" :class="{ empty: editingItem.attack?.short === undefined }">
                  <div class="stat-header"><Icon icon="mdi:knife" />Ближ.</div>
                  <div class="stat-value">
                    <button class="adj-btn" @click="adjustAttack('short', -1)"><Icon icon="mdi:minus" /></button>
                    <span :class="{ negative: (editingItem.attack?.short ?? 0) < 0 }" @dblclick="clearAttack('short')">
                      {{ editingItem.attack?.short ?? '—' }}
                    </span>
                    <button class="adj-btn" @click="adjustAttack('short', 1)"><Icon icon="mdi:plus" /></button>
                  </div>
                </div>
                <div class="stat-cell attack" :class="{ empty: editingItem.attack?.long === undefined }">
                  <div class="stat-header"><Icon icon="mdi:spear" />Длин.</div>
                  <div class="stat-value">
                    <button class="adj-btn" @click="adjustAttack('long', -1)"><Icon icon="mdi:minus" /></button>
                    <span :class="{ negative: (editingItem.attack?.long ?? 0) < 0 }" @dblclick="clearAttack('long')">
                      {{ editingItem.attack?.long ?? '—' }}
                    </span>
                    <button class="adj-btn" @click="adjustAttack('long', 1)"><Icon icon="mdi:plus" /></button>
                  </div>
                </div>
                <div class="stat-cell attack ranged" :class="{ empty: editingItem.attack?.ranged === undefined }">
                  <div class="stat-header"><Icon icon="mdi:bow-arrow" />Дальн.</div>
                  <div class="stat-value">
                    <button class="adj-btn" @click="adjustAttack('ranged', -1)"><Icon icon="mdi:minus" /></button>
                    <span :class="{ negative: (editingItem.attack?.ranged ?? 0) < 0 }" @dblclick="clearAttack('ranged')">
                      {{ editingItem.attack?.ranged ?? '—' }}
                    </span>
                    <button class="adj-btn" @click="adjustAttack('ranged', 1)"><Icon icon="mdi:plus" /></button>
                  </div>
                </div>
                <div class="stat-cell armor-pen">
                  <div class="stat-header"><Icon icon="mdi:shield-off" />Пробив.</div>
                  <div class="stat-value">
                    <button class="adj-btn" @click="adjustField('armorPen', -1)"><Icon icon="mdi:minus" /></button>
                    <span>{{ editingItem.armorPen ?? 0 }}</span>
                    <button class="adj-btn" @click="adjustField('armorPen', 1)"><Icon icon="mdi:plus" /></button>
                  </div>
                </div>
              </div>
              
              <!-- Защита: простая или сложная -->
              <div class="defence-section">
                <div class="defence-header">
                  <span class="defence-title"><Icon icon="mdi:shield" />Защита</span>
                  <button class="mode-toggle" @click="toggleDefenceMode" :title="isComplexDefence ? 'Простая защита' : 'Сложная защита (для щитов)'">
                    <Icon :icon="isComplexDefence ? 'mdi:view-grid' : 'mdi:numeric'" />
                    {{ isComplexDefence ? 'Сложная' : 'Простая' }}
                  </button>
                </div>
                
                <!-- Простая защита -->
                <div v-if="!isComplexDefence" class="simple-defence">
                  <div class="stat-cell defence inline">
                    <div class="stat-value">
                      <button class="adj-btn" @click="adjustField('defence', -1)"><Icon icon="mdi:minus" /></button>
                      <span>{{ editingItem.defence ?? 0 }}</span>
                      <button class="adj-btn" @click="adjustField('defence', 1)"><Icon icon="mdi:plus" /></button>
                    </div>
                  </div>
                </div>
                
                <!-- Сложная защита (для щитов) -->
                <div v-else class="complex-defence">
                  <!-- Front -->
                  <div class="defence-direction" v-if="editingItem.defence?.front">
                    <div class="direction-label">
                      <Icon icon="mdi:arrow-up-bold" />Спереди
                      <button class="remove-btn" @click="removeDefenceDirection('front')" title="Удалить"><Icon icon="mdi:close" /></button>
                    </div>
                    <div class="direction-stats">
                      <div class="mini-stat melee">
                        <span class="mini-label"><Icon icon="mdi:sword-cross" /></span>
                        <button class="adj-btn" @click="adjustComplexDefence('front', 'melee', -1)"><Icon icon="mdi:minus" /></button>
                        <span class="mini-value">{{ editingItem.defence.front.melee ?? 0 }}</span>
                        <button class="adj-btn" @click="adjustComplexDefence('front', 'melee', 1)"><Icon icon="mdi:plus" /></button>
                      </div>
                      <div class="mini-stat ranged">
                        <span class="mini-label"><Icon icon="mdi:bow-arrow" /></span>
                        <button class="adj-btn" @click="adjustComplexDefence('front', 'ranged', -1)"><Icon icon="mdi:minus" /></button>
                        <span class="mini-value">{{ editingItem.defence.front.ranged ?? 0 }}</span>
                        <button class="adj-btn" @click="adjustComplexDefence('front', 'ranged', 1)"><Icon icon="mdi:plus" /></button>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Side -->
                  <div class="defence-direction" v-if="editingItem.defence?.side">
                    <div class="direction-label">
                      <Icon icon="mdi:arrow-left-right-bold" />С боков
                      <button class="remove-btn" @click="removeDefenceDirection('side')" title="Удалить"><Icon icon="mdi:close" /></button>
                    </div>
                    <div class="direction-stats">
                      <div class="mini-stat melee">
                        <span class="mini-label"><Icon icon="mdi:sword-cross" /></span>
                        <button class="adj-btn" @click="adjustComplexDefence('side', 'melee', -1)"><Icon icon="mdi:minus" /></button>
                        <span class="mini-value">{{ editingItem.defence.side.melee ?? 0 }}</span>
                        <button class="adj-btn" @click="adjustComplexDefence('side', 'melee', 1)"><Icon icon="mdi:plus" /></button>
                      </div>
                      <div class="mini-stat ranged">
                        <span class="mini-label"><Icon icon="mdi:bow-arrow" /></span>
                        <button class="adj-btn" @click="adjustComplexDefence('side', 'ranged', -1)"><Icon icon="mdi:minus" /></button>
                        <span class="mini-value">{{ editingItem.defence.side.ranged ?? 0 }}</span>
                        <button class="adj-btn" @click="adjustComplexDefence('side', 'ranged', 1)"><Icon icon="mdi:plus" /></button>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Add direction buttons -->
                  <div class="add-direction-row">
                    <button v-if="!editingItem.defence?.front" class="add-direction-btn" @click="addDefenceDirection('front')">
                      <Icon icon="mdi:plus" />Спереди
                    </button>
                    <button v-if="!editingItem.defence?.side" class="add-direction-btn" @click="addDefenceDirection('side')">
                      <Icon icon="mdi:plus" />С боков
                    </button>
                  </div>
                </div>
              </div>
              
              <!-- Тип урона -->
              <div class="damage-type-section">
                <input v-model="editingItem.damageType" type="text" class="damage-type-input" placeholder="Тип урона" />
              </div>
              
              <!-- Урон по уровням - компактный ряд -->
              <div class="damage-levels-row">
                <div v-for="lvl in levels" :key="lvl.key" 
                  class="damage-level-cell" 
                  :class="{ 'light-text': lvl.lightText, 'has-value': editingItem.damage?.[lvl.key] !== undefined }"
                  :style="{ '--level-color': lvl.color }"
                  :title="lvl.names?.damage?.ru || lvl.short">
                  <button class="adj-btn top" @click="adjustDamage(lvl.key, 1)"><Icon icon="mdi:chevron-up" /></button>
                  <div class="damage-value" 
                    :class="{ empty: editingItem.damage?.[lvl.key] === undefined }"
                    @dblclick="clearDamage(lvl.key)">
                    {{ editingItem.damage?.[lvl.key] ?? '—' }}
                  </div>
                  <button class="adj-btn bottom" @click="adjustDamage(lvl.key, -1)"><Icon icon="mdi:chevron-down" /></button>
                </div>
              </div>
            </template>
            
            <!-- Для брони -->
            <template v-if="editingItem.category === 'armor'">
              <div class="combat-stats-grid armor-grid">
                <div class="stat-cell defence">
                  <div class="stat-header"><Icon icon="mdi:shield" />Защита</div>
                  <div class="stat-value">
                    <button class="adj-btn" @click="adjustField('defence', -1)"><Icon icon="mdi:minus" /></button>
                    <span>{{ editingItem.defence ?? 0 }}</span>
                    <button class="adj-btn" @click="adjustField('defence', 1)"><Icon icon="mdi:plus" /></button>
                  </div>
                </div>
                <div class="stat-cell resist">
                  <div class="stat-header"><Icon icon="mdi:shield-half-full" />Сопрот.</div>
                  <div class="stat-value">
                    <button class="adj-btn" @click="adjustField('resist', -1)"><Icon icon="mdi:minus" /></button>
                    <span>{{ editingItem.resist ?? 0 }}</span>
                    <button class="adj-btn" @click="adjustField('resist', 1)"><Icon icon="mdi:plus" /></button>
                  </div>
                </div>
                <div class="stat-cell movement">
                  <div class="stat-header"><Icon icon="mdi:run" />Движ.</div>
                  <div class="stat-value">
                    <button class="adj-btn" @click="adjustField('movement', -1)"><Icon icon="mdi:minus" /></button>
                    <span :class="{ negative: (editingItem.movement || 0) < 0 }">{{ editingItem.movement ?? 0 }}</span>
                    <button class="adj-btn" @click="adjustField('movement', 1)"><Icon icon="mdi:plus" /></button>
                  </div>
                </div>
                <div class="stat-cell bursts">
                  <div class="stat-header"><Icon icon="mdi:flash" />Порывы</div>
                  <div class="stat-value">
                    <button class="adj-btn" @click="adjustField('bursts', -1)"><Icon icon="mdi:minus" /></button>
                    <span :class="{ negative: (editingItem.bursts || 0) < 0 }">{{ editingItem.bursts ?? 0 }}</span>
                    <button class="adj-btn" @click="adjustField('bursts', 1)"><Icon icon="mdi:plus" /></button>
                  </div>
                </div>
              </div>
            </template>
            
            <!-- Для аксессуаров -->
            <template v-if="editingItem.category === 'accessory'">
              <div class="accessory-info">
                <Icon icon="mdi:information-outline" class="info-icon" />
                <span>Аксессуары работают, пока находятся в инвентаре. Эффект описывается в особых свойствах.</span>
              </div>
              <div class="combat-stats-grid accessory-grid">
                <div class="stat-cell defence">
                  <div class="stat-header"><Icon icon="mdi:shield" />Защита</div>
                  <div class="stat-value">
                    <button class="adj-btn" @click="adjustField('defence', -1)"><Icon icon="mdi:minus" /></button>
                    <span>{{ editingItem.defence ?? 0 }}</span>
                    <button class="adj-btn" @click="adjustField('defence', 1)"><Icon icon="mdi:plus" /></button>
                  </div>
                </div>
                <div class="stat-cell resist">
                  <div class="stat-header"><Icon icon="mdi:shield-half-full" />Сопрот.</div>
                  <div class="stat-value">
                    <button class="adj-btn" @click="adjustField('resist', -1)"><Icon icon="mdi:minus" /></button>
                    <span>{{ editingItem.resist ?? 0 }}</span>
                    <button class="adj-btn" @click="adjustField('resist', 1)"><Icon icon="mdi:plus" /></button>
                  </div>
                </div>
                <div class="stat-cell movement">
                  <div class="stat-header"><Icon icon="mdi:run" />Движ.</div>
                  <div class="stat-value">
                    <button class="adj-btn" @click="adjustField('movement', -1)"><Icon icon="mdi:minus" /></button>
                    <span :class="{ negative: (editingItem.movement || 0) < 0 }">{{ editingItem.movement ?? 0 }}</span>
                    <button class="adj-btn" @click="adjustField('movement', 1)"><Icon icon="mdi:plus" /></button>
                  </div>
                </div>
                <div class="stat-cell bursts">
                  <div class="stat-header"><Icon icon="mdi:flash" />Порывы</div>
                  <div class="stat-value">
                    <button class="adj-btn" @click="adjustField('bursts', -1)"><Icon icon="mdi:minus" /></button>
                    <span :class="{ negative: (editingItem.bursts || 0) < 0 }">{{ editingItem.bursts ?? 0 }}</span>
                    <button class="adj-btn" @click="adjustField('bursts', 1)"><Icon icon="mdi:plus" /></button>
                  </div>
                </div>
              </div>
            </template>
            
            <!-- Особые свойства (жёлтый текст) -->
            <div class="text-section special">
              <div class="text-label"><Icon icon="mdi:star" />Особые свойства</div>
              <textarea v-model="editingItem.special" rows="2" placeholder="Игнорирует 2 очка защиты при критическом ударе..."></textarea>
            </div>
            
            <!-- Описание -->
            <div class="text-section">
              <div class="text-label"><Icon icon="mdi:text" />Описание</div>
              <textarea v-model="editingItem.desc" rows="2" placeholder="Описание предмета..."></textarea>
            </div>
          </div>
          
          <div class="modal-footer edit-footer">
            <button v-if="!isCreatingNewItem && !editingItem.isCustom && isItemCustomized(editingItem.id)" @click="resetItemToDefault" class="btn warning">
              <Icon icon="mdi:restore" />Сбросить
            </button>
            <button @click="cancelEditItem" class="btn close">Отмена</button>
            <button @click="saveEditedItem" class="btn primary">
              <Icon icon="mdi:check" />{{ isCreatingNewItem ? 'Создать' : 'Сохранить' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ===== BACKPACK MODAL ===== -->
    <Teleport to="body">
      <div v-if="showBackpackModal" class="modal-overlay" @click="showBackpackModal = false">
        <div class="backpack-modal" @click.stop>
          <div class="backpack-modal-header">
            <div class="header-title">
              <Icon icon="mdi:bag-personal" />
              <h3>Рюкзак</h3>
              <span class="count">({{ backpackItems.length }})</span>
            </div>
            <button class="close-btn" @click="showBackpackModal = false"><Icon icon="mdi:close" /></button>
          </div>
          
          <!-- Фильтры -->
          <div class="backpack-filters">
            <button 
              v-for="(label, key) in { all: 'Все', weapon: 'Оружие', shield: 'Щиты', armor: 'Броня', other: 'Прочее' }" 
              :key="key" 
              class="filter-btn" 
              :class="{ active: backpackFilter === key }"
              @click="backpackFilter = key"
            >
              {{ label }}
              <span v-if="backpackCounts[key]" class="filter-count">{{ backpackCounts[key] }}</span>
            </button>
          </div>
          
          <!-- Содержимое -->
          <div class="backpack-content">
            <div v-if="filteredBackpackItems.length" class="backpack-grid">
              <div v-for="item in filteredBackpackItems" :key="item._instanceId || item.id" class="backpack-item" :class="[`category-${item.category || 'item'}`]" @click="openItemModal(item); showBackpackModal = false">
                <div class="item-img-wrapper">
                  <img :src="item.customImage ? getImageUrl(item.customImage) : itemImageUrl(item.id)" :alt="item.name" class="item-img" />
                  <Icon v-if="item.category === 'quest'" icon="mdi:exclamation-thick" class="category-icon quest" />
                  <Icon v-else-if="item.category === 'accessory'" icon="mdi:ring" class="category-icon accessory" />
                </div>
                <div class="item-info">
                  <span class="item-name">{{ item.name }}</span>
                  <span class="item-category">{{ item.category }}</span>
                </div>
                <button v-if="isMaster" @click.stop="removeItemFromInventory(item._instanceId || item.id)" class="item-remove"><Icon icon="mdi:delete" /></button>
              </div>
            </div>
            <div v-else class="backpack-empty">
              <Icon icon="mdi:bag-personal-off" />
              <span>{{ backpackFilter === 'all' ? 'Рюкзак пуст' : 'Нет предметов в этой категории' }}</span>
            </div>
          </div>
          
          <!-- Кнопка добавления (мастер) -->
          <div v-if="isMaster" class="backpack-footer">
            <button class="add-item-btn" @click="showAddItemModal = true; showBackpackModal = false">
              <Icon icon="mdi:plus" />Добавить предмет
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.equipment-view { display: flex; flex-direction: column; gap: 0.75rem; }

/* ===== SLOT MACHINE DOLL ===== */
.doll-container { 
  display: grid; 
  grid-template-columns: 1fr auto 1fr; 
  gap: 0.25rem; 
  padding: 0.5rem 0; 
  position: relative;
}

.hand-carousel { 
  display: flex; 
  flex-direction: column; 
  align-items: center; 
  gap: 0.25rem;
}

.slot-item { 
  transition: all 0.25s ease-out;
}

.slot-item.prev, .slot-item.next { 
  opacity: 0.35; 
  transform: scale(0.7); 
  cursor: pointer; 
}
.slot-item.prev:hover, .slot-item.next:hover { opacity: 0.55; }
.slot-item.current { display: flex; flex-direction: column; align-items: center; }

/* Анимация переключения */
.doll-container.animating.anim-up .slot-item { transform: translateY(30px); opacity: 0.5; }
.doll-container.animating.anim-down .slot-item { transform: translateY(-30px); opacity: 0.5; }
.doll-container.animating .slot-item.current { transform: translateY(0); opacity: 1; }

/* Слот оружия — ВЕРТИКАЛЬНЫЙ */
.weapon-slot { 
  position: relative; 
  width: 64px; 
  height: 100px; /* Увеличенная высота */
  background: rgba(30, 41, 59, 0.6); 
  border: 2px dashed rgba(100, 116, 139, 0.4); 
  border-radius: 0.5rem; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  transition: all 0.2s; 
}
.weapon-slot.ghost { 
  width: 48px; 
  height: 75px; 
  border-color: rgba(100, 116, 139, 0.2); 
}
.weapon-slot.occupied { border-style: solid; border-color: rgba(16, 185, 129, 0.5); cursor: pointer; }
.weapon-slot.two-handed { border-color: rgba(251, 191, 36, 0.5); }

.weapon-img { max-width: 90%; max-height: 90%; object-fit: contain; }
.empty-icon { width: 24px; height: 24px; color: rgba(100, 116, 139, 0.4); }
.slot-label { font-size: 0.65rem; color: #64748b; margin-top: 0.25rem; }

.weapon-slot .remove-btn { 
  position: absolute; top: -6px; right: -6px; 
  width: 18px; height: 18px; 
  background: #ef4444; border: none; border-radius: 50%; 
  color: white; display: flex; align-items: center; justify-content: center; 
  cursor: pointer; font-size: 0.7rem; opacity: 0; transition: opacity 0.2s; 
}
.weapon-slot:hover .remove-btn { opacity: 1; }

/* Бейдж связи для двуручного */
.link-badge { 
  position: absolute; 
  bottom: 4px; 
  width: 16px; height: 16px; 
  background: rgba(251, 191, 36, 0.8); 
  border-radius: 50%; 
  display: flex; align-items: center; justify-content: center;
  font-size: 0.6rem; color: #1e293b;
}
.link-badge.left { right: -4px; }
.link-badge.right { left: -4px; }

/* ===== ARMOR CENTER — КРУПНАЯ ===== */
.armor-center { display: flex; flex-direction: column; align-items: center; padding: 0 0.5rem; }

.armor-slot { 
  position: relative; 
  width: 140px;  /* Крупнее! */
  height: 180px; /* Крупнее! */
  background: rgba(30, 41, 59, 0.6); 
  border: 2px solid rgba(100, 116, 139, 0.3); 
  border-radius: 0.75rem; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  cursor: pointer; 
  transition: all 0.2s; 
}
.armor-slot:hover { border-color: rgba(56, 189, 248, 0.5); }
.armor-img { max-width: 90%; max-height: 85%; object-fit: contain; }

.armor-stats { 
  position: absolute; bottom: 8px; 
  display: flex; gap: 0.5rem; 
}
.armor-stats .stat { 
  display: flex; align-items: center; gap: 3px; 
  font-size: 0.75rem; 
  padding: 2px 6px; 
  background: rgba(0, 0, 0, 0.7); 
  border-radius: 4px; color: white; 
}
.armor-stats .def { color: #34d399; }
.armor-stats .res { color: #60a5fa; }

.armor-name { 
  font-size: 0.8rem; color: #94a3b8; 
  margin-top: 0.375rem; text-align: center; 
  max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; 
}

/* Название набора — кликабельное для всех */
.set-name-display { 
  display: flex; align-items: center; gap: 0.375rem; 
  margin-top: 0.5rem; padding: 0.375rem 0.625rem; 
  background: rgba(251, 191, 36, 0.1); 
  border: 1px solid rgba(251, 191, 36, 0.3); 
  border-radius: 0.375rem; 
  font-size: 0.8rem; color: #fbbf24; 
  cursor: pointer;
  transition: all 0.15s;
}
.set-name-display:hover { background: rgba(251, 191, 36, 0.2); }
.edit-icon { width: 12px; height: 12px; opacity: 0.6; }
.set-name-input { 
  background: transparent; border: none; 
  color: #fbbf24; font-size: 0.8rem; 
  width: 100px; outline: none; 
}

/* ===== INVENTORY CAROUSEL ===== */
.inventory-carousel { 
  display: flex; 
  align-items: center; 
  gap: 0.5rem;
  padding: 0.5rem 0; 
  border-top: 1px solid rgba(100, 116, 139, 0.15); 
}
.carousel-track { 
  flex: 1;
  display: flex; 
  gap: 0.5rem; 
  overflow-x: auto; 
  padding: 0.25rem; 
  scrollbar-width: none; 
}
.carousel-track::-webkit-scrollbar { display: none; }
.carousel-item { 
  flex-shrink: 0; width: 48px; height: 64px; 
  background: rgba(30, 41, 59, 0.5); 
  border: 2px solid rgba(100, 116, 139, 0.3); 
  border-radius: 0.375rem; 
  display: flex; align-items: center; justify-content: center; 
  cursor: pointer; position: relative; transition: all 0.15s; 
}
.carousel-item img { max-width: 85%; max-height: 85%; object-fit: contain; }
.carousel-item:hover { border-color: rgba(56, 189, 248, 0.5); transform: scale(1.05); }
.carousel-item.equipped { border-color: rgba(16, 185, 129, 0.6); background: rgba(16, 185, 129, 0.1); }
.carousel-item.disabled { opacity: 0.4; }
.equipped-badge { 
  position: absolute; top: -4px; right: -4px; 
  width: 14px; height: 14px; background: #10b981; 
  border-radius: 50%; display: flex; align-items: center; justify-content: center; 
  color: white; font-size: 0.6rem; 
}
.carousel-empty { color: #64748b; font-size: 0.75rem; padding: 0.5rem 1rem; }

/* Carousel Actions */
.carousel-actions { 
  display: flex; 
  flex-direction: column;
  gap: 0.25rem;
  padding-right: 0.25rem;
}
.action-btn {
  width: 32px; height: 32px;
  border: 2px solid rgba(100, 116, 139, 0.3);
  background: rgba(30, 41, 59, 0.5);
  border-radius: 0.375rem;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  color: #94a3b8;
  transition: all 0.15s;
  position: relative;
}
.action-btn:hover { border-color: rgba(56, 189, 248, 0.5); color: #e2e8f0; }
.action-btn.backpack { color: #fbbf24; }
.action-btn.backpack.has-items { border-color: rgba(251, 191, 36, 0.4); background: rgba(251, 191, 36, 0.1); }
.action-btn.backpack .badge {
  position: absolute; top: -6px; right: -6px;
  min-width: 16px; height: 16px;
  background: #f59e0b;
  border-radius: 8px;
  font-size: 0.65rem;
  font-weight: 700;
  color: #1e293b;
  display: flex; align-items: center; justify-content: center;
  padding: 0 3px;
}
.action-btn.add-set { color: #10b981; }
.action-btn.add-set:hover { border-color: rgba(16, 185, 129, 0.5); background: rgba(16, 185, 129, 0.1); }
.action-btn.delete-set { color: #f87171; }
.action-btn.delete-set:hover { border-color: rgba(248, 113, 113, 0.5); background: rgba(248, 113, 113, 0.1); }

/* ===== STATS BAR ===== */
.stats-bar { display: flex; justify-content: center; gap: 0.75rem; padding: 0.5rem; flex-wrap: wrap; }
.stats-bar.top { 
  background: rgba(30, 41, 59, 0.3);
  border-radius: 0.5rem;
  border: 1px solid rgba(100, 116, 139, 0.15);
}
.stat-item { display: flex; flex-direction: column; align-items: center; min-width: 44px; }
.stat-icon { width: 18px; height: 18px; }
.stat-icon.def { color: #34d399; }
.stat-icon.res { color: #60a5fa; }
.stat-icon.atk { color: #f87171; }
.stat-icon.rng { color: #a78bfa; }
.stat-icon.mov { color: #fbbf24; }
.stat-value { font-size: 0.9rem; font-weight: 700; color: #e2e8f0; }
.stat-value.positive { color: #34d399; }
.stat-value.negative { color: #f87171; }
.stat-label { font-size: 0.55rem; color: #64748b; text-transform: uppercase; }

/* ===== BACKPACK MODAL ===== */
.backpack-modal {
  width: 90vw;
  max-width: 480px;
  max-height: 85vh;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border-radius: 0.75rem;
  border: 1px solid rgba(100, 116, 139, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.backpack-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: rgba(30, 41, 59, 0.5);
  border-bottom: 1px solid rgba(100, 116, 139, 0.2);
}
.backpack-modal-header .header-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #fbbf24;
}
.backpack-modal-header h3 {
  margin: 0;
  font-size: 1rem;
  color: #e2e8f0;
}
.backpack-modal-header .count {
  color: #64748b;
  font-size: 0.85rem;
}
.backpack-modal-header .close-btn {
  width: 28px; height: 28px;
  background: rgba(100, 116, 139, 0.2);
  border: none;
  border-radius: 0.25rem;
  color: #94a3b8;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.backpack-modal-header .close-btn:hover { background: rgba(248, 113, 113, 0.3); color: #f87171; }

/* Backpack Filters */
.backpack-filters {
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid rgba(100, 116, 139, 0.15);
  overflow-x: auto;
  scrollbar-width: none;
}
.backpack-filters::-webkit-scrollbar { display: none; }
.filter-btn {
  flex-shrink: 0;
  padding: 0.35rem 0.65rem;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(100, 116, 139, 0.25);
  border-radius: 1rem;
  color: #94a3b8;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.filter-btn:hover { border-color: rgba(56, 189, 248, 0.4); color: #e2e8f0; }
.filter-btn.active { 
  background: rgba(56, 189, 248, 0.2); 
  border-color: rgba(56, 189, 248, 0.5); 
  color: #38bdf8;
}
.filter-btn .filter-count {
  min-width: 16px; height: 16px;
  background: rgba(100, 116, 139, 0.3);
  border-radius: 8px;
  font-size: 0.65rem;
  display: flex; align-items: center; justify-content: center;
  padding: 0 4px;
}
.filter-btn.active .filter-count {
  background: rgba(56, 189, 248, 0.3);
}

/* Backpack Content */
.backpack-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}
.backpack-modal .backpack-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
}
.backpack-modal .backpack-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(100, 116, 139, 0.2);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}
.backpack-modal .backpack-item:hover {
  border-color: rgba(56, 189, 248, 0.4);
  background: rgba(56, 189, 248, 0.1);
}
.backpack-modal .backpack-item .item-img {
  width: 40px; height: 40px;
  object-fit: contain;
}
.backpack-modal .backpack-item .item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.backpack-modal .backpack-item .item-name {
  font-size: 0.8rem;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.backpack-modal .backpack-item .item-category {
  font-size: 0.65rem;
  color: #64748b;
  text-transform: capitalize;
}
.backpack-modal .backpack-item .item-remove {
  width: 24px; height: 24px;
  background: rgba(248, 113, 113, 0.15);
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 0.25rem;
  color: #f87171;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}
.backpack-modal .backpack-item:hover .item-remove { opacity: 1; }
.backpack-modal .backpack-item .item-remove:hover { 
  background: rgba(248, 113, 113, 0.3); 
}

/* Item category styles */
.backpack-modal .backpack-item .item-img-wrapper {
  position: relative;
  width: 40px;
  height: 40px;
}
.backpack-modal .backpack-item .item-img-wrapper .item-img {
  width: 100%;
  height: 100%;
}
.backpack-modal .backpack-item .category-icon {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  filter: drop-shadow(0 0 2px rgba(0,0,0,0.5));
}
.backpack-modal .backpack-item .category-icon.quest {
  color: #fbbf24;
}
.backpack-modal .backpack-item .category-icon.accessory {
  color: #a855f7;
}
.backpack-modal .backpack-item.category-quest {
  border-color: rgba(251, 191, 36, 0.3);
}
.backpack-modal .backpack-item.category-quest:hover {
  border-color: rgba(251, 191, 36, 0.5);
  background: rgba(251, 191, 36, 0.1);
}
.backpack-modal .backpack-item.category-quest .item-name {
  color: #fbbf24;
}
.backpack-modal .backpack-item.category-accessory {
  border-color: rgba(168, 85, 247, 0.3);
}
.backpack-modal .backpack-item.category-accessory:hover {
  border-color: rgba(168, 85, 247, 0.5);
  background: rgba(168, 85, 247, 0.1);
}
.backpack-modal .backpack-item.category-accessory .item-name {
  color: #a855f7;
}

.backpack-modal .backpack-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: #64748b;
  gap: 0.5rem;
}
.backpack-modal .backpack-empty svg { width: 48px; height: 48px; opacity: 0.3; }

/* Backpack Footer */
.backpack-footer {
  padding: 0.75rem;
  border-top: 1px solid rgba(100, 116, 139, 0.15);
}
.add-item-btn {
  width: 100%;
  padding: 0.6rem 1rem;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.4);
  border-radius: 0.375rem;
  color: #10b981;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.15s;
}
.add-item-btn:hover {
  background: rgba(16, 185, 129, 0.25);
  border-color: rgba(16, 185, 129, 0.6);
}

/* ===== MODALS ===== */
.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1rem; }
.item-modal, .armor-modal, .add-item-modal { background: #1e293b; border: 1px solid rgba(100, 116, 139, 0.3); border-radius: 0.75rem; width: 100%; max-width: 360px; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; }
.item-modal.category-quest { border-color: rgba(251, 191, 36, 0.4); box-shadow: 0 0 20px rgba(251, 191, 36, 0.1); }
.item-modal.category-accessory { border-color: rgba(168, 85, 247, 0.4); box-shadow: 0 0 20px rgba(168, 85, 247, 0.15); }
.add-item-modal { max-width: 90vw; max-height: 80vh; }
.modal-header { display: flex; align-items: flex-start; gap: 0.75rem; padding: 1rem; border-bottom: 1px solid rgba(100, 116, 139, 0.2); }
.modal-header.simple { align-items: center; }
.modal-header.simple h3 { flex: 1; font-size: 1rem; color: #e2e8f0; }
.modal-img { position: relative; width: 56px; height: 72px; flex-shrink: 0; background: rgba(15, 23, 42, 0.5); border-radius: 0.5rem; display: flex; align-items: center; justify-content: center; }
.modal-img img { max-width: 90%; max-height: 90%; object-fit: contain; }
.modal-img .category-badge { position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; filter: drop-shadow(0 0 3px rgba(0,0,0,0.5)); }
.modal-img .category-badge.quest { color: #fbbf24; }
.modal-img .category-badge.accessory { color: #a855f7; }
.modal-title-area { flex: 1; min-width: 0; }
.modal-title-area h3 { font-size: 1rem; font-weight: 600; color: #e2e8f0; margin-bottom: 0.375rem; }
.modal-title-area h3.category-text-quest { color: #fbbf24; }
.modal-title-area h3.category-text-accessory { color: #c084fc; }
.attack-chips { display: flex; gap: 0.375rem; flex-wrap: wrap; }
.chip { display: flex; align-items: center; gap: 0.2rem; padding: 0.2rem 0.4rem; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 0.25rem; font-size: 0.7rem; color: #f87171; }
.chip.ranged { background: rgba(167, 139, 250, 0.15); border-color: rgba(167, 139, 250, 0.3); color: #a78bfa; }
.close-btn { width: 28px; height: 28px; background: transparent; border: none; color: #64748b; cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
.close-btn:hover { background: rgba(100, 116, 139, 0.2); color: #94a3b8; }
.modal-body { flex: 1; overflow-y: auto; padding: 1rem; }
.item-desc { font-size: 0.8rem; color: #94a3b8; font-style: italic; margin-bottom: 1rem; padding: 0.5rem; background: rgba(15, 23, 42, 0.3); border-left: 3px solid #475569; border-radius: 0 0.25rem 0.25rem 0; }
.section-label { display: block; font-size: 0.7rem; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase; }
.damage-section { margin-bottom: 1rem; }
.damage-scale { display: flex; gap: 0.25rem; }
.damage-cell { flex: 1; padding: 0.375rem 0.25rem; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(100, 116, 139, 0.2); border-radius: 0.25rem; text-align: center; opacity: 0.4; }
.damage-cell.active { opacity: 1; border-color: var(--level-color); border-width: 2px; }
.damage-cell .letter { display: block; font-size: 0.6rem; font-weight: 700; color: var(--level-color); }
.damage-cell .value { display: block; font-size: 0.75rem; color: #e2e8f0; }
.modal-footer { display: flex; gap: 0.5rem; padding: 1rem; border-top: 1px solid rgba(100, 116, 139, 0.2); }
.btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.375rem; padding: 0.625rem; border: 1px solid; border-radius: 0.375rem; font-size: 0.75rem; cursor: pointer; transition: all 0.2s; }
.btn.primary { background: rgba(56, 189, 248, 0.15); border-color: rgba(56, 189, 248, 0.4); color: #7dd3fc; }
.btn.primary:hover { background: rgba(56, 189, 248, 0.25); }
.btn.warning { background: rgba(251, 191, 36, 0.15); border-color: rgba(251, 191, 36, 0.4); color: #fbbf24; }
.btn.danger { background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.4); color: #f87171; }
.btn.disabled { background: rgba(100, 116, 139, 0.1); border-color: rgba(100, 116, 139, 0.2); color: #64748b; cursor: not-allowed; }

/* Armor modal */
.armor-list { padding: 0.5rem; display: flex; flex-direction: column; gap: 0.375rem; max-height: 400px; overflow-y: auto; }
.armor-option { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem; background: rgba(15, 23, 42, 0.4); border: 2px solid transparent; border-radius: 0.5rem; cursor: pointer; transition: all 0.15s; }
.armor-option:hover { background: rgba(30, 41, 59, 0.6); }
.armor-option.selected { border-color: #10b981; background: rgba(16, 185, 129, 0.1); }
.armor-option img { width: 48px; height: 60px; object-fit: contain; }
.armor-option .armor-info { flex: 1; }
.armor-option .name { display: block; font-size: 0.85rem; color: #e2e8f0; }
.armor-option .stats { display: flex; gap: 0.5rem; font-size: 0.7rem; color: #64748b; }

/* Add item modal */
.items-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 0.5rem; padding: 0.75rem; overflow-y: auto; flex: 1; }
.add-item-card { padding: 0.5rem; background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(100, 116, 139, 0.2); border-radius: 0.375rem; cursor: pointer; text-align: center; transition: all 0.15s; }
.add-item-card:hover { border-color: rgba(16, 185, 129, 0.5); background: rgba(16, 185, 129, 0.1); }
.add-item-card img { width: 48px; height: 64px; object-fit: contain; margin-bottom: 0.25rem; }
.add-item-card span { display: block; font-size: 0.65rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Add item modal — filters */
.add-item-filters {
  padding: 0.75rem;
  border-bottom: 1px solid rgba(100, 116, 139, 0.2);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 0.5rem;
}
.search-icon { color: #64748b; width: 18px; height: 18px; flex-shrink: 0; }
.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #e2e8f0;
  font-size: 0.85rem;
}
.search-input::placeholder { color: #64748b; }
.clear-btn {
  width: 20px; height: 20px;
  background: rgba(100, 116, 139, 0.3);
  border: none; border-radius: 50%;
  color: #94a3b8;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  font-size: 0.7rem;
}
.clear-btn:hover { background: rgba(100, 116, 139, 0.5); }

.category-tabs {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}
.cat-tab {
  padding: 0.375rem 0.625rem;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(100, 116, 139, 0.2);
  border-radius: 0.375rem;
  color: #94a3b8;
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.15s;
}
.cat-tab:hover { background: rgba(100, 116, 139, 0.3); }
.cat-tab.active {
  background: rgba(56, 189, 248, 0.2);
  border-color: rgba(56, 189, 248, 0.4);
  color: #7dd3fc;
}

.no-results {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  color: #64748b;
  font-size: 0.8rem;
}
.no-results svg { width: 32px; height: 32px; opacity: 0.5; }

.add-item-footer {
  padding: 0.5rem 0.75rem;
  border-top: 1px solid rgba(100, 116, 139, 0.2);
  text-align: center;
}
.items-count {
  font-size: 0.7rem;
  color: #64748b;
}

/* Scrollbars */
.modal-body::-webkit-scrollbar, .armor-list::-webkit-scrollbar, .items-grid::-webkit-scrollbar { width: 6px; }
.modal-body::-webkit-scrollbar-track, .armor-list::-webkit-scrollbar-track, .items-grid::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.3); }
.modal-body::-webkit-scrollbar-thumb, .armor-list::-webkit-scrollbar-thumb, .items-grid::-webkit-scrollbar-thumb { background: rgba(100, 116, 139, 0.3); border-radius: 3px; }

/* ===== ITEM MODAL — НОВЫЕ СТИЛИ ===== */

/* Attack chips — кликабельные */
.attack-chip {
  display: flex; align-items: center; gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.25rem;
  font-size: 0.75rem; color: #f87171;
  cursor: pointer; transition: all 0.15s;
}
.attack-chip:hover { background: rgba(239, 68, 68, 0.25); }
.attack-chip.selected { border-color: #f87171; border-width: 2px; }
.attack-chip.negative { color: #f87171; }
.attack-chip.disabled { opacity: 0.4; }
.attack-chip.ranged { background: rgba(167, 139, 250, 0.15); border-color: rgba(167, 139, 250, 0.3); color: #a78bfa; }
.attack-chip.ranged:hover { background: rgba(167, 139, 250, 0.25); }
.attack-chip.ranged.selected { border-color: #a78bfa; }

/* Stats row */
.stats-row {
  display: flex; gap: 0.5rem; flex-wrap: wrap;
  margin-bottom: 0.75rem;
}
.stat-chip {
  display: flex; align-items: center; gap: 0.25rem;
  padding: 0.375rem 0.5rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 0.375rem;
  font-size: 0.75rem; color: #94a3b8;
  cursor: pointer; transition: all 0.15s;
}
.stat-chip:hover { background: rgba(100, 116, 139, 0.3); }
.stat-chip.selected { border-color: #38bdf8; background: rgba(56, 189, 248, 0.15); }
.stat-chip .label { font-size: 0.65rem; color: #64748b; margin-left: 0.25rem; }
.stat-chip.type { background: rgba(251, 146, 60, 0.15); border-color: rgba(251, 146, 60, 0.3); color: #fb923c; }

/* Shield section */
.shield-section { margin-bottom: 0.75rem; }
.shield-table { 
  background: rgba(15, 23, 42, 0.4); 
  border-radius: 0.375rem; 
  overflow: hidden;
  font-size: 0.75rem;
}
.shield-row { display: flex; }
.shield-row.header { background: rgba(100, 116, 139, 0.2); }
.shield-cell { 
  flex: 1; padding: 0.5rem; 
  text-align: center; color: #94a3b8;
  border-right: 1px solid rgba(100, 116, 139, 0.15);
}
.shield-cell:last-child { border-right: none; }
.shield-cell.label { text-align: left; font-weight: 500; }
.shield-cell.value { color: #34d399; font-weight: 600; }

/* Damage scale — новый стиль */
.damage-section { margin-bottom: 0.75rem; }
.damage-scale { display: flex; gap: 0.25rem; }
.damage-level {
  flex: 1; padding: 0.5rem 0.25rem;
  border-radius: 0.375rem;
  text-align: center;
  cursor: pointer; transition: all 0.15s;
  border: 2px solid transparent;
}
.damage-level:hover { transform: scale(1.05); }
.damage-level.selected { border-color: #fff !important; }
.damage-level .damage-letter { font-size: 0.7rem; font-weight: 700; }
.damage-level .damage-threshold { font-size: 0.65rem; opacity: 0.9; }
.damage-level:not(.active) { opacity: 0.3; }

/* Spec box */
.spec-box {
  display: flex; align-items: flex-start; gap: 0.5rem;
  padding: 0.625rem;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 0.375rem;
  margin-bottom: 0.75rem;
  font-size: 0.8rem; color: #fbbf24;
}

/* Description box */
.desc-box {
  padding: 0.625rem;
  background: rgba(15, 23, 42, 0.4);
  border-left: 3px solid #475569;
  border-radius: 0 0.375rem 0.375rem 0;
  margin-bottom: 0.75rem;
  font-size: 0.8rem; color: #94a3b8;
  font-style: italic;
}

/* Info row */
.info-row {
  display: flex; gap: 0.375rem; flex-wrap: wrap;
  margin-bottom: 0.75rem;
}
.info-chip {
  display: flex; align-items: center; gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 0.25rem;
  font-size: 0.7rem; color: #94a3b8;
  cursor: pointer; transition: all 0.15s;
}
.info-chip:hover { background: rgba(100, 116, 139, 0.3); }
.info-chip.selected { border-color: #38bdf8; background: rgba(56, 189, 248, 0.15); }

/* Hint area */
.hint-area {
  padding: 0.75rem;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 0.5rem;
  margin-top: auto;
}
.hint-area.placeholder {
  display: flex; align-items: center; gap: 0.5rem;
  background: rgba(100, 116, 139, 0.1);
  border-color: rgba(100, 116, 139, 0.2);
  color: #64748b;
  font-size: 0.75rem;
}
.hint-title {
  font-size: 0.8rem; font-weight: 600;
  color: #7dd3fc;
  margin-bottom: 0.375rem;
}
.hint-text {
  font-size: 0.75rem;
  color: #94a3b8;
  line-height: 1.4;
  white-space: pre-line;
}

/* Button close */
.btn.close {
  background: rgba(100, 116, 139, 0.15);
  border-color: rgba(100, 116, 139, 0.3);
  color: #94a3b8;
}
.btn.close:hover { background: rgba(100, 116, 139, 0.25); }

/* Button edit */
.btn.edit {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.3);
  color: #60a5fa;
}
.btn.edit:hover { background: rgba(59, 130, 246, 0.25); }

/* ===== EDIT ITEM MODAL ===== */
.edit-item-modal {
  background: #1e293b;
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 0.75rem;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.edit-item-modal .modal-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(100, 116, 139, 0.2);
}
.edit-item-modal .modal-header h3 {
  flex: 1;
  font-size: 1rem;
  font-weight: 600;
  color: #f1f5f9;
  margin: 0;
}

.custom-badge {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  background: rgba(251, 191, 36, 0.15);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 1rem;
  font-size: 0.65rem;
  color: #fbbf24;
}

.edit-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.edit-footer {
  justify-content: flex-end;
}

/* ===== Header row: Image + Name + Category ===== */
.edit-header-row {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.edit-header-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.edit-header-meta {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.edit-name-input {
  padding: 0.5rem 0.75rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 0.375rem;
  color: #f1f5f9;
  font-size: 1rem;
  font-weight: 600;
}
.edit-name-input:focus {
  outline: none;
  border-color: #38bdf8;
}

/* ===== Category selector with colored icons ===== */
.category-selector button.quest.active {
  background: rgba(251, 191, 36, 0.2);
  border-color: #fbbf24;
  color: #fbbf24;
}
.category-selector button.accessory.active {
  background: rgba(168, 85, 247, 0.2);
  border-color: #a855f7;
  color: #a855f7;
}

/* Modal category glow */
.edit-item-modal.creating {
  border-color: rgba(56, 189, 248, 0.3);
}

/* ===== Icon button groups ===== */
.icon-btn-group {
  display: flex;
  gap: 0.25rem;
}
.icon-btn-group.wrap {
  flex-wrap: wrap;
}
.icon-btn-group.compact {
  gap: 0.125rem;
}
.icon-btn-group button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem 0.5rem;
  min-width: 32px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 0.25rem;
  color: #94a3b8;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;
}
.icon-btn-group button:hover {
  background: rgba(100, 116, 139, 0.3);
  color: #f1f5f9;
}
.icon-btn-group button.active {
  background: rgba(59, 130, 246, 0.3);
  border-color: #3b82f6;
  color: #60a5fa;
}
.icon-btn-group.compact button {
  padding: 0.25rem 0.375rem;
  font-size: 0.75rem;
  min-width: 28px;
}

/* ===== Meta row: subcategory + price/epoch ===== */
.edit-meta-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.spacer { flex: 1; }

.meta-values {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 0.375rem;
}
.meta-item .iconify {
  font-size: 1rem;
}
.meta-item .gold { color: #fbbf24; }
.meta-item .epoch { color: #94a3b8; }
.meta-item input {
  width: 40px;
  padding: 0.125rem;
  background: transparent;
  border: none;
  color: #f1f5f9;
  font-size: 0.85rem;
  text-align: center;
}
.meta-item input:focus { outline: none; }

/* ===== Compact row: hands + length ===== */
.edit-compact-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.compact-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.group-label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  color: #64748b;
  white-space: nowrap;
}
.group-label .iconify { font-size: 0.9rem; }

/* ===== Combat stats grid ===== */
.combat-stats-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.5rem;
}
.combat-stats-grid.armor-grid,
.combat-stats-grid.accessory-grid {
  grid-template-columns: repeat(4, 1fr);
}

/* Accessory info block */
.accessory-info {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(168, 85, 247, 0.1);
  border: 1px solid rgba(168, 85, 247, 0.3);
  border-radius: 0.375rem;
  font-size: 0.75rem;
  color: #c084fc;
  line-height: 1.4;
}
.accessory-info .info-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.stat-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem 0.25rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 0.5rem;
}

.stat-cell.attack { border-color: rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.05); }
.stat-cell.attack.ranged { border-color: rgba(168, 85, 247, 0.3); background: rgba(168, 85, 247, 0.05); }
.stat-cell.attack.empty { opacity: 0.5; border-style: dashed; }
.stat-cell.defence { border-color: rgba(59, 130, 246, 0.3); background: rgba(59, 130, 246, 0.05); }
.stat-cell.armor-pen { border-color: rgba(251, 146, 60, 0.3); background: rgba(251, 146, 60, 0.05); }
.stat-cell.resist { border-color: rgba(34, 197, 94, 0.3); background: rgba(34, 197, 94, 0.05); }
.stat-cell.movement { border-color: rgba(6, 182, 212, 0.3); background: rgba(6, 182, 212, 0.05); }
.stat-cell.bursts { border-color: rgba(251, 191, 36, 0.3); background: rgba(251, 191, 36, 0.05); }

.stat-value span {
  cursor: default;
}

.stat-header {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.6rem;
  color: #94a3b8;
  margin-bottom: 0.25rem;
}
.stat-header .iconify { font-size: 0.8rem; }
.stat-cell.attack .stat-header { color: #f87171; }
.stat-cell.attack.ranged .stat-header { color: #a78bfa; }
.stat-cell.defence .stat-header { color: #60a5fa; }
.stat-cell.armor-pen .stat-header { color: #fb923c; }
.stat-cell.resist .stat-header { color: #4ade80; }
.stat-cell.movement .stat-header { color: #22d3ee; }
.stat-cell.bursts .stat-header { color: #fbbf24; }

.stat-value {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}
.stat-value span {
  min-width: 24px;
  text-align: center;
  font-size: 1rem;
  font-weight: 600;
  color: #f1f5f9;
}
.stat-value span.negative { color: #f87171; }

.adj-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: rgba(100, 116, 139, 0.2);
  border: none;
  border-radius: 0.25rem;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s;
}
.adj-btn:hover {
  background: rgba(100, 116, 139, 0.4);
  color: #f1f5f9;
}
.adj-btn .iconify { font-size: 0.75rem; }

/* ===== Damage type section ===== */
.damage-type-section {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.damage-type-input {
  flex: 1;
  padding: 0.375rem 0.625rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 0.375rem;
  color: #f1f5f9;
  font-size: 0.85rem;
}
.damage-type-input:focus {
  outline: none;
  border-color: #38bdf8;
}

/* ===== Damage levels row ===== */
.damage-levels-row {
  display: flex;
  gap: 0.25rem;
  justify-content: center;
}

.damage-level-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 40px;
  padding: 0.25rem;
  background: rgba(30, 41, 59, 0.5);
  border: 2px solid color-mix(in srgb, var(--level-color) 40%, transparent);
  border-radius: 0.5rem;
  opacity: 0.6;
  transition: all 0.15s;
}
.damage-level-cell.has-value {
  background: color-mix(in srgb, var(--level-color) 15%, #1e293b);
  border-color: var(--level-color);
  opacity: 1;
}
.damage-level-cell.light-text.has-value {
  background: color-mix(in srgb, var(--level-color) 60%, #1e293b);
}

.damage-level-cell .adj-btn {
  width: 100%;
  height: 18px;
  background: color-mix(in srgb, var(--level-color) 20%, transparent);
  color: var(--level-color);
  border: none;
}
.damage-level-cell.light-text .adj-btn {
  color: rgba(255, 255, 255, 0.8);
}
.damage-level-cell .adj-btn:hover {
  background: color-mix(in srgb, var(--level-color) 40%, transparent);
}
.damage-level-cell .adj-btn.top { border-radius: 0.25rem 0.25rem 0 0; }
.damage-level-cell .adj-btn.bottom { border-radius: 0 0 0.25rem 0.25rem; }

.damage-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--level-color);
  line-height: 1.3;
  min-height: 1.4rem;
  cursor: default;
}
.damage-level-cell.light-text .damage-value {
  color: #fff;
}
.damage-value.empty {
  color: #64748b;
}

/* ===== Defence section ===== */
.defence-section {
  background: rgba(59, 130, 246, 0.05);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 0.5rem;
  padding: 0.5rem;
}

.defence-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.defence-title {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #60a5fa;
}
.defence-title .iconify { font-size: 1rem; }

.mode-toggle {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 0.25rem;
  color: #60a5fa;
  font-size: 0.65rem;
  cursor: pointer;
  transition: all 0.15s;
}
.mode-toggle:hover {
  background: rgba(59, 130, 246, 0.25);
}
.mode-toggle .iconify { font-size: 0.8rem; }

.simple-defence {
  display: flex;
  justify-content: center;
}

.stat-cell.inline {
  flex-direction: row;
  padding: 0.375rem 0.75rem;
}

.complex-defence {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.defence-direction {
  background: rgba(15, 23, 42, 0.3);
  border-radius: 0.375rem;
  padding: 0.5rem;
}

.direction-label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  color: #94a3b8;
  margin-bottom: 0.375rem;
}
.direction-label .iconify { font-size: 0.9rem; color: #60a5fa; }
.direction-label .remove-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.25rem;
  color: #f87171;
  cursor: pointer;
  transition: all 0.15s;
}
.direction-label .remove-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: #f87171;
}
.direction-label .remove-btn .iconify {
  font-size: 0.75rem;
  color: inherit;
}

.direction-stats {
  display: flex;
  gap: 0.75rem;
}

.mini-stat {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0.25rem 0.375rem;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 0.25rem;
}
.mini-stat.melee { border: 1px solid rgba(239, 68, 68, 0.3); }
.mini-stat.ranged { border: 1px solid rgba(168, 85, 247, 0.3); }

.mini-label {
  font-size: 0.7rem;
  color: #94a3b8;
  margin-right: 0.25rem;
}
.mini-stat.melee .mini-label .iconify { color: #f87171; }
.mini-stat.ranged .mini-label .iconify { color: #a78bfa; }

.mini-value {
  font-size: 0.85rem;
  font-weight: 600;
  color: #f1f5f9;
  min-width: 20px;
  text-align: center;
}

.mini-stat .adj-btn {
  width: 18px;
  height: 18px;
}

.add-direction-row {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}

.add-direction-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(100, 116, 139, 0.2);
  border: 1px dashed rgba(100, 116, 139, 0.4);
  border-radius: 0.25rem;
  color: #94a3b8;
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.15s;
}
.add-direction-btn:hover {
  background: rgba(100, 116, 139, 0.3);
  color: #f1f5f9;
}

/* ===== Attacks grid ===== */
.attacks-grid {
  grid-template-columns: repeat(4, 1fr);
}

/* ===== Text sections ===== */
.text-section {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.text-section.special {
  border: 1px solid rgba(251, 191, 36, 0.2);
  background: rgba(251, 191, 36, 0.03);
  border-radius: 0.5rem;
  padding: 0.5rem;
}

.text-label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  color: #64748b;
  font-weight: 500;
}
.text-section.special .text-label {
  color: #fbbf24;
}
.text-label .iconify { font-size: 0.9rem; }

.text-section textarea {
  padding: 0.5rem 0.625rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 0.375rem;
  color: #f1f5f9;
  font-size: 0.85rem;
  resize: vertical;
  min-height: 50px;
}
.text-section textarea:focus {
  outline: none;
  border-color: #38bdf8;
}
.text-section.special textarea {
  border-color: rgba(251, 191, 36, 0.3);
  color: #fbbf24;
}
.text-section.special textarea:focus {
  border-color: #fbbf24;
}
</style>
