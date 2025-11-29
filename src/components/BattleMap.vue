<script setup>
import { ref } from 'vue'

const gridSize = ref(10)
</script>

<template>
  <div class="h-full bg-slate-950 text-slate-50 flex flex-col">
    <!-- Тулбар -->
    <header class="bg-slate-900/90 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between flex-shrink-0">
      <div class="flex items-center gap-3">
        <h2 class="text-lg font-semibold">Боевая карта</h2>
        <span class="text-xs px-2 py-1 rounded bg-slate-800 border border-white/10">
          {{ gridSize }}×{{ gridSize }}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="w-9 h-9 rounded-lg border border-white/10 hover:bg-white/5 flex items-center justify-center text-sm"
          title="Сетка"
        >
          ⊞
        </button>
        <button
          type="button"
          class="w-9 h-9 rounded-lg border border-white/10 hover:bg-white/5 flex items-center justify-center text-sm"
          title="Инструменты"
        >
          ✏️
        </button>
      </div>
    </header>

    <!-- Карта -->
    <div class="flex-1 overflow-auto p-4 flex items-center justify-center">
      <div class="bg-slate-900/40 border border-white/10 rounded-2xl p-8">
        <!-- Сетка-плейсхолдер -->
        <div class="grid gap-0.5" :style="{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }">
          <div
            v-for="i in gridSize * gridSize"
            :key="i"
            class="w-12 h-12 sm:w-14 sm:h-14 bg-slate-800/40 border border-slate-700/30 hover:bg-slate-700/40 transition cursor-pointer"
          ></div>
        </div>
      </div>
    </div>

    <!-- Нижняя панель с информацией -->
    <footer class="bg-slate-900/80 backdrop-blur border-t border-white/10 px-4 py-3 flex-shrink-0">
      <div class="flex items-center justify-between text-sm">
        <p class="text-slate-400">
          Кликните на ячейку для размещения персонажа
        </p>
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-400/60 text-sky-100 hover:bg-sky-500/30 transition text-xs"
        >
          Добавить токен
        </button>
      </div>
    </footer>
  </div>
</template>
