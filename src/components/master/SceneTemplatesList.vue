<script setup>
/**
 * SceneTemplatesList - вертикальный список шаблонов сцены для мастера
 * Показывает шаблоны с фильтрами по тегам, метками "отправлен"
 * По клику загружает шаблон в форму MasterSceneTools
 */
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { Icon } from '@iconify/vue'

const props = defineProps({
  templates: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['select-template', 'delete-template', 'toggle-sent'])

// Фильтры по тегам
const activeTagFilters = ref([])

// Ref на контейнер со скроллом
const listContainer = ref(null)

// Scroll position из localStorage
const SCROLL_KEY = 'scene-templates-scroll'

// Все уникальные теги
const allTags = computed(() => {
  const tags = new Set()
  props.templates.forEach(t => {
    t.tags?.forEach(tag => tags.add(tag))
  })
  return Array.from(tags).sort()
})

// Фильтрованные шаблоны
const filteredTemplates = computed(() => {
  if (activeTagFilters.value.length === 0) {
    return props.templates
  }
  return props.templates.filter(t => 
    activeTagFilters.value.some(tag => t.tags?.includes(tag))
  )
})

// Переключить тег-фильтр
const toggleTagFilter = (tag) => {
  const idx = activeTagFilters.value.indexOf(tag)
  if (idx === -1) {
    activeTagFilters.value.push(tag)
  } else {
    activeTagFilters.value.splice(idx, 1)
  }
}

// Иконка типа сообщения
const getToolIcon = (tool) => {
  const icons = {
    'text': 'mdi:message-text',
    'skill-check': 'mdi:dice-d20',
    'battle-invite': 'mdi:sword-cross',
    'image': 'mdi:image',
    'important': 'mdi:alert-circle',
    'quest': 'mdi:map-marker-star',
    'item-give': 'mdi:gift',
    'character-invite': 'mdi:account-plus'
  }
  return icons[tool] || 'mdi:file-document'
}

// Сохранить позицию скролла
const saveScrollPosition = () => {
  if (listContainer.value) {
    localStorage.setItem(SCROLL_KEY, listContainer.value.scrollTop.toString())
  }
}

// Восстановить позицию скролла
const restoreScrollPosition = () => {
  const saved = localStorage.getItem(SCROLL_KEY)
  if (saved && listContainer.value) {
    listContainer.value.scrollTop = parseInt(saved, 10)
  }
}

// Клик по иконке шаблона - переключить sent
const handleIconClick = (event, template) => {
  event.stopPropagation()
  emit('toggle-sent', template.id)
}

// При монтировании восстанавливаем скролл
onMounted(() => {
  nextTick(() => {
    restoreScrollPosition()
  })
})

// Следим за скроллом
const onScroll = () => {
  saveScrollPosition()
}
</script>

<template>
  <div class="templates-list-panel">
    <div class="templates-header">
      <h4 class="templates-title">
        <Icon icon="mdi:bookmark-multiple" />
        Шаблоны
      </h4>
      <span class="templates-count">{{ templates.length }}</span>
    </div>
    
    <!-- Теги-фильтры -->
    <div v-if="allTags.length > 0" class="tag-filters">
      <button
        v-for="tag in allTags"
        :key="tag"
        class="tag-filter"
        :class="{ active: activeTagFilters.includes(tag) }"
        @click="toggleTagFilter(tag)"
      >
        {{ tag }}
      </button>
    </div>
    
    <!-- Список шаблонов -->
    <div 
      ref="listContainer"
      class="templates-scroll"
      @scroll="onScroll"
    >
      <div 
        v-for="template in filteredTemplates" 
        :key="template.id"
        class="template-item"
        :class="{ sent: template.sent }"
        :style="{ '--template-color': template.color }"
        @click="emit('select-template', template)"
      >
        <!-- Большая иконка с меткой sent -->
        <div 
          class="template-icon-wrapper"
          @click="handleIconClick($event, template)"
          :title="template.sent ? 'Отмечен как отправленный (клик - сбросить)' : 'Клик - отметить как отправленный'"
        >
          <Icon :icon="template.icon" class="template-icon" :style="{ color: template.color }" />
          <Icon v-if="template.sent" icon="mdi:check-circle" class="sent-badge" />
        </div>
        
        <!-- Инфо -->
        <div class="template-info">
          <div class="template-name">{{ template.name }}</div>
          <div class="template-meta">
            <Icon :icon="getToolIcon(template.tool)" class="tool-type-icon" />
            <span v-if="template.tags?.length" class="template-tags">
              <span v-for="tag in template.tags.slice(0, 2)" :key="tag" class="mini-tag">{{ tag }}</span>
              <span v-if="template.tags.length > 2" class="mini-tag more">+{{ template.tags.length - 2 }}</span>
            </span>
          </div>
        </div>
        
        <!-- Удалить -->
        <button 
          class="template-delete-btn" 
          @click.stop="emit('delete-template', template.id)"
          title="Удалить шаблон"
        >
          <Icon icon="mdi:delete-outline" />
        </button>
      </div>
      
      <!-- Пустой список -->
      <div v-if="filteredTemplates.length === 0" class="empty-templates">
        <Icon icon="mdi:bookmark-off-outline" />
        <span v-if="templates.length === 0">Нет шаблонов</span>
        <span v-else>Нет шаблонов с выбранными тегами</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.templates-list-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e293b;
  border-radius: 12px;
  overflow: hidden;
}

.templates-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  flex-shrink: 0;
}

.templates-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
  margin: 0;
}

.templates-count {
  font-size: 11px;
  padding: 2px 8px;
  background: rgba(100, 116, 139, 0.3);
  border-radius: 10px;
  color: #64748b;
}

/* Теги-фильтры */
.tag-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  flex-shrink: 0;
}

.tag-filter {
  padding: 3px 8px;
  background: rgba(100, 116, 139, 0.2);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 10px;
  color: #94a3b8;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tag-filter:hover {
  background: rgba(100, 116, 139, 0.3);
}

.tag-filter.active {
  background: rgba(139, 92, 246, 0.2);
  border-color: #8b5cf6;
  color: #c4b5fd;
}

/* Скролл-контейнер */
.templates-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
}

/* Элемент шаблона */
.template-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: 6px;
}

.template-item:hover {
  background: rgba(15, 23, 42, 0.8);
  border-color: var(--template-color, #64748b);
}

.template-item.sent {
  opacity: 0.6;
}

.template-item.sent:hover {
  opacity: 1;
}

/* Иконка с меткой */
.template-icon-wrapper {
  position: relative;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 8px;
  flex-shrink: 0;
  cursor: pointer;
  transition: all 0.15s ease;
}

.template-icon-wrapper:hover {
  background: rgba(15, 23, 42, 0.9);
}

.template-icon {
  font-size: 22px;
}

.sent-badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  font-size: 14px;
  color: #22c55e;
  background: #1e293b;
  border-radius: 50%;
}

/* Инфо */
.template-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.template-name {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.template-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-type-icon {
  font-size: 12px;
  color: #64748b;
}

.template-tags {
  display: flex;
  gap: 3px;
}

.mini-tag {
  padding: 1px 5px;
  background: rgba(100, 116, 139, 0.25);
  border-radius: 6px;
  font-size: 9px;
  color: #94a3b8;
}

.mini-tag.more {
  background: rgba(139, 92, 246, 0.2);
  color: #a78bfa;
}

/* Кнопка удаления */
.template-delete-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 6px;
  color: #475569;
  font-size: 16px;
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.template-item:hover .template-delete-btn {
  opacity: 1;
}

.template-delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

/* Пустой список */
.empty-templates {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: #475569;
  font-size: 12px;
  text-align: center;
}

.empty-templates .iconify {
  font-size: 32px;
  opacity: 0.5;
}
</style>
