<template>
  <div>
    <!-- Weapons Grid -->
    <div class="weapons-grid">
      <div
        v-for="weapon in filteredWeapons"
        :key="weapon.id"
        @click="openWeaponModal(weapon)"
        class="weapon-card"
        :class="getWeaponCardClass(weapon)"
      >
        <!-- Image -->
        <div class="weapon-image-container">
          <img
            :src="`/images/items/${weapon.id}.png`"
            :alt="weapon.name"
            class="weapon-image"
            @error="(e) => e.target.style.display = 'none'"
          />
        </div>

        <!-- Info -->
        <div class="weapon-info">
          <h4 class="weapon-name">{{ weapon.name }}</h4>
          
          <div class="weapon-quick-stats">
            <span class="price" :class="getPriceClass(weapon)">
              <Icon icon="mdi:gold" class="w-3.5 h-3.5" />
              {{ weapon.price }}
            </span>
            <span class="epoch">{{ epochs[weapon.epoch]?.name.substring(0, 10) }}</span>
          </div>
        </div>

        <!-- Selection indicator -->
        <div v-if="isSelected(weapon.id)" class="selected-indicator">
          <Icon icon="mdi:check" class="w-5 h-5" />
        </div>

        <!-- Lock overlay -->
        <div v-if="!canSelect(weapon)" class="locked-overlay">
          <Icon icon="mdi:lock" class="w-8 h-8" />
        </div>
      </div>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="selectedWeapon" class="modal-overlay" @click="closeModal">
        <div class="modal-content" @click.stop>
          <!-- Header -->
          <div class="modal-header">
            <h2 class="text-2xl font-bold text-slate-100">{{ selectedWeapon.name }}</h2>
            <button @click="closeModal" class="close-button">
              <Icon icon="mdi:close" class="w-6 h-6" />
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body">
            <!-- Image -->
            <div class="modal-weapon-image">
              <img
                :src="`/images/items/${selectedWeapon.id}.png`"
                :alt="selectedWeapon.name"
                class="w-full h-full object-contain"
                @error="(e) => e.target.style.display = 'none'"
              />
            </div>

            <!-- Main stats -->
            <div class="stats-grid">
              <div v-if="selectedWeapon.attack !== undefined && typeof selectedWeapon.defence !== 'object'" class="stat-box">
                <div class="stat-label">
                  <Icon icon="mdi:sword" class="w-5 h-5" />
                  Атака
                </div>
                <div class="stat-value">{{ selectedWeapon.attack }}</div>
              </div>

              <div v-if="selectedWeapon.defence !== undefined && typeof selectedWeapon.defence !== 'object'" class="stat-box">
                <div class="stat-label">
                  <Icon icon="mdi:shield" class="w-5 h-5" />
                  Защита
                </div>
                <div class="stat-value">{{ selectedWeapon.defence }}</div>
              </div>

              <div v-if="selectedWeapon.length !== undefined" class="stat-box">
                <div class="stat-label">
                  <Icon icon="mdi:arrow-expand-horizontal" class="w-5 h-5" />
                  Дальность
                </div>
                <div class="stat-value">{{ selectedWeapon.length }}</div>
              </div>

              <div v-if="selectedWeapon.hands !== undefined" class="stat-box">
                <div class="stat-label">
                  <Icon icon="mdi:hand-back-left" class="w-5 h-5" />
                  Руки
                </div>
                <div class="stat-value">{{ selectedWeapon.hands }}</div>
              </div>
            </div>

            <!-- Shield defence table -->
            <div v-if="typeof selectedWeapon.defence === 'object'" class="damage-section">
              <h3 class="section-title">
                <Icon icon="mdi:shield" class="w-5 h-5" />
                Защита щита
              </h3>
              <div class="overflow-x-auto">
                <table class="w-full text-sm bg-slate-950/30 rounded-lg overflow-hidden">
                  <thead>
                    <tr class="bg-slate-900/50">
                      <th class="text-left text-slate-400 p-3">Направление</th>
                      <th class="text-center text-slate-400 p-3">Ближний бой</th>
                      <th class="text-center text-slate-400 p-3">Дальний бой</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="selectedWeapon.defence.front" class="border-t border-slate-800">
                      <td class="p-3 text-slate-300 font-medium">Спереди</td>
                      <td class="text-center p-3">
                        <span class="text-emerald-400 font-bold text-lg">{{ selectedWeapon.defence.front.melee || 0 }}</span>
                      </td>
                      <td class="text-center p-3">
                        <span class="text-sky-400 font-bold text-lg">{{ selectedWeapon.defence.front.ranged || 0 }}</span>
                      </td>
                    </tr>
                    <tr v-if="selectedWeapon.defence.side" class="border-t border-slate-800">
                      <td class="p-3 text-slate-300 font-medium">С фланга</td>
                      <td class="text-center p-3">
                        <span class="text-emerald-400 font-bold text-lg">{{ selectedWeapon.defence.side.melee || 0 }}</span>
                      </td>
                      <td class="text-center p-3">
                        <span class="text-sky-400 font-bold text-lg">{{ selectedWeapon.defence.side.ranged || 0 }}</span>
                      </td>
                    </tr>
                    <tr v-if="selectedWeapon.defence.back" class="border-t border-slate-800">
                      <td class="p-3 text-slate-300 font-medium">Сзади</td>
                      <td class="text-center p-3">
                        <span class="text-emerald-400 font-bold text-lg">{{ selectedWeapon.defence.back.melee || 0 }}</span>
                      </td>
                      <td class="text-center p-3">
                        <span class="text-sky-400 font-bold text-lg">{{ selectedWeapon.defence.back.ranged || 0 }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Price and epoch -->
            <div class="price-epoch-row">
              <div class="info-box">
                <Icon icon="mdi:gold" class="w-5 h-5" />
                <span class="label">Цена</span>
                <span class="value">{{ selectedWeapon.price }}</span>
              </div>
              <div class="info-box">
                <Icon icon="mdi:clock-outline" class="w-5 h-5" />
                <span class="label">Эпоха</span>
                <span class="value">{{ epochs[selectedWeapon.epoch]?.name }}</span>
              </div>
            </div>

            <!-- Damage table -->
            <div class="damage-section">
              <h3 class="section-title">
                <Icon icon="mdi:sword-cross" class="w-5 h-5" />
                Превышение защиты
              </h3>
              <div class="damage-table">
                <div
                  v-for="(effect, threshold) in selectedWeapon.damage"
                  :key="threshold"
                  class="damage-row"
                >
                  <div class="threshold">{{ threshold }}</div>
                  <div class="effect">{{ effect }}</div>
                </div>
              </div>
            </div>

            <!-- Description -->
            <div v-if="selectedWeapon.desc" class="description-box">
              {{ selectedWeapon.desc }}
            </div>
          </div>

          <!-- Footer -->
          <div class="modal-footer">
            <button
              v-if="!isSelected(selectedWeapon.id)"
              @click="selectWeapon"
              class="action-button take"
              :disabled="!canSelect(selectedWeapon)"
            >
              <Icon icon="mdi:plus-circle" class="w-5 h-5" />
              Взять
            </button>
            <button
              v-else
              @click="deselectWeapon"
              class="action-button remove"
            >
              <Icon icon="mdi:close-circle" class="w-5 h-5" />
              Убрать
            </button>
            <button @click="closeModal" class="action-button close">
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import itemsData from '@/data/items.json'
import epochsData from '@/data/epochs.json'

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
  }
})

const emit = defineEmits(['update:modelValue'])

const epochs = epochsData
const weapons = itemsData.items.filter(item => item.category === 'weapon' || item.category === 'shield')

const selectedWeapon = ref(null)

const filteredWeapons = computed(() => {
  if (!props.categoryFilter) return weapons
  return weapons.filter(w => w.subcat === props.categoryFilter)
})

const openWeaponModal = (weapon) => {
  selectedWeapon.value = weapon
}

const closeModal = () => {
  selectedWeapon.value = null
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

const getWeaponCardClass = (weapon) => {
  const selected = isSelected(weapon.id)
  const canSel = canSelect(weapon)
  
  if (selected) return 'card-selected'
  if (!canSel) return 'card-locked'
  return 'card-available'
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
  gap: 0.75rem;
}

.weapon-card {
  position: relative;
  background: rgba(30, 41, 59, 0.3);
  border: 2px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.5rem;
  padding: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.card-available:hover {
  border-color: rgba(148, 163, 184, 0.4);
  background: rgba(30, 41, 59, 0.5);
  transform: translateY(-2px);
}

.card-selected {
  border-color: rgba(16, 185, 129, 0.6);
  background: rgba(16, 185, 129, 0.1);
}

.card-locked {
  opacity: 0.5;
  cursor: not-allowed;
}

.weapon-image-container {
  aspect-ratio: 1;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 0.375rem;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.weapon-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.weapon-info {
  text-align: center;
}

.weapon-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 0.375rem;
  line-height: 1.3;
  min-height: 2.6em;
}

.weapon-quick-stats {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
}

.price {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: 600;
}

.price-green { color: #22c55e; }
.price-yellow { color: #eab308; }
.price-orange { color: #f97316; }
.price-red { color: #ef4444; }

.epoch {
  color: #94a3b8;
}

.selected-indicator {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 28px;
  height: 28px;
  background: #10b981;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.locked-overlay {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.7);
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #475569;
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

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
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

.damage-table {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 0.5rem;
  overflow: hidden;
}

.damage-row {
  display: flex;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.damage-row:last-child {
  border-bottom: none;
}

.threshold {
  width: 60px;
  font-weight: 700;
  color: #e2e8f0;
  font-size: 1.125rem;
}

.effect {
  flex: 1;
  color: #cbd5e1;
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
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }
  
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .price-epoch-row {
    flex-direction: column;
  }
}
</style>
