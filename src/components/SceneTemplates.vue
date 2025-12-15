<script setup>
/**
 * SceneTemplates - шаблоны сообщений сцены для мастера
 * Позволяет заранее заготовить материалы и отправлять их по необходимости
 */
import { ref, computed, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useSceneLogStore, SceneEventType } from '@/stores/sceneLog'
import { useSessionStore } from '@/stores/session'

const sceneLogStore = useSceneLogStore()
const sessionStore = useSessionStore()
const { connections } = storeToRefs(sessionStore)

// Список шаблонов (сохраняется в localStorage)
const templates = ref([])
const showEditor = ref(false)
const editingTemplate = ref(null)

// Форма редактирования
const templateForm = ref({
  name: '',
  type: 'text', // text, image, important
  content: {
    text: '',
    imageUrl: '',
    title: '',
    icon: 'mdi:alert-circle'
  }
})

// Типы шаблонов
const templateTypes = [
  { id: 'text', label: 'Текст', icon: 'mdi:message-text' },
  { id: 'image', label: 'Картинка', icon: 'mdi:image' },
  { id: 'important', label: 'Важное', icon: 'mdi:alert-circle' }
]

// Загрузка шаблонов из localStorage
onMounted(() => {
  const saved = localStorage.getItem('scene-templates')
  if (saved) {
    try {
      templates.value = JSON.parse(saved)
    } catch (e) {
      console.error('Failed to load templates:', e)
      templates.value = []
    }
  }
})

// Сохранение шаблонов в localStorage
const saveTemplates = () => {
  localStorage.setItem('scene-templates', JSON.stringify(templates.value))
}

// Открыть редактор для нового шаблона
const createTemplate = () => {
  editingTemplate.value = null
  templateForm.value = {
    name: '',
    type: 'text',
    content: {
      text: '',
      imageUrl: '',
      title: '',
      icon: 'mdi:alert-circle'
    }
  }
  showEditor.value = true
}

// Открыть редактор для существующего шаблона
const editTemplate = (template) => {
  editingTemplate.value = template
  templateForm.value = {
    name: template.name,
    type: template.type,
    content: { ...template.content }
  }
  showEditor.value = true
}

// Сохранить шаблон
const saveTemplate = () => {
  if (!templateForm.value.name.trim()) return
  
  const template = {
    id: editingTemplate.value?.id || Date.now().toString(),
    name: templateForm.value.name,
    type: templateForm.value.type,
    content: { ...templateForm.value.content }
  }
  
  if (editingTemplate.value) {
    // Обновляем существующий
    const index = templates.value.findIndex(t => t.id === editingTemplate.value.id)
    if (index !== -1) {
      templates.value[index] = template
    }
  } else {
    // Добавляем новый
    templates.value.push(template)
  }
  
  saveTemplates()
  showEditor.value = false
}

// Удалить шаблон
const deleteTemplate = (template) => {
  templates.value = templates.value.filter(t => t.id !== template.id)
  saveTemplates()
}

// Отменить редактирование
const cancelEdit = () => {
  showEditor.value = false
  editingTemplate.value = null
}

// Отправить шаблон всем игрокам
const sendTemplate = (template) => {
  let event = null
  
  switch (template.type) {
    case 'text':
      event = {
        type: SceneEventType.MASTER_MESSAGE,
        text: template.content.text,
        isSecret: false
      }
      break
    case 'image':
      event = {
        type: SceneEventType.IMAGE,
        url: template.content.imageUrl,
        description: template.content.text || ''
      }
      break
    case 'important':
      event = {
        type: SceneEventType.IMPORTANT,
        title: template.content.title,
        text: template.content.text,
        icon: template.content.icon
      }
      break
  }
  
  if (event) {
    // Отправляем всем игрокам
    const userIds = connections.value.map(c => c.owner?.id).filter(Boolean)
    sceneLogStore.addEvent(event, userIds)
  }
}

// Получить иконку типа
const getTypeIcon = (type) => {
  return templateTypes.find(t => t.id === type)?.icon || 'mdi:file'
}

// Превью контента шаблона
const getPreview = (template) => {
  switch (template.type) {
    case 'text':
      return template.content.text?.substring(0, 50) + (template.content.text?.length > 50 ? '...' : '')
    case 'image':
      return template.content.imageUrl?.substring(0, 40) + '...'
    case 'important':
      return template.content.title || template.content.text?.substring(0, 30)
    default:
      return ''
  }
}
</script>

<template>
  <div class="scene-templates">
    <div class="templates-header">
      <h3 class="templates-title">
        <Icon icon="mdi:file-document-multiple" />
        Шаблоны
      </h3>
      <button class="add-btn" @click="createTemplate" title="Создать шаблон">
        <Icon icon="mdi:plus" />
      </button>
    </div>
    
    <!-- Список шаблонов -->
    <div class="templates-list" v-if="!showEditor">
      <div v-if="templates.length === 0" class="empty-state">
        <Icon icon="mdi:file-document-outline" class="empty-icon" />
        <p>Нет шаблонов</p>
        <button class="create-first-btn" @click="createTemplate">
          Создать первый
        </button>
      </div>
      
      <div 
        v-for="template in templates" 
        :key="template.id" 
        class="template-card"
      >
        <div class="template-info" @click="editTemplate(template)">
          <Icon :icon="getTypeIcon(template.type)" class="template-type-icon" />
          <div class="template-details">
            <div class="template-name">{{ template.name }}</div>
            <div class="template-preview">{{ getPreview(template) }}</div>
          </div>
        </div>
        <div class="template-actions">
          <button class="action-btn send" @click="sendTemplate(template)" title="Отправить всем">
            <Icon icon="mdi:send" />
          </button>
          <button class="action-btn delete" @click="deleteTemplate(template)" title="Удалить">
            <Icon icon="mdi:delete" />
          </button>
        </div>
      </div>
    </div>
    
    <!-- Редактор шаблона -->
    <div v-else class="template-editor">
      <div class="editor-header">
        <span>{{ editingTemplate ? 'Редактировать' : 'Новый шаблон' }}</span>
        <button class="close-btn" @click="cancelEdit">
          <Icon icon="mdi:close" />
        </button>
      </div>
      
      <div class="form-group">
        <label>Название</label>
        <input 
          v-model="templateForm.name" 
          type="text" 
          placeholder="Название шаблона..."
          class="form-input"
        />
      </div>
      
      <div class="form-group">
        <label>Тип</label>
        <div class="type-buttons">
          <button
            v-for="type in templateTypes"
            :key="type.id"
            class="type-btn"
            :class="{ active: templateForm.type === type.id }"
            @click="templateForm.type = type.id"
          >
            <Icon :icon="type.icon" />
            <span>{{ type.label }}</span>
          </button>
        </div>
      </div>
      
      <!-- Поля в зависимости от типа -->
      <template v-if="templateForm.type === 'text'">
        <div class="form-group">
          <label>Текст сообщения</label>
          <textarea 
            v-model="templateForm.content.text" 
            placeholder="Текст..."
            rows="4"
            class="form-textarea"
          ></textarea>
        </div>
      </template>
      
      <template v-else-if="templateForm.type === 'image'">
        <div class="form-group">
          <label>URL изображения</label>
          <input 
            v-model="templateForm.content.imageUrl" 
            type="text" 
            placeholder="https://..."
            class="form-input"
          />
        </div>
        <div class="form-group">
          <label>Описание (необязательно)</label>
          <input 
            v-model="templateForm.content.text" 
            type="text" 
            placeholder="Описание изображения..."
            class="form-input"
          />
        </div>
      </template>
      
      <template v-else-if="templateForm.type === 'important'">
        <div class="form-group">
          <label>Заголовок</label>
          <input 
            v-model="templateForm.content.title" 
            type="text" 
            placeholder="Заголовок..."
            class="form-input"
          />
        </div>
        <div class="form-group">
          <label>Текст</label>
          <textarea 
            v-model="templateForm.content.text" 
            placeholder="Текст..."
            rows="3"
            class="form-textarea"
          ></textarea>
        </div>
      </template>
      
      <div class="editor-actions">
        <button class="cancel-btn" @click="cancelEdit">Отмена</button>
        <button 
          class="save-btn" 
          @click="saveTemplate"
          :disabled="!templateForm.name.trim()"
        >
          Сохранить
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scene-templates {
  background: #1e293b;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.templates-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.templates-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #e2e8f0;
  margin: 0;
}

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #3b82f6;
  cursor: pointer;
  transition: all 0.2s;
}

.add-btn:hover {
  background: rgba(59, 130, 246, 0.3);
}

.templates-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: #64748b;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 8px;
  opacity: 0.5;
}

.create-first-btn {
  margin-top: 12px;
  padding: 8px 16px;
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #3b82f6;
  cursor: pointer;
  font-size: 14px;
}

.template-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 8px;
  transition: all 0.2s;
}

.template-card:hover {
  border-color: rgba(148, 163, 184, 0.3);
}

.template-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  min-width: 0;
}

.template-type-icon {
  font-size: 20px;
  color: #94a3b8;
  flex-shrink: 0;
}

.template-details {
  flex: 1;
  min-width: 0;
}

.template-name {
  font-size: 14px;
  font-weight: 500;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.template-preview {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.template-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.send {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.action-btn.send:hover {
  background: rgba(34, 197, 94, 0.3);
}

.action-btn.delete {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.action-btn.delete:hover {
  background: rgba(239, 68, 68, 0.3);
}

/* Editor */
.template-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 500;
  color: #e2e8f0;
}

.close-btn {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 4px;
  font-size: 18px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 12px;
  font-weight: 500;
  color: #94a3b8;
}

.form-input,
.form-textarea {
  padding: 10px 12px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  color: #e2e8f0;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus,
.form-textarea:focus {
  border-color: rgba(59, 130, 246, 0.5);
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
}

.type-buttons {
  display: flex;
  gap: 8px;
}

.type-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 8px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.type-btn:hover {
  border-color: rgba(148, 163, 184, 0.4);
}

.type-btn.active {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
  color: #3b82f6;
}

.editor-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.cancel-btn,
.save-btn {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn {
  background: rgba(100, 116, 139, 0.2);
  border: 1px solid rgba(100, 116, 139, 0.3);
  color: #94a3b8;
}

.cancel-btn:hover {
  background: rgba(100, 116, 139, 0.3);
}

.save-btn {
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.4);
  color: #3b82f6;
}

.save-btn:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.3);
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
