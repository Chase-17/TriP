<template>
  <div>
    <!-- Weapons Grid -->
    <div class="weapons-grid">
      <div
        v-for="weapon in filteredWeapons"
        :key="weapon.id"
        class="weapon-card"
        :class="getWeaponCardClass(weapon)"
      >
        <!-- Image area with corner badges -->
        <div class="weapon-image-area" @click="openWeaponModal(weapon)">
          <!-- Price badge (top-left) -->
          <div class="corner-badge top-left" :class="getPriceClass(weapon)">
            <Icon icon="mdi:gold" class="badge-icon" />
            <span>{{ weapon.price }}</span>
          </div>
          
          <!-- Epoch badge (top-right) -->
          <div class="corner-badge top-right" :class="getEpochClass(weapon)">
            <Icon icon="mdi:clock-outline" class="badge-icon" />
            <span>{{ weapon.epoch }}</span>
          </div>
          
          <!-- Image -->
          <img
            :src="itemImageUrl(weapon.id)"
            :alt="weapon.name"
            class="weapon-image"
            @error="(e) => e.target.style.display = 'none'"
          />
          
          <!-- Selection indicator overlay -->
          <div v-if="isSelected(weapon.id)" class="selected-overlay">
            <Icon icon="mdi:check-bold" class="check-icon" />
          </div>
          
          <!-- Lock overlay -->
          <div v-if="!canSelect(weapon)" class="locked-overlay">
            <Icon icon="mdi:lock" class="lock-icon" />
          </div>
        </div>

        <!-- Weapon name -->
        <div class="weapon-name" @click="openWeaponModal(weapon)">
          {{ weapon.name }}
        </div>

        <!-- Bottom action bar -->
        <div class="weapon-bottom">
          <!-- Action button -->
          <button
            v-if="isSelected(weapon.id)"
            @click.stop="toggleWeapon(weapon)"
            class="action-btn remove"
            title="Убрать"
          >
            <Icon icon="mdi:minus" />
          </button>
          <button
            v-else-if="canSelect(weapon)"
            @click.stop="toggleWeapon(weapon)"
            class="action-btn take"
            title="Взять"
          >
            <Icon icon="mdi:plus" />
          </button>
          <button
            v-else
            class="action-btn locked"
            disabled
            title="Недоступно"
          >
            <Icon icon="mdi:lock" />
          </button>
          
          <!-- Info button -->
          <button @click.stop="openWeaponModal(weapon)" class="action-btn info" title="Подробнее">
            <Icon icon="mdi:information-outline" />
          </button>
          
          <!-- Attack stats - compact format -->
          <div class="stat-mini attack" :title="getAttackTooltip(weapon)">
            <Icon icon="mdi:sword-cross" class="stat-mini-icon" />
            <span>{{ getAttackCompact(weapon) }}<span v-if="weapon.armorPen > 0" class="note">*</span></span>
          </div>
          
          <!-- Defence stat -->
          <div class="stat-mini defence" v-if="getDefenceValue(weapon) > 0" title="Защита">
            <Icon icon="mdi:shield" class="stat-mini-icon" />
            <span>{{ getDefenceValue(weapon) }}<span v-if="isShield(weapon)" class="note">*</span></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal (no Teleport to keep scoped styles working) -->
    <div v-if="selectedWeapon" class="modal-overlay" @click="closeModal">
      <div class="modal-content compact" @click.stop>
          <!-- Header with image -->
          <div class="modal-header-compact">
            <div class="modal-weapon-image-compact">
              <img
                :src="itemImageUrl(selectedWeapon.id)"
                :alt="selectedWeapon.name"
                @error="(e) => e.target.style.display = 'none'"
              />
            </div>
            <div class="modal-header-info">
              <h2 class="modal-title">{{ selectedWeapon.name }}</h2>
              <!-- Attack row - compact -->
              <div class="attack-row-compact">
                <template v-if="typeof selectedWeapon.attack === 'object'">
                  <div 
                    class="attack-chip clickable" 
                    :class="{ negative: selectedWeapon.attack.short < 0, disabled: selectedWeapon.attack.short === undefined }"
                    @click="showHint('attack_short')"
                  >
                    <Icon icon="mdi:knife" />
                    <span>{{ selectedWeapon.attack.short !== undefined ? formatAttackValue(selectedWeapon.attack.short) : '—' }}</span>
                  </div>
                  <div 
                    class="attack-chip clickable" 
                    :class="{ negative: selectedWeapon.attack.long < 0, disabled: selectedWeapon.attack.long === undefined }"
                    @click="showHint('attack_long')"
                  >
                    <Icon icon="mdi:spear" />
                    <span>{{ selectedWeapon.attack.long !== undefined ? formatAttackValue(selectedWeapon.attack.long) : '—' }}</span>
                  </div>
                  <div 
                    v-if="selectedWeapon.attack.ranged !== undefined" 
                    class="attack-chip ranged clickable" 
                    :class="{ negative: selectedWeapon.attack.ranged < 0 }"
                    @click="showHint('attack_ranged')"
                  >
                    <Icon icon="mdi:bow-arrow" />
                    <span>{{ formatAttackValue(selectedWeapon.attack.ranged) }}</span>
                  </div>
                </template>
              </div>
            </div>
            <button @click="closeModal" class="close-button">
              <Icon icon="mdi:close" />
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body compact">
            <!-- Secondary stats row: defence, armor pen, damage type -->
            <div class="stats-row-compact">
              <div 
                class="stat-chip clickable" 
                v-if="typeof selectedWeapon.defence !== 'object' && selectedWeapon.defence > 0"
                @click="showHint('defence')"
              >
                <Icon icon="mdi:shield" />
                <span>{{ selectedWeapon.defence }}</span>
                <span class="stat-label">защита</span>
              </div>
              <div 
                class="stat-chip clickable" 
                v-if="selectedWeapon.armorPen > 0"
                @click="showHint('armorPen')"
              >
                <Icon icon="mdi:shield-off" />
                <span>{{ selectedWeapon.armorPen }}</span>
                <span class="stat-label">пробив.</span>
              </div>
              <div 
                class="stat-chip type clickable" 
                v-if="selectedWeapon.damageType"
                @click="showHint('damageType')"
              >
                <Icon icon="mdi:fire" />
                <span>{{ selectedWeapon.damageType }}</span>
              </div>
            </div>

            <!-- Shield defence table (only for shields) -->
            <div v-if="typeof selectedWeapon.defence === 'object'" class="shield-section compact">
              <div class="shield-table compact">
                <div class="shield-row header">
                  <div class="shield-cell"></div>
                  <div class="shield-cell">Ближ.</div>
                  <div class="shield-cell">Дальн.</div>
                </div>
                <div class="shield-row" v-if="selectedWeapon.defence.front">
                  <div class="shield-cell label">Спереди</div>
                  <div class="shield-cell value">{{ selectedWeapon.defence.front.melee || 0 }}</div>
                  <div class="shield-cell value">{{ selectedWeapon.defence.front.ranged || 0 }}</div>
                </div>
                <div class="shield-row" v-if="selectedWeapon.defence.side">
                  <div class="shield-cell label">С фланга</div>
                  <div class="shield-cell value">{{ selectedWeapon.defence.side.melee || 0 }}</div>
                  <div class="shield-cell value">{{ selectedWeapon.defence.side.ranged || 0 }}</div>
                </div>
              </div>
            </div>

            <!-- Damage scale -->
            <div class="damage-section compact" v-if="selectedWeapon.damage">
              <div class="damage-scale">
                <div
                  v-for="level in damageLevels"
                  :key="level.key"
                  class="damage-level"
                  :class="{ 
                    active: getDamageThreshold(selectedWeapon, level.key) !== null,
                    inactive: getDamageThreshold(selectedWeapon, level.key) === null,
                    selected: activeHint?.type === 'damage' && activeHint?.key === level.key
                  }"
                  :style="getDamageLevelStyle(level, getDamageThreshold(selectedWeapon, level.key) !== null)"
                  @click.stop="showDamageHint(level, getDamageThreshold(selectedWeapon, level.key))"
                >
                  <div class="damage-letter">{{ level.short }}</div>
                  <div class="damage-threshold" v-if="getDamageThreshold(selectedWeapon, level.key) !== null">
                    +{{ getDamageThreshold(selectedWeapon, level.key) }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Special properties -->
            <div v-if="selectedWeapon.spec" class="spec-box compact">
              <Icon icon="mdi:star-four-points" />
              <span>{{ selectedWeapon.spec }}</span>
            </div>

            <!-- Description -->
            <div v-if="selectedWeapon.desc" class="description-box compact">
              {{ selectedWeapon.desc }}
            </div>

            <!-- Bottom info: price, epoch, length, hands -->
            <div class="bottom-info-row">
              <div 
                class="info-chip small clickable" 
                :class="getPriceClass(selectedWeapon)"
                @click="showHint('price')"
              >
                <Icon icon="mdi:gold" />
                <span>{{ selectedWeapon.price }}</span>
              </div>
              <div 
                class="info-chip small clickable" 
                :class="getEpochClass(selectedWeapon)"
                @click="showHint('epoch')"
              >
                <Icon icon="mdi:clock-outline" />
                <span>{{ selectedWeapon.epoch }}</span>
              </div>
              <div 
                class="info-chip small clickable"
                @click="showHint('length')"
              >
                <Icon :icon="selectedWeapon.length === 2 ? 'mdi:arrow-expand-horizontal' : 'mdi:minus'" />
                <span>{{ selectedWeapon.length === 2 ? 'Длинн.' : 'Коротк.' }}</span>
              </div>
              <div 
                class="info-chip small clickable" 
                v-if="selectedWeapon.hands"
                @click="showHint('hands')"
              >
                <Icon icon="mdi:hand-back-left" />
                <span>{{ getHandsLabelShort(selectedWeapon.hands) }}</span>
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
          <div class="modal-footer compact">
            <button
              v-if="!isSelected(selectedWeapon.id)"
              @click="selectWeapon"
              class="modal-btn take"
              :disabled="!canSelect(selectedWeapon)"
            >
              <Icon icon="mdi:plus-circle" />
              Взять
            </button>
            <button
              v-else
              @click="deselectWeapon"
              class="modal-btn remove"
            >
              <Icon icon="mdi:close-circle" />
              Убрать
            </button>
            <button @click="closeModal" class="modal-btn close">
              Закрыть
            </button>
          </div>
        </div>
      </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import itemsData from '@/data/items.json'
import epochsData from '@/data/epochs.json'
import levelsData from '@/data/levels.json'
import { itemImageUrl } from '@/utils/assets'

// Damage levels for the scale
const damageLevels = levelsData.levels

// Active hint state
const activeHint = ref(null)

// Hint descriptions
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
    text: 'Ценовая категория оружия. Определяет минимальный уровень достатка персонажа для приобретения.'
  },
  epoch: {
    title: 'Эпоха',
    text: 'Технологическая эпоха, начиная с которой доступно это оружие. Более поздние эпохи предлагают лучшее снаряжение.'
  },
  length: {
    title: 'Длина оружия',
    text: 'Длинное оружие позволяет атаковать через клетку, но может быть менее эффективно вплотную. Короткое оружие удобнее в тесном бою.'
  },
  hands: {
    title: 'Хват',
    text: 'Сколько рук требуется для использования. Одноручное оружие оставляет руку свободной для щита или второго оружия. Двуручное обычно мощнее.'
  }
}

// Show hint for a property
const showHint = (hintKey) => {
  if (hintDescriptions[hintKey]) {
    activeHint.value = {
      type: 'property',
      key: hintKey,
      ...hintDescriptions[hintKey]
    }
  }
}

// Show hint for damage level
const showDamageHint = (level, threshold) => {
  const name = level.names.damage.ru
  
  if (threshold === null) {
    activeHint.value = {
      type: 'damage',
      key: level.key,
      title: `${level.short} — ${name} урон`,
      text: 'Это оружие не способно нанести урон данной категории.'
    }
  } else {
    activeHint.value = {
      type: 'damage',
      key: level.key,
      title: `${level.short} — ${name} урон`,
      text: `${damageDescriptions[level.key]}\n\nТребуется очков превышения защиты: ${threshold}+`
    }
  }
}

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  wealth: {
    type: Number,
    default: 5
  },
  epoch: {
    type: Number,
    default: 10
  },
  categoryFilter: {
    type: String,
    default: null
  },
  showUnavailable: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const epochs = epochsData
const weapons = itemsData.items.filter(item => item.category === 'weapon' || item.category === 'shield')

const selectedWeapon = ref(null)

const filteredWeapons = computed(() => {
  let result = weapons
  
  // Category filter
  if (props.categoryFilter) {
    result = result.filter(w => w.subcat === props.categoryFilter)
  }
  
  // Availability filter (hide unavailable by default)
  if (!props.showUnavailable) {
    result = result.filter(w => canSelect(w))
  }
  
  return result
})

const openWeaponModal = (weapon) => {
  selectedWeapon.value = weapon
  activeHint.value = null
}

const closeModal = () => {
  selectedWeapon.value = null
  activeHint.value = null
}

const isSelected = (weaponId) => {
  return props.modelValue.includes(weaponId)
}

const canSelect = (weapon) => {
  const diff = weapon.price - props.wealth
  const epochOk = weapon.epoch <= props.epoch
  // Red items (price > wealth + 1) or wrong epoch cannot be selected
  return diff <= 1 && epochOk
}

const getPriceClass = (weapon) => {
  const diff = weapon.price - props.wealth
  if (diff < 0) return 'price-green'
  if (diff === 0) return 'price-yellow'
  if (diff === 1) return 'price-orange'
  return 'price-red'
}

const getEpochClass = (weapon) => {
  return weapon.epoch <= props.epoch ? 'epoch-ok' : 'epoch-blocked'
}

const getWeaponCardClass = (weapon) => {
  const selected = isSelected(weapon.id)
  const canSel = canSelect(weapon)
  
  if (selected) return 'card-selected'
  if (!canSel) return 'card-locked'
  return 'card-available'
}

// Get attack icon based on weapon type
const getAttackIcon = (weapon) => {
  if (weapon.subcat === 'bows') return 'mdi:bow-arrow'
  if (weapon.length === 2) return 'mdi:spear'
  return 'mdi:sword'
}

// Get defence value (handle shield objects)
const getDefenceValue = (weapon) => {
  if (typeof weapon.defence === 'object') {
    // Shield - return front melee as representative
    return weapon.defence?.front?.melee || 0
  }
  return weapon.defence || 0
}

// Check if weapon is a shield
const isShield = (weapon) => {
  return weapon.category === 'shield' || typeof weapon.defence === 'object'
}

// Get range label for weapon
const getRangeLabel = (weapon) => {
  if (weapon.subcat === 'bows') return 'Дальнобойное'
  if (weapon.length === 2) return 'Длинное'
  if (weapon.length === 1) return 'Стандартное'
  return 'Ближний бой'
}

// Get hands label
const getHandsLabel = (hands) => {
  if (hands === 2) return 'Двуручное'
  if (hands === 1) return 'Одноручное'
  if (hands === 0.5) return 'Полуторное'
  return `${hands} рук.`
}

// Get compact attack string: "short/long" or "short/long/ranged"
const getAttackCompact = (weapon) => {
  if (typeof weapon.attack !== 'object') {
    return weapon.attack // legacy
  }
  
  const s = weapon.attack.short
  const l = weapon.attack.long
  const r = weapon.attack.ranged
  
  const sStr = s !== undefined ? (s >= 0 ? s : s) : '-'
  const lStr = l !== undefined ? (l >= 0 ? l : l) : '-'
  
  if (r !== undefined) {
    const rStr = r >= 0 ? r : r
    return `${sStr}/${lStr}/${rStr}`
  }
  
  // If both are same, show just one value
  if (s === l && s !== undefined) {
    return `${s}`
  }
  
  return `${sStr}/${lStr}`
}

// Get attack tooltip with full descriptions
const getAttackTooltip = (weapon) => {
  if (typeof weapon.attack !== 'object') {
    return `Атака: ${weapon.attack}`
  }
  
  const parts = []
  if (weapon.attack.short !== undefined) {
    parts.push(`Вплотную: ${weapon.attack.short >= 0 ? '+' : ''}${weapon.attack.short}`)
  }
  if (weapon.attack.long !== undefined) {
    parts.push(`Через клетку: ${weapon.attack.long >= 0 ? '+' : ''}${weapon.attack.long}`)
  }
  if (weapon.attack.ranged !== undefined) {
    parts.push(`Дальний бой: ${weapon.attack.ranged >= 0 ? '+' : ''}${weapon.attack.ranged}`)
  }
  
  return parts.join(' | ')
}

// Format attack value with +/- sign
const formatAttackValue = (val) => {
  if (val > 0) return `+${val}`
  return val.toString()
}

// Get damage threshold for a specific level key
const getDamageThreshold = (weapon, levelKey) => {
  if (!weapon.damage || weapon.damage[levelKey] === undefined) {
    return null
  }
  return weapon.damage[levelKey]
}

// Get style for damage level cell
const getDamageLevelStyle = (level, isActive) => {
  if (!isActive) {
    return {
      backgroundColor: '#333',
      color: '#666'
    }
  }
  return {
    backgroundColor: level.color,
    color: level.lightText ? '#fff' : '#000'
  }
}

// Damage category descriptions for tooltips
const damageDescriptions = {
  t: 'Пустяковый урон — наносит царапину. Неприятно, но не опасно.',
  l: 'Лёгкий урон — наносит лёгкое ранение. Персонаж способен пережить несколько таких ран без серьёзных последствий.',
  m: 'Серьёзный урон — наносит тяжёлое ранение. Персонаж выведен из строя и нуждается в срочной помощи.',
  h: 'Тяжёлый урон — смертельное ранение. Без снижения урона персонаж погибает.',
  g: 'Жестокий урон — мгновенная смерть без защиты. Требуется минимум 1 единица снижения урона, чтобы выжить.',
  n: 'Кошмарный урон — мгновенная смерть. Требуется минимум 2 единицы снижения урона, чтобы выжить.',
  i: 'Невыносимый урон — мгновенная смерть. Требуется минимум 3 единицы снижения урона, чтобы выжить.'
}

// Get tooltip for damage level
const getDamageLevelTooltip = (level, threshold) => {
  const name = level.names.damage.ru
  const shortLetter = level.short
  
  if (threshold === null) {
    return `${shortLetter} — ${name} урон\nЭто оружие не способно нанести урон этой категории`
  }
  
  const desc = damageDescriptions[level.key] || `${name} урон`
  return `${shortLetter} — ${desc}\n\nТребуется: превышение защиты на ${threshold}+`
}

// Get short hands label
const getHandsLabelShort = (hands) => {
  if (hands === 2) return '2 руки'
  if (hands === 1) return '1 рука'
  if (hands === 1.5) return '1.5 руки'
  if (hands === 0.5) return '0.5 руки'
  return `${hands}`
}

// Toggle weapon selection directly
const toggleWeapon = (weapon) => {
  if (isSelected(weapon.id)) {
    const newValue = props.modelValue.filter(id => id !== weapon.id)
    emit('update:modelValue', newValue)
  } else if (canSelect(weapon)) {
    emit('update:modelValue', [...props.modelValue, weapon.id])
  }
}

const selectWeapon = () => {
  if (selectedWeapon.value && canSelect(selectedWeapon.value)) {
    emit('update:modelValue', [...props.modelValue, selectedWeapon.value.id])
    closeModal()
  }
}

const deselectWeapon = () => {
  if (selectedWeapon.value) {
    const newValue = props.modelValue.filter(id => id !== selectedWeapon.value.id)
    emit('update:modelValue', newValue)
    closeModal()
  }
}
</script>

<style scoped>
.weapons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
}

/* Card */
.weapon-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: rgba(30, 41, 59, 0.3);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 0.5rem;
  overflow: hidden;
  transition: all 0.15s;
}

.card-available:hover {
  border-color: rgba(148, 163, 184, 0.35);
  transform: translateY(-1px);
}

.card-selected {
  border-color: rgba(16, 185, 129, 0.5);
  background: rgba(16, 185, 129, 0.08);
}

.card-locked {
  opacity: 0.6;
}

/* Image area (clickable) */
.weapon-image-area {
  position: relative;
  height: 200px;
  background: rgba(15, 23, 42, 0.4);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Weapon name */
.weapon-name {
  padding: 0.25rem 0.375rem;
  font-size: 0.65rem;
  font-weight: 500;
  color: #cbd5e1;
  text-align: center;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  cursor: pointer;
  background: rgba(15, 23, 42, 0.3);
}

.weapon-name:hover {
  color: #e2e8f0;
}

/* Image wrapper - kept for compatibility */
.weapon-image-wrapper {
  position: relative;
  aspect-ratio: 1;
  background: rgba(15, 23, 42, 0.4);
  cursor: pointer;
}

.weapon-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 0.375rem;
}

/* Corner badges */
.corner-badge {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
  z-index: 2;
}

.corner-badge .badge-icon {
  width: 0.75rem;
  height: 0.75rem;
}

.top-left {
  top: 0;
  left: 0;
  border-bottom-right-radius: 0.25rem;
}

.top-right {
  top: 0;
  right: 0;
  border-bottom-left-radius: 0.25rem;
}

/* Price colors */
.price-green { color: #4ade80; }
.price-yellow { color: #facc15; }
.price-orange { color: #fb923c; }
.price-red { color: #f87171; }

/* Epoch colors */
.epoch-ok { color: #94a3b8; }
.epoch-blocked { color: #f87171; }

/* Selected overlay */
.selected-overlay {
  position: absolute;
  inset: 0;
  background: rgba(16, 185, 129, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
}

.check-icon {
  width: 1.5rem;
  height: 1.5rem;
  color: #10b981;
}

/* Lock overlay */
.locked-overlay {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4;
}

.lock-icon {
  width: 1.25rem;
  height: 1.25rem;
  color: #64748b;
}

/* Bottom action bar */
.weapon-bottom {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem;
  background: rgba(15, 23, 42, 0.5);
}

.action-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.action-btn svg {
  width: 1.125rem;
  height: 1.125rem;
}

.action-btn.take {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.action-btn.take:hover {
  background: rgba(16, 185, 129, 0.35);
}

.action-btn.remove {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.action-btn.remove:hover {
  background: rgba(239, 68, 68, 0.35);
}

.action-btn.info {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
}

.action-btn.info:hover {
  background: rgba(56, 189, 248, 0.3);
}

.action-btn.locked {
  background: rgba(71, 85, 105, 0.2);
  color: #64748b;
  cursor: not-allowed;
}

/* Mini stats */
.stat-mini {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;
  font-size: 0.8rem;
  font-weight: 600;
}

.stat-mini-icon {
  width: 1rem;
  height: 1rem;
}

.stat-mini.attack {
  color: #f87171;
}

.stat-mini.attack.ranged {
  color: #a78bfa;
}

.stat-mini.defence {
  color: #60a5fa;
  margin-left: 0.25rem;
}

.note {
  color: #fbbf24;
  font-size: 0.55rem;
  vertical-align: super;
  margin-left: 1px;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

/* Compact modal styles */
.modal-content.compact {
  max-width: 400px;
}

.modal-header-compact {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.modal-weapon-image-compact {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 0.5rem;
  padding: 0.5rem;
}

.modal-weapon-image-compact img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.modal-header-info {
  flex: 1;
  min-width: 0;
}

.modal-header-info .modal-title {
  font-size: 1rem;
  margin-bottom: 0.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Attack row compact */
.attack-row-compact {
  display: flex;
  gap: 0.375rem;
}

.attack-chip {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.2);
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #f87171;
}

.attack-chip.ranged {
  background: rgba(167, 139, 250, 0.1);
  border-color: rgba(167, 139, 250, 0.2);
  color: #a78bfa;
}

.attack-chip.negative {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.attack-chip.disabled {
  background: rgba(71, 85, 105, 0.2);
  border-color: rgba(71, 85, 105, 0.3);
  color: #64748b;
  opacity: 0.6;
}

/* Compact body */
.modal-body.compact {
  padding: 0.75rem;
}

/* Compact stats row */
.stats-row-compact {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-bottom: 0.75rem;
}

.stat-chip {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 0.375rem;
  font-size: 0.75rem;
  color: #94a3b8;
}

.stat-chip .stat-label {
  font-size: 0.625rem;
  color: #64748b;
  text-transform: uppercase;
}

.stat-chip.type {
  color: #fb923c;
  border-color: rgba(251, 146, 60, 0.2);
}

/* Compact shield table */
.shield-section.compact {
  margin-bottom: 0.75rem;
}

.shield-table.compact .shield-cell {
  padding: 0.375rem 0.5rem;
  font-size: 0.7rem;
}

/* Compact damage section */
.damage-section.compact {
  margin-bottom: 0.75rem;
}

.damage-section.compact .damage-scale {
  border-radius: 0.375rem;
}

.damage-section.compact .damage-level {
  padding: 0.5rem 0.125rem;
}

.damage-section.compact .damage-letter {
  font-size: 1rem;
}

.damage-section.compact .damage-threshold {
  font-size: 0.625rem;
}

/* Muted damage colors */
.damage-level.active {
  filter: saturate(0.7) brightness(0.85);
}

.damage-level.active:hover {
  filter: saturate(1) brightness(1);
}

/* Compact spec box */
.spec-box.compact {
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.75rem;
  font-size: 0.75rem;
}

/* Compact description */
.description-box.compact {
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  margin-bottom: 0.75rem;
}

/* Bottom info row */
.bottom-info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  justify-content: center;
}

.info-chip.small {
  padding: 0.25rem 0.5rem;
  font-size: 0.65rem;
  border-radius: 0.25rem;
}

/* Compact footer */
.modal-footer.compact {
  padding: 0.75rem;
  gap: 0.5rem;
}

.modal-footer.compact .modal-btn {
  padding: 0.5rem 0.75rem;
  font-size: 0.8rem;
}

/* Clickable elements */
.clickable {
  cursor: pointer;
  transition: all 0.15s;
}

.clickable:hover {
  transform: scale(1.05);
}

.clickable:active {
  transform: scale(0.98);
}

/* Hint area */
.hint-area {
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 0.5rem;
  min-height: 60px;
}

.hint-area.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: #64748b;
  font-size: 0.75rem;
  font-style: italic;
}

.hint-title {
  font-weight: 600;
  color: #e2e8f0;
  font-size: 0.85rem;
  margin-bottom: 0.375rem;
}

.hint-text {
  color: #94a3b8;
  font-size: 0.75rem;
  line-height: 1.5;
  white-space: pre-line;
}

/* Selected damage level */
.damage-level.selected {
  filter: saturate(1) brightness(1.1) !important;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5), 0 4px 12px rgba(0, 0, 0, 0.3);
  transform: scale(1.08);
  z-index: 2;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #e2e8f0;
  margin: 0;
}

.close-button {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  color: #94a3b8;
  transition: all 0.2s;
  background: transparent;
  border: none;
  cursor: pointer;
}

.close-button:hover {
  background: rgba(148, 163, 184, 0.1);
  color: #e2e8f0;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.modal-weapon-image {
  width: 200px;
  height: 200px;
  margin: 0 auto 1.5rem;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 0.75rem;
  padding: 1rem;
}

.modal-weapon-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Quick info row with chips */
.quick-info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
  justify-content: center;
}

.info-chip {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 1rem;
  font-size: 0.75rem;
  color: #94a3b8;
}

.info-chip.price-green { color: #4ade80; border-color: rgba(74, 222, 128, 0.3); }
.info-chip.price-yellow { color: #facc15; border-color: rgba(250, 204, 21, 0.3); }
.info-chip.price-orange { color: #fb923c; border-color: rgba(251, 146, 60, 0.3); }
.info-chip.price-red { color: #f87171; border-color: rgba(248, 113, 113, 0.3); }
.info-chip.epoch-ok { color: #94a3b8; }
.info-chip.epoch-blocked { color: #f87171; border-color: rgba(248, 113, 113, 0.3); }
.info-chip.range { color: #f87171; }
.info-chip.hands { color: #a78bfa; }

/* Stats row */
.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.stat-box {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 0.5rem;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.stat-box.attack { border-color: rgba(248, 113, 113, 0.2); }
.stat-box.defence { border-color: rgba(96, 165, 250, 0.2); }

.stat-box-icon {
  width: 1.25rem;
  height: 1.25rem;
  color: #64748b;
}

.stat-box.attack .stat-box-icon { color: #f87171; }
.stat-box.attack.ranged .stat-box-icon { color: #a78bfa; }
.stat-box.defence .stat-box-icon { color: #60a5fa; }

/* Negative attack values */
.stat-box.attack.negative {
  border-color: rgba(239, 68, 68, 0.3);
}

.stat-box.attack.negative .stat-box-value {
  color: #ef4444;
}

/* Disabled/unavailable attack range */
.stat-box.attack.disabled {
  opacity: 0.4;
  border-color: rgba(100, 116, 139, 0.2);
}

.stat-box.attack.disabled .stat-box-icon {
  color: #475569;
}

.stat-box.attack.disabled .stat-box-value {
  color: #64748b;
  font-size: 1.25rem;
}

.stat-box-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #e2e8f0;
}

.stat-box-value.small {
  font-size: 0.875rem;
}

.stat-box-label {
  font-size: 0.65rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Shield table */
.shield-section {
  margin-bottom: 1rem;
}

.shield-table {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 0.5rem;
  overflow: hidden;
}

.shield-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.5rem;
}

.shield-row.header {
  background: rgba(15, 23, 42, 0.5);
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.shield-cell {
  padding: 0.5rem 0.75rem;
  text-align: center;
  font-size: 0.75rem;
  color: #94a3b8;
}

.shield-cell.label {
  text-align: left;
  color: #cbd5e1;
}

.shield-cell.value {
  font-weight: 600;
  color: #60a5fa;
}

/* Spec box */
.spec-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  margin-bottom: 1rem;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 0.5rem;
  color: #fbbf24;
  font-size: 0.875rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.stat-box {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.1);
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
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #e2e8f0;
}

.price-epoch-row {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.info-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 0.5rem;
  color: #94a3b8;
  font-size: 0.875rem;
}

.info-box .value {
  margin-left: auto;
  font-weight: 600;
  color: #e2e8f0;
}

.damage-section {
  margin-bottom: 1.5rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 0.75rem;
}

/* Damage scale - horizontal bar */
.damage-scale {
  display: flex;
  gap: 2px;
  border-radius: 0.5rem;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.damage-level {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 0.25rem;
  cursor: help;
  transition: all 0.2s;
  min-width: 0;
}

.damage-level.active {
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
}

.damage-level.inactive {
  opacity: 0.4;
}

.damage-level:hover {
  transform: scale(1.05);
  z-index: 1;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.damage-letter {
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1;
}

.damage-threshold {
  font-size: 0.75rem;
  font-weight: 600;
  margin-top: 0.25rem;
  opacity: 0.9;
}

.damage-hint {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #64748b;
  font-style: italic;
}

.description-box {
  padding: 1rem;
  background: rgba(15, 23, 42, 0.3);
  border-left: 3px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.375rem;
  color: #cbd5e1;
  font-size: 0.875rem;
  line-height: 1.6;
  font-style: italic;
}

.modal-footer {
  display: flex;
  gap: 0.75rem;
  padding: 1.5rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

/* Modal buttons */
.modal-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 0.875rem;
  transition: all 0.2s;
  cursor: pointer;
  border: 1px solid;
}

.modal-btn.take {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
  color: #10b981;
}

.modal-btn.take:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.2);
}

.modal-btn.take:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-btn.remove {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.modal-btn.remove:hover {
  background: rgba(239, 68, 68, 0.2);
}

.modal-btn.close {
  background: rgba(71, 85, 105, 0.3);
  border-color: rgba(148, 163, 184, 0.2);
  color: #cbd5e1;
}

.modal-btn.close:hover {
  background: rgba(71, 85, 105, 0.5);
}

.action-button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-weight: 600;
  transition: all 0.2s;
  cursor: pointer;
  border: 1px solid;
}

.action-button.take {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
  color: #10b981;
}

.action-button.take:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.2);
}

.action-button.take:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-button.remove {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.action-button.remove:hover {
  background: rgba(239, 68, 68, 0.2);
}

.action-button.close {
  background: rgba(71, 85, 105, 0.3);
  border-color: rgba(148, 163, 184, 0.2);
  color: #cbd5e1;
}

.action-button.close:hover {
  background: rgba(71, 85, 105, 0.5);
}

@media (max-width: 768px) {
  .weapons-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .price-epoch-row {
    flex-direction: column;
  }
  
  .quick-info-row {
    flex-wrap: wrap;
  }
}
</style>
