<script setup>
/**
 * MasterSceneTools - инструменты мастера для отправки событий в лог сцены
 * Новый UI: вместо кнопки "Отправить" - аватары игроков для адресной отправки
 */
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useSceneLogStore, SceneEventType } from '@/stores/sceneLog'
import { useSessionStore } from '@/stores/session'
import { useCharactersStore } from '@/stores/characters'
import { useUserStore } from '@/stores/user'
import UserAvatar from './UserAvatar.vue'
import CharacterPortrait from './CharacterPortrait.vue'
import aspectsData from '@/data/aspects.json'
import diffsData from '@/data/diffs.json'

const props = defineProps({
  compact: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'event-sent'])

const sceneLogStore = useSceneLogStore()
const sessionStore = useSessionStore()
const charactersStore = useCharactersStore()
const userStore = useUserStore()

const { connections } = storeToRefs(sessionStore)

// Активный инструмент
const activeTool = ref(null)

// Tracking кому уже отправлено текущее сообщение
const sentToUsers = ref(new Set())

// Инструменты
const tools = [
  { id: 'text', label: 'Текст', icon: 'mdi:message-text', color: '#94a3b8' },
  { id: 'skill-check', label: 'Проверка', icon: 'mdi:dice-d20', color: '#f59e0b' },
  { id: 'battle-invite', label: 'В бой', icon: 'mdi:sword-cross', color: '#ef4444' },
  { id: 'image', label: 'Картинка', icon: 'mdi:image', color: '#8b5cf6' },
  { id: 'important', label: 'Важное', icon: 'mdi:alert-circle', color: '#f59e0b' },
  { id: 'quest', label: 'Квест', icon: 'mdi:map-marker-star', color: '#eab308' },
  { id: 'item-give', label: 'Предмет', icon: 'mdi:gift', color: '#22c55e' },
  { id: 'character-invite', label: 'Персонаж', icon: 'mdi:account-plus', color: '#3b82f6' },
]

const selectTool = (toolId) => {
  activeTool.value = activeTool.value === toolId ? null : toolId
  resetForms()
}

// === Формы для каждого инструмента ===

const textForm = ref({ text: '', isSecret: false })
const skillCheckForm = ref({ checkType: 'war', difficultyIndex: 3, description: '', isSecret: false })
const battleInviteForm = ref({ description: '' })
const imageForm = ref({ url: '', description: '' })
const importantForm = ref({ title: '', text: '', icon: 'mdi:alert-circle' })
const questForm = ref({ title: '', description: '', objectives: '' })
const itemGiveForm = ref({ itemName: '', quantity: 1, description: '' })
const characterInviteForm = ref({})

const resetForms = () => {
  textForm.value = { text: '', isSecret: false }
  skillCheckForm.value = { checkType: 'war', difficultyIndex: 3, description: '', isSecret: false }
  battleInviteForm.value = { description: '' }
  imageForm.value = { url: '', description: '' }
  importantForm.value = { title: '', text: '', icon: 'mdi:alert-circle' }
  questForm.value = { title: '', description: '', objectives: '' }
  itemGiveForm.value = { itemName: '', quantity: 1, description: '' }
  characterInviteForm.value = {}
  sentToUsers.value = new Set()
}

// 6 типов проверок из aspects.json
const checkTypes = computed(() => {
  return aspectsData.aspects.map(aspect => ({
    id: aspect.id,
    name: aspect.check.name,
    color: aspect.color,
    icon: aspect.checkIcon
  }))
})

// Сложности из diffs.json (шаг 3)
const difficultyLevels = computed(() => {
  const levels = []
  const keys = Object.keys(diffsData).map(Number).sort((a, b) => a - b)
  keys.forEach(key => {
    levels.push({
      value: key,
      ...diffsData[key]
    })
  })
  return levels
})

// Текущая сложность
const currentDifficulty = computed(() => {
  const idx = skillCheckForm.value.difficultyIndex
  return difficultyLevels.value[idx] || difficultyLevels.value[0]
})

// Список подключённых игроков с аватарами и персонажами
const connectedPlayers = computed(() => {
  return connections.value.map(conn => {
    // Ищем персонажа этого игрока
    const playerCharacters = charactersStore.getCharactersByUserId(conn.userId)
    const character = playerCharacters.length === 1 ? playerCharacters[0] : null
    
    return {
      oderId: conn.userId,
      name: conn.alias || 'Игрок',
      avatar: conn.avatar,
      character: character, // Единственный персонаж или null
      characterPortrait: character?.portrait || null,
      characterName: character?.name || null,
      sent: sentToUsers.value.has(conn.userId)
    }
  })
})

// Проверка, всем ли отправлено
const allSent = computed(() => {
  if (connections.value.length === 0) return false
  return connections.value.every(c => sentToUsers.value.has(c.userId))
})

// Проверка валидности текущей формы
const isFormValid = computed(() => {
  switch (activeTool.value) {
    case 'text':
      return textForm.value.text.trim().length > 0
    case 'skill-check':
      return true // Всегда валидно - есть дефолтные значения
    case 'battle-invite':
      return true
    case 'image':
      return imageForm.value.url.trim().length > 0
    case 'important':
      return importantForm.value.title.trim().length > 0
    case 'quest':
      return questForm.value.title.trim().length > 0
    case 'item-give':
      return itemGiveForm.value.itemName.trim().length > 0
    case 'character-invite':
      return true
    default:
      return false
  }
})

// === Подготовка данных события для текущего инструмента ===
const prepareEventData = () => {
  switch (activeTool.value) {
    case 'text':
      if (!textForm.value.text.trim()) return null
      return {
        type: SceneEventType.TEXT,
        text: textForm.value.text.trim(),
        isSecret: textForm.value.isSecret
      }
    
    case 'skill-check':
      const diff = currentDifficulty.value
      return {
        type: SceneEventType.SKILL_CHECK,
        checkType: skillCheckForm.value.checkType,
        difficulty: diff.value,
        difficultyName: diff.name,
        difficultyColor: diff.color,
        isSecret: skillCheckForm.value.isSecret,
        description: skillCheckForm.value.description,
        completed: false,
        result: null
      }
    
    case 'battle-invite':
      return {
        type: SceneEventType.BATTLE_INVITE,
        description: battleInviteForm.value.description
      }
    
    case 'image':
      if (!imageForm.value.url.trim()) return null
      return {
        type: SceneEventType.IMAGE,
        url: imageForm.value.url.trim(),
        description: imageForm.value.description
      }
    
    case 'important':
      if (!importantForm.value.title.trim()) return null
      return {
        type: SceneEventType.IMPORTANT,
        title: importantForm.value.title.trim(),
        text: importantForm.value.text,
        icon: importantForm.value.icon
      }
    
    case 'quest':
      if (!questForm.value.title.trim()) return null
      const objectives = questForm.value.objectives
        .split('\n')
        .filter(line => line.trim())
        .map(text => ({ text: text.trim(), completed: false }))
      return {
        type: SceneEventType.QUEST,
        title: questForm.value.title.trim(),
        description: questForm.value.description,
        objectives
      }
    
    case 'item-give':
      if (!itemGiveForm.value.itemName.trim()) return null
      return {
        type: SceneEventType.ITEM_GIVE,
        items: [{
          id: crypto.randomUUID(),
          name: itemGiveForm.value.itemName.trim(),
          quantity: itemGiveForm.value.quantity
        }],
        description: itemGiveForm.value.description,
        accepted: false
      }
    
    case 'character-invite':
      return {
        type: SceneEventType.CHARACTER_INVITE,
        restrictions: {},
        accepted: false
      }
    
    default:
      return null
  }
}

// === Отправка событий ===

// Отправить конкретному игроку
const sendToPlayer = (userId) => {
  const eventData = prepareEventData()
  if (!eventData) return
  
  // Добавляем targetUserIds только для этого игрока и deliveredTo для отслеживания
  const eventWithTarget = {
    ...eventData,
    targetUserIds: [userId],
    deliveredTo: [userId] // Трекинг доставки
  }
  
  // Добавляем в лог мастера
  const fullEvent = sceneLogStore.addEvent(eventWithTarget)
  
  // Отправляем только этому игроку
  const connection = connections.value.find(c => c.userId === userId)
  if (connection?.conn) {
    connection.conn.send({
      type: 'scene-event',
      event: fullEvent
    })
  }
  
  // Помечаем что отправлено
  sentToUsers.value.add(userId)
  // Создаём новый Set для реактивности
  sentToUsers.value = new Set(sentToUsers.value)
  
  emit('event-sent', fullEvent)
}

// Отправить всем
const sendToAll = () => {
  const eventData = prepareEventData()
  if (!eventData) return
  
  // Собираем userId всех подключённых игроков
  const allConnectedUserIds = connections.value
    .filter(c => c.conn?.open)
    .map(c => c.userId)
  
  // targetUserIds = null означает для всех, deliveredTo = список доставленных
  const eventWithTarget = {
    ...eventData,
    targetUserIds: null,
    deliveredTo: allConnectedUserIds
  }
  
  const fullEvent = sceneLogStore.addEvent(eventWithTarget)
  
  // Broadcast всем
  sessionStore.broadcastPayload({
    type: 'scene-event',
    event: fullEvent
  })
  
  emit('event-sent', fullEvent)
  activeTool.value = null
  resetForms()
}

// Для изображения - дополнительно устанавливаем как текущее
const sendImageToPlayer = (oderId) => {
  if (activeTool.value !== 'image') return
  
  // Устанавливаем как текущее изображение
  sceneLogStore.setSceneImage(
    imageForm.value.url.trim(),
    imageForm.value.description,
    sessionStore.userId
  )
  
  sendToPlayer(oderId)
}

const sendImageToAll = () => {
  if (activeTool.value !== 'image') return
  
  sceneLogStore.setSceneImage(
    imageForm.value.url.trim(),
    imageForm.value.description,
    sessionStore.userId
  )
  
  sendToAll()
}

const clearSceneImage = () => {
  sceneLogStore.clearSceneImage()
  
  sessionStore.broadcastPayload({
    type: 'scene-event',
    event: {
      id: crypto.randomUUID(),
      type: SceneEventType.CLEAR_IMAGE,
      time: Date.now()
    }
  })
}

// Завершить отправку (закрыть форму)
const finishSending = () => {
  activeTool.value = null
  resetForms()
}

// Иконки для важных сообщений
const importantIcons = [
  { value: 'mdi:alert-circle', label: 'Внимание' },
  { value: 'mdi:information', label: 'Информация' },
  { value: 'mdi:star', label: 'Важно' },
  { value: 'mdi:shield', label: 'Защита' },
  { value: 'mdi:skull', label: 'Опасность' },
  { value: 'mdi:treasure-chest', label: 'Награда' },
]
</script>

<template>
  <div class="master-scene-tools" :class="{ compact }">
    <div class="tools-header">
      <h3 class="tools-title">
        <Icon icon="mdi:broadcast" />
        Инструменты сцены
      </h3>
      <button v-if="compact" class="close-btn" @click="emit('close')">
        <Icon icon="mdi:close" />
      </button>
    </div>
    
    <!-- Кнопки инструментов -->
    <div class="tools-grid">
      <button
        v-for="tool in tools"
        :key="tool.id"
        class="tool-btn"
        :class="{ active: activeTool === tool.id }"
        :style="{ '--tool-color': tool.color }"
        @click="selectTool(tool.id)"
      >
        <Icon :icon="tool.icon" class="tool-icon" />
        <span class="tool-label">{{ tool.label }}</span>
      </button>
    </div>
    
    <!-- Формы инструментов -->
    <Transition name="slide-down">
      <div v-if="activeTool" class="tool-form">
        <!-- Текст -->
        <template v-if="activeTool === 'text'">
          <div class="form-group">
            <label>Сообщение</label>
            <textarea 
              v-model="textForm.text" 
              placeholder="Введите текст..."
              rows="3"
            ></textarea>
          </div>
          <label class="checkbox-label">
            <input type="checkbox" v-model="textForm.isSecret" />
            Секретно (только видевшие увидят)
          </label>
        </template>
        
        <!-- Проверка навыка -->
        <template v-else-if="activeTool === 'skill-check'">
          <!-- Селектор типа проверки - 6 кнопок -->
          <div class="form-group">
            <label>Тип проверки</label>
            <div class="check-type-grid">
              <button
                v-for="ct in checkTypes"
                :key="ct.id"
                type="button"
                class="check-type-btn"
                :class="{ active: skillCheckForm.checkType === ct.id }"
                :style="{ '--check-color': ct.color }"
                @click="skillCheckForm.checkType = ct.id"
              >
                <Icon :icon="ct.icon" class="check-type-icon" />
                <span>{{ ct.name }}</span>
              </button>
            </div>
          </div>
          
          <!-- Слайдер сложности -->
          <div class="form-group">
            <label>
              Сложность: 
              <span 
                class="difficulty-badge"
                :style="{ 
                  backgroundColor: currentDifficulty.color,
                  color: currentDifficulty.lightText ? '#fff' : '#000'
                }"
              >
                {{ currentDifficulty.name }} ({{ currentDifficulty.value }})
              </span>
            </label>
            <div class="difficulty-slider-container">
              <input 
                type="range" 
                v-model.number="skillCheckForm.difficultyIndex" 
                :min="0" 
                :max="difficultyLevels.length - 1"
                class="difficulty-slider"
                :style="{ '--slider-color': currentDifficulty.color }"
              />
              <div class="difficulty-marks">
                <span 
                  v-for="(diff, idx) in difficultyLevels" 
                  :key="diff.value"
                  class="difficulty-mark"
                  :class="{ active: idx === skillCheckForm.difficultyIndex }"
                  :style="{ left: `${(idx / (difficultyLevels.length - 1)) * 100}%` }"
                  :title="diff.name"
                >
                  <span 
                    class="mark-dot"
                    :style="{ backgroundColor: diff.color }"
                  ></span>
                </span>
              </div>
            </div>
          </div>
          
          <div class="form-group">
            <label>Описание (опц.)</label>
            <input type="text" v-model="skillCheckForm.description" placeholder="Что проверяем?" />
          </div>
          <label class="checkbox-label">
            <input type="checkbox" v-model="skillCheckForm.isSecret" />
            Секретная проверка
          </label>
        </template>
        
        <!-- Приглашение в бой -->
        <template v-else-if="activeTool === 'battle-invite'">
          <div class="form-group">
            <label>Описание (опц.)</label>
            <input type="text" v-model="battleInviteForm.description" placeholder="Начало битвы..." />
          </div>
        </template>
        
        <!-- Изображение -->
        <template v-else-if="activeTool === 'image'">
          <div class="form-group">
            <label>URL изображения</label>
            <input type="url" v-model="imageForm.url" placeholder="https://..." />
          </div>
          <div class="form-group">
            <label>Описание</label>
            <textarea v-model="imageForm.description" placeholder="Что на картинке?" rows="2"></textarea>
          </div>
          <button class="clear-btn" @click="clearSceneImage">
            <Icon icon="mdi:image-off" />
            Очистить изображение сцены
          </button>
        </template>
        
        <!-- Важное сообщение -->
        <template v-else-if="activeTool === 'important'">
          <div class="form-group">
            <label>Заголовок</label>
            <input type="text" v-model="importantForm.title" placeholder="Важное событие!" />
          </div>
          <div class="form-group">
            <label>Текст</label>
            <textarea v-model="importantForm.text" placeholder="Подробности..." rows="2"></textarea>
          </div>
          <div class="form-group">
            <label>Иконка</label>
            <div class="icon-picker">
              <button
                v-for="icon in importantIcons"
                :key="icon.value"
                type="button"
                class="icon-option"
                :class="{ active: importantForm.icon === icon.value }"
                :title="icon.label"
                @click="importantForm.icon = icon.value"
              >
                <Icon :icon="icon.value" />
              </button>
            </div>
          </div>
        </template>
        
        <!-- Квест -->
        <template v-else-if="activeTool === 'quest'">
          <div class="form-group">
            <label>Название квеста</label>
            <input type="text" v-model="questForm.title" placeholder="Найти сокровище..." />
          </div>
          <div class="form-group">
            <label>Описание</label>
            <textarea v-model="questForm.description" placeholder="Подробности задания..." rows="2"></textarea>
          </div>
          <div class="form-group">
            <label>Цели (по одной на строку)</label>
            <textarea v-model="questForm.objectives" placeholder="Поговорить с NPC&#10;Найти ключ&#10;Открыть дверь" rows="3"></textarea>
          </div>
        </template>
        
        <!-- Выдача предмета -->
        <template v-else-if="activeTool === 'item-give'">
          <div class="form-row">
            <div class="form-group flex-1">
              <label>Предмет</label>
              <input type="text" v-model="itemGiveForm.itemName" placeholder="Зелье здоровья" />
            </div>
            <div class="form-group quantity">
              <label>Кол-во</label>
              <input type="number" v-model.number="itemGiveForm.quantity" min="1" />
            </div>
          </div>
        </template>
        
        <!-- Приглашение создать персонажа -->
        <template v-else-if="activeTool === 'character-invite'">
          <p class="form-hint">Игрок получит приглашение создать нового персонажа</p>
        </template>
        
        <!-- === Секция отправки: аватары игроков === -->
        <div class="send-section">
          <div class="send-label">Отправить:</div>
          
          <div class="recipients-grid">
            <!-- Аватары/портреты игроков -->
            <button
              v-for="player in connectedPlayers"
              :key="player.oderId"
              class="recipient-btn"
              :class="{ sent: player.sent }"
              :disabled="!isFormValid || player.sent"
              @click="activeTool === 'image' ? sendImageToPlayer(player.oderId) : sendToPlayer(player.oderId)"
              :title="player.sent ? `Отправлено ${player.name}` : `Отправить ${player.name}`"
            >
              <!-- Если есть единственный персонаж - показываем его портрет -->
              <CharacterPortrait 
                v-if="player.characterPortrait"
                :portrait="player.characterPortrait"
                :size="44"
                :showBorder="true"
              />
              <UserAvatar 
                v-else
                :avatar="player.avatar" 
                :name="player.name"
                :size="40"
              />
              <div class="recipient-info">
                <span class="recipient-name">{{ player.name }}</span>
                <span v-if="player.characterName" class="recipient-char">{{ player.characterName }}</span>
              </div>
              <Icon v-if="player.sent" icon="mdi:check-circle" class="sent-icon" />
            </button>
          </div>
          
          <!-- Кнопка "Всем" на отдельной строке -->
          <button
            class="send-all-btn"
            :class="{ sent: allSent }"
            :disabled="!isFormValid"
            @click="activeTool === 'image' ? sendImageToAll() : sendToAll()"
          >
            <Icon icon="mdi:account-group" />
            <span>Отправить всем</span>
          </button>
          
          <!-- Кнопка завершить, если уже кому-то отправлено -->
          <button 
            v-if="sentToUsers.size > 0"
            class="finish-btn"
            @click="finishSending"
          >
            <Icon icon="mdi:check" />
            Готово
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.master-scene-tools {
  background: #1e293b;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.master-scene-tools.compact {
  padding: 12px;
  gap: 12px;
}

.tools-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tools-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #e2e8f0;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  color: #64748b;
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
}

/* Сетка инструментов */
.tools-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.compact .tools-grid {
  gap: 6px;
}

.tool-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s ease;
}

.compact .tool-btn {
  padding: 8px 4px;
}

.tool-btn:hover {
  background: rgba(15, 23, 42, 0.8);
  border-color: var(--tool-color);
}

.tool-btn.active {
  background: color-mix(in srgb, var(--tool-color) 20%, transparent);
  border-color: var(--tool-color);
  color: var(--tool-color);
}

.tool-icon {
  font-size: 24px;
}

.compact .tool-icon {
  font-size: 20px;
}

.tool-label {
  font-size: 11px;
  font-weight: 500;
}

.compact .tool-label {
  font-size: 10px;
}

/* Форма */
.tool-form {
  background: rgba(15, 23, 42, 0.5);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
}

.form-group input,
.form-group textarea,
.form-group select {
  padding: 10px 12px;
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  color: #e2e8f0;
  font-size: 14px;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: #3b82f6;
}

.form-group textarea {
  resize: vertical;
  min-height: 60px;
}

.form-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.form-row .form-group.flex-1 {
  flex: 1;
}

.form-row .form-group.quantity {
  width: 80px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #94a3b8;
  cursor: pointer;
}

.checkbox-label input {
  width: 16px;
  height: 16px;
}

.form-hint {
  font-size: 12px;
  color: #64748b;
  margin: 0;
}

/* Иконки */
.icon-picker {
  display: flex;
  gap: 8px;
}

.icon-option {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  color: #94a3b8;
  font-size: 20px;
  cursor: pointer;
}

.icon-option.active {
  border-color: #f59e0b;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

/* === Секция отправки с аватарами === */
.send-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.send-label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
}

.recipients-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.recipient-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  min-width: 70px;
}

.recipient-btn:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
}

.recipient-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.recipient-btn.sent {
  background: rgba(34, 197, 94, 0.2);
  border-color: #22c55e;
}

.recipient-name {
  font-size: 10px;
  color: #94a3b8;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sent-icon {
  position: absolute;
  top: 4px;
  right: 4px;
  color: #22c55e;
  font-size: 14px;
}

.recipient-btn.send-all {
  background: rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.3);
}

.recipient-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.recipient-name {
  font-size: 10px;
  color: #94a3b8;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recipient-char {
  font-size: 9px;
  color: #64748b;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Кнопка "Всем" на отдельной строке */
.send-all-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2));
  border: 1px solid rgba(139, 92, 246, 0.4);
  border-radius: 8px;
  color: #c4b5fd;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.send-all-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3));
  border-color: #8b5cf6;
}

.send-all-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-all-btn.sent {
  background: rgba(34, 197, 94, 0.2);
  border-color: #22c55e;
  color: #22c55e;
}

.finish-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid #22c55e;
  border-radius: 8px;
  color: #22c55e;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.finish-btn:hover {
  background: rgba(34, 197, 94, 0.3);
}

.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: rgba(148, 163, 184, 0.2);
  border: none;
  border-radius: 8px;
  color: #94a3b8;
  font-size: 13px;
  cursor: pointer;
}

.clear-btn:hover {
  background: rgba(148, 163, 184, 0.3);
}

/* === Стили для проверки навыка === */
.check-type-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.check-type-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  color: #94a3b8;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.check-type-btn:hover {
  border-color: var(--check-color);
  color: var(--check-color);
}

.check-type-btn.active {
  background: color-mix(in srgb, var(--check-color) 20%, transparent);
  border-color: var(--check-color);
  color: var(--check-color);
}

.check-type-icon {
  font-size: 20px;
}

/* Слайдер сложности */
.difficulty-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.difficulty-slider-container {
  position: relative;
  padding: 8px 0 20px;
}

.difficulty-slider {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(to right, 
    #00DDFF 0%, #00DDFF 15%,
    #00CC44 15%, #00CC44 30%,
    #FFEE00 30%, #FFEE00 45%,
    #FF8800 45%, #FF8800 60%,
    #CC0000 60%, #CC0000 75%,
    #440066 75%, #440066 90%,
    #000000 90%, #000000 100%
  );
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}

.difficulty-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--slider-color, #fff);
  border: 3px solid #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  cursor: pointer;
}

.difficulty-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--slider-color, #fff);
  border: 3px solid #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  cursor: pointer;
}

.difficulty-marks {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 12px;
}

.difficulty-mark {
  position: absolute;
  transform: translateX(-50%);
}

.mark-dot {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  opacity: 0.5;
}

.difficulty-mark.active .mark-dot {
  width: 8px;
  height: 8px;
  opacity: 1;
  box-shadow: 0 0 4px currentColor;
}

/* Анимации */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.2s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
