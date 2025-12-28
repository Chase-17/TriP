<template>
  <div class="icon-select">
    <button
      v-for="option in options"
      :key="option.value"
      :class="['icon-option', { active: modelValue === option.value }]"
      @click="emit('update:modelValue', option.value)"
      :title="option.label"
    >
      <span class="icon">{{ option.icon }}</span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: String, required: true },
  options: {
    type: Array,
    required: true,
    // Each option: { value: string, label: string, icon: string }
  }
})

const emit = defineEmits(['update:modelValue'])
</script>

<style scoped>
.icon-select {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.icon-option {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: #12122a;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-option:hover {
  background: #2a2a5a;
  border-color: #4a4a7a;
}

.icon-option.active {
  background: #3a3a6a;
  border-color: #6a6aaa;
  box-shadow: 0 0 6px rgba(100, 100, 200, 0.3);
}

.icon {
  font-size: 16px;
  line-height: 1;
}
</style>
