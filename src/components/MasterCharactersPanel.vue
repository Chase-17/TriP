<script setup>
/**
 * MasterCharactersPanel - панель управления персонажами для мастера
 * Отображает персонажей всех игроков и NPC/монстров
 */
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCharactersStore } from '@/stores/characters'
import { useSessionStore } from '@/stores/session'
import HealthDisplay from './HealthDisplay.vue'
import CharacterPortrait from './CharacterPortrait.vue'
import PlayerIcon from './PlayerIcon.vue'
import NpcPanel from './NpcPanel.vue'
import { getDefenceData } from '@/utils/defence'

// Активный таб: 'all', 'players' или 'npcs'
const activeTab = ref('all')

const charactersStore = useCharactersStore()
const sessionStore = useSessionStore()

const emit = defineEmits(['open-character-sheet'])

const { connections } = storeToRefs(sessionStore)

// Отслеживаем персонажей с несинхронизированными изменениями
const pendingChanges = ref(new Set())

// Отслеживаем накопленные изменения здоровья для каждого персонажа
// { charId: { hpDelta: number, woundChanges: { scratch: +1, light: -2, ... } } }
const healthDeltas = ref(new Map())

// Все персонажи игроков (не NPC)
const allPlayerCharacters = computed(() => charactersStore.allPlayerCharacters)

// Персонажи сгруппированные по владельцу
const charactersByOwner = computed(() => {
  const grouped = {}
  
  allPlayerCharacters.value.forEach(char => {
    const ownerId = char.ownerId || 'unknown'
    if (!grouped[ownerId]) {
      grouped[ownerId] = {
        ownerId,
        ownerNickname: char.ownerNickname || 'Неизвестный игрок',
        characters: []
      }
    }
    grouped[ownerId].characters.push(char)
  })
  
  return Object.values(grouped)
})

// Общее количество персонажей
const totalCharacters = computed(() => allPlayerCharacters.value.length)

// Получить иконку класса
const getClassIcon = (classId) => {
  const icons = {
    commander: '⚔️',
    warrior: '🗡️',
    ranger: '🏹',
    mage: '🔮',
    healer: '💚',
    rogue: '🗝️',
    bard: '🎭',
    paladin: '🛡️'
  }
  return icons[classId] || '👤'
}

// Получить название класса на русском
const getClassName = (classId) => {
  const names = {
    commander: 'Командир',
    warrior: 'Воин',
    ranger: 'Следопыт',
    mage: 'Маг',
    healer: 'Целитель',
    rogue: 'Плут',
    bard: 'Бард',
    paladin: 'Паладин'
  }
  return names[classId] || classId || 'Без класса'
}

// Проверить онлайн ли игрок
const isPlayerOnline = (ownerId) => {
  return connections.value.some(c => c.userId === ownerId || c.peerId === ownerId)
}

// Получить данные иконки игрока
const getPlayerIconData = (ownerId) => {
  const player = sessionStore.allPlayers.find(p => p.userId === ownerId)
  return {
    iconId: player?.playerIcon || null,
    colorId: player?.playerColor || null
  }
}

// Синхронизировать персонажа с игроком
const syncCharacterToPlayer = (charId) => {
  const char = charactersStore.characters.find(c => c.id === charId)
  if (char?.ownerId && !char.isNpc) {
    // Отправляем сплеш с эффектом изменения здоровья только владельцу персонажа игрока
    const delta = healthDeltas.value.get(charId)
    if (delta) {
      if (char.combat?.healthType === 'simple') {
        // Простое HP
        if (delta.hpDelta < 0) {
          sessionStore.sendDamageEffect(char.ownerId, Math.abs(delta.hpDelta))
        } else if (delta.hpDelta > 0) {
          sessionStore.sendHealEffect(char.ownerId, delta.hpDelta)
        }
      } else {
        // Ранения - считаем общий урон
        const wounds = delta.woundChanges || {}
        const totalDamage = (wounds.scratch || 0) + (wounds.light || 0) * 2 + (wounds.heavy || 0) * 3 + (wounds.deadly || 0) * 4
        const totalHeal = Math.abs(Math.min(0, wounds.scratch || 0)) + Math.abs(Math.min(0, wounds.light || 0)) * 2 + 
                         Math.abs(Math.min(0, wounds.heavy || 0)) * 3 + Math.abs(Math.min(0, wounds.deadly || 0)) * 4
        
        if (totalDamage > 0) {
          sessionStore.sendDamageEffect(char.ownerId, totalDamage, 'ран')
        }
        if (totalHeal > 0) {
          sessionStore.sendHealEffect(char.ownerId, totalHeal)
        }
      }
      
      healthDeltas.value.delete(charId)
    }
    
    sessionStore.sendCharacterToPlayer(charId, char.ownerId)
    pendingChanges.value.delete(charId)
  }
}

// Синхронизировать всех персонажей с ожидающими изменениями
const syncAllPendingChanges = () => {
  pendingChanges.value.forEach(charId => {
    syncCharacterToPlayer(charId)
  })
  pendingChanges.value.clear()
}

// Пометить персонажа как имеющего несинхронизированные изменения
const markPendingChange = (charId) => {
  pendingChanges.value.add(charId)
}

// Проверить есть ли несинхронизированные изменения у персонажа
const hasPendingChanges = (charId) => {
  return pendingChanges.value.has(charId)
}

// Обработчики здоровья (накапливают изменения, не синхронизируют сразу)
const handleUpdateHp = (charId, newHp) => {
  const char = charactersStore.characters.find(c => c.id === charId)
  if (!char) return
  
  const oldHp = char.combat?.hp || 0
  const delta = newHp - oldHp
  
  charactersStore.updateCharacter(charId, {
    combat: {
      ...char.combat,
      hp: newHp
    }
  })
  
  // Накапливаем изменения HP
  const existing = healthDeltas.value.get(charId) || { hpDelta: 0, woundChanges: {} }
  existing.hpDelta += delta
  healthDeltas.value.set(charId, existing)
  
  markPendingChange(charId)
}

const handleAddWound = (charId, woundType) => {
  charactersStore.addWound(charId, woundType)
  
  // Накапливаем изменения ранений
  const existing = healthDeltas.value.get(charId) || { hpDelta: 0, woundChanges: {} }
  existing.woundChanges[woundType] = (existing.woundChanges[woundType] || 0) + 1
  healthDeltas.value.set(charId, existing)
  
  markPendingChange(charId)
}

const handleRemoveWound = (charId, woundType) => {
  charactersStore.removeWound(charId, woundType)
  
  // Накапливаем изменения ранений (отрицательные = лечение)
  const existing = healthDeltas.value.get(charId) || { hpDelta: 0, woundChanges: {} }
  existing.woundChanges[woundType] = (existing.woundChanges[woundType] || 0) - 1
  healthDeltas.value.set(charId, existing)
  
  markPendingChange(charId)
}

// Послебоевое восстановление
const handlePostCombatRecovery = (charId) => {
  charactersStore.postCombatRecovery(charId)
  markPendingChange(charId)
}

const toggleHealthType = (charId) => {
  const char = charactersStore.characters.find(c => c.id === charId)
  if (!char) return
  
  const newType = char.combat?.healthType === 'simple' ? 'wounds' : 'simple'
  charactersStore.setHealthType(charId, newType)
  
  // Переключение типа здоровья синхронизируем сразу
  syncCharacterToPlayer(charId)
}

// Открыть лист персонажа
const openCharacterSheet = (charId) => {
  emit('open-character-sheet', charId)
}
</script>

<template>
  <div class="h-full flex flex-col bg-slate-950 text-slate-50">
    <!-- Header с табами -->
    <header class="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex-shrink-0">
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-xl font-bold flex items-center gap-2">
          <span>👥</span>
          <span>Персонажи</span>
        </h1>
      </div>
      
      <!-- Tabs -->
      <div class="flex gap-2">
        <button
          @click="activeTab = 'all'"
          class="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          :class="activeTab === 'all' 
            ? 'bg-purple-600 text-white' 
            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'"
        >
          📋 Все
          <span class="ml-1 text-xs opacity-75">({{ totalCharacters + (charactersStore.allNpcs?.length || 0) }})</span>
        </button>
        <button
          @click="activeTab = 'players'"
          class="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          :class="activeTab === 'players' 
            ? 'bg-sky-600 text-white' 
            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'"
        >
          👤 Игроки
          <span class="ml-1 text-xs opacity-75">({{ totalCharacters }})</span>
        </button>
        <button
          @click="activeTab = 'npcs'"
          class="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          :class="activeTab === 'npcs' 
            ? 'bg-amber-600 text-white' 
            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'"
        >
          👹 NPC
          <span class="ml-1 text-xs opacity-75">({{ charactersStore.allNpcs?.length || 0 }})</span>
        </button>
      </div>
    </header>
    
    <!-- All Tab Content -->
    <div v-if="activeTab === 'all'" class="flex-1 overflow-y-auto p-6">
      <!-- Players Section -->
      <div v-if="totalCharacters > 0" class="mb-8">
        <h3 class="text-lg font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <span>👤</span> Персонажи игроков
          <span class="text-sm text-slate-500">({{ totalCharacters }})</span>
        </h3>
        <div class="space-y-3">
          <div
            v-for="group in charactersByOwner"
            :key="group.ownerId"
            class="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden"
          >
            <div class="px-4 py-2 bg-slate-800/50 border-b border-slate-700 flex items-center gap-3">
              <div
                class="w-2 h-2 rounded-full"
                :class="isPlayerOnline(group.ownerId) ? 'bg-emerald-500' : 'bg-slate-500'"
              ></div>
              <PlayerIcon 
                :icon-id="getPlayerIconData(group.ownerId).iconId"
                :color="getPlayerIconData(group.ownerId).colorId"
                :size="16"
              />
              <span class="font-medium text-sm">{{ group.ownerNickname }}</span>
            </div>
            <div class="divide-y divide-slate-800/50">
              <div
                v-for="char in group.characters"
                :key="char.id"
                class="p-3 hover:bg-slate-800/30 transition cursor-pointer flex items-center gap-3"
                @click="openCharacterSheet(char.id)"
              >
                <CharacterPortrait
                  :portrait="char.portrait"
                  :name="char.name"
                  :combat="char.combat"
                  :stats="char.stats"
                  size="sm"
                />
                <div class="flex-1 min-w-0">
                  <div class="font-medium truncate">{{ char.name }}</div>
                  <div class="text-xs text-slate-500">{{ getClassName(char.class) }}</div>
                </div>
                <HealthDisplay
                  :combat="char.combat"
                  :stats="char.stats"
                  compact
                  @update:hp="(val) => handleUpdateHp(char.id, val)"
                  @add-wound="(type) => handleAddWound(char.id, type)"
                  @remove-wound="(type) => handleRemoveWound(char.id, type)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- NPC Section -->
      <div v-if="charactersStore.allNpcs?.length > 0">
        <h3 class="text-lg font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <span>👹</span> NPC и монстры
          <span class="text-sm text-slate-500">({{ charactersStore.allNpcs.length }})</span>
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="npc in charactersStore.allNpcs"
            :key="npc.id"
            class="bg-slate-900/50 rounded-xl border border-slate-800 p-3 hover:bg-slate-800/30 transition cursor-pointer flex items-center gap-3"
            @click="openCharacterSheet(npc.id)"
          >
            <CharacterPortrait
              v-if="npc.portrait"
              :portrait="npc.portrait"
              :name="npc.name"
              :combat="npc.combat"
              size="sm"
            />
            <div v-else class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-lg">
              👹
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate">{{ npc.name }}</div>
              <div class="text-xs text-slate-500">{{ npc.category }}</div>
            </div>
            <div v-if="npc.combat?.healthType === 'simple'" class="text-sm text-slate-400">
              ❤️ {{ npc.combat.hp }}/{{ npc.combat.maxHp }}
            </div>
          </div>
        </div>
      </div>
      
      <!-- Empty state -->
      <div v-if="totalCharacters === 0 && (!charactersStore.allNpcs || charactersStore.allNpcs.length === 0)" class="flex flex-col items-center justify-center h-full text-center">
        <div class="text-6xl mb-4">🎭</div>
        <h2 class="text-xl font-medium text-slate-300 mb-2">Нет персонажей</h2>
        <p class="text-slate-500 max-w-md">
          Персонажи игроков появятся здесь когда они подключатся.
          NPC можно создать во вкладке "NPC".
        </p>
      </div>
    </div>
    
    <!-- Players Tab Content -->
    <div v-if="activeTab === 'players'" class="flex-1 overflow-y-auto p-6">
      <!-- Empty state -->
      <div v-if="totalCharacters === 0" class="flex flex-col items-center justify-center h-full text-center">
        <div class="text-6xl mb-4">🎭</div>
        <h2 class="text-xl font-medium text-slate-300 mb-2">Нет персонажей</h2>
        <p class="text-slate-500 max-w-md">
          Персонажи игроков появятся здесь, когда они подключатся к комнате.
          Убедитесь, что игроки создали персонажей перед подключением.
        </p>
      </div>
      
      <!-- Characters grouped by owner -->
      <div v-else class="space-y-6">
        <div
          v-for="group in charactersByOwner"
          :key="group.ownerId"
          class="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden"
        >
          <!-- Owner header -->
          <div class="px-4 py-3 bg-slate-800/50 border-b border-slate-700 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div
                class="w-3 h-3 rounded-full"
                :class="isPlayerOnline(group.ownerId) ? 'bg-emerald-500' : 'bg-slate-500'"
                :title="isPlayerOnline(group.ownerId) ? 'Онлайн' : 'Офлайн'"
              ></div>
              <PlayerIcon 
                :icon-id="getPlayerIconData(group.ownerId).iconId"
                :color="getPlayerIconData(group.ownerId).colorId"
                :size="20"
              />
              <span class="font-medium">{{ group.ownerNickname }}</span>
              <span class="text-sm text-slate-500">({{ group.characters.length }} перс.)</span>
            </div>
          </div>
          
          <!-- Characters list -->
          <div class="divide-y divide-slate-800/50">
            <div
              v-for="char in group.characters"
              :key="char.id"
              class="p-4 hover:bg-slate-800/30 transition cursor-pointer"
              @click="openCharacterSheet(char.id)"
            >
              <div class="flex items-start gap-4">
                <!-- Portrait с ранениями -->
                <CharacterPortrait
                  :portrait="char.portrait"
                  :name="char.name"
                  :combat="char.combat"
                  :stats="char.stats"
                  :meleeDefence="getDefenceData(char, 'melee')"
                  :rangedDefence="getDefenceData(char, 'ranged')"
                  :showDefence="true"
                  defenceLayout="left"
                  size="lg"
                />
                
                <!-- Info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <h3 class="font-bold text-lg truncate">{{ char.name }}</h3>
                    <span class="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                      {{ getClassIcon(char.class) }} {{ getClassName(char.class) }}
                    </span>
                  </div>
                  
                  <!-- Stats row -->
                  <div class="flex flex-wrap gap-3 text-sm">
                    <!-- Race -->
                    <div v-if="char.race" class="text-slate-400">
                      🧬 {{ char.race }}{{ char.subrace ? ` (${char.subrace})` : '' }}
                    </div>
                    
                    <!-- Gender -->
                    <div v-if="char.gender" class="text-slate-400">
                      {{ char.gender === 'm' ? '♂️' : '♀️' }}
                    </div>
                  </div>
                  
                  <!-- Health Display -->
                  <div class="mt-3">
                    <HealthDisplay
                      :combat="char.combat"
                      :stats="char.stats"
                      @update:hp="(val) => handleUpdateHp(char.id, val)"
                      @add-wound="(type) => handleAddWound(char.id, type)"
                      @remove-wound="(type) => handleRemoveWound(char.id, type)"
                    />
                    
                    <!-- Кнопка отправки изменений и послебоевое восстановление -->
                    <div class="flex gap-2 mt-2">
                      <button
                        v-if="hasPendingChanges(char.id)"
                        @click="syncCharacterToPlayer(char.id)"
                        class="flex-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center justify-center gap-1"
                      >
                        <span>📤</span>
                        <span>Отправить</span>
                      </button>
                      <button
                        v-if="char.combat?.healthType === 'wounds'"
                        @click="handlePostCombatRecovery(char.id)"
                        class="px-3 py-1.5 rounded-lg text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 transition"
                        title="Послебоевое восстановление: раны смещаются на категорию ниже"
                      >
                        🩹 Отдых
                      </button>
                    </div>
                  </div>
                  
                  <!-- Aspects/Stats -->
                  <div v-if="char.stats" class="flex flex-wrap gap-2 mt-2">
                    <span
                      v-for="(value, aspect) in char.stats"
                      :key="aspect"
                      class="text-xs px-1.5 py-0.5 rounded bg-slate-800"
                      :class="{
                        'text-rose-400': aspect === 'war',
                        'text-blue-400': aspect === 'knowledge',
                        'text-amber-400': aspect === 'community',
                        'text-slate-400': aspect === 'shadow',
                        'text-purple-400': aspect === 'mysticism',
                        'text-emerald-400': aspect === 'nature'
                      }"
                    >
                      {{ aspect.slice(0, 3).toUpperCase() }}: {{ value }}
                    </span>
                  </div>
                </div>
                
                <!-- Actions -->
                <div class="flex flex-col gap-1">
                  <button
                    class="p-2 rounded-lg hover:bg-sky-700 text-sky-400 hover:text-white transition"
                    title="Открыть лист персонажа"
                    @click="openCharacterSheet(char.id)"
                  >
                    📋
                  </button>
                  <button
                    class="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
                    :title="char.combat?.healthType === 'simple' ? 'Переключить на ранения' : 'Переключить на HP'"
                    @click="toggleHealthType(char.id)"
                  >
                    {{ char.combat?.healthType === 'simple' ? '📊' : '❤️' }}
                  </button>
                  <button
                    class="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
                    title="Нанести урон"
                  >
                    💥
                  </button>
                  <button
                    class="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
                    title="Исцелить"
                  >
                    💚
                  </button>
                  <button
                    class="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
                    title="Разместить на карте"
                  >
                    📍
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- NPC Tab Content -->
    <NpcPanel v-else-if="activeTab === 'npcs'" class="flex-1" @open-character-sheet="openCharacterSheet" />
  </div>
</template>
