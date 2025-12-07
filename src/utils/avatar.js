// Генератор аватарок на основе имени пользователя
const colors = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-500'
]

const patterns = [
  'pattern-dots',
  'pattern-cross',
  'pattern-diagonal',
  'pattern-zigzag',
  'pattern-grid'
]

// Простой хэш строки для генерации консистентного числа
const hashString = (str) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

export const generateAvatar = (seed) => {
  const hash = hashString(seed || 'anonymous')
  const colorIndex = hash % colors.length
  const patternIndex = Math.floor(hash / colors.length) % patterns.length
  
  return {
    color: colors[colorIndex],
    pattern: patterns[patternIndex],
    seed
  }
}

export const getInitials = (name) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export const generateRandomNickname = () => {
  const adjectives = [
    'Смелый', 'Тихий', 'Быстрый', 'Мудрый', 'Хитрый',
    'Добрый', 'Храбрый', 'Ловкий', 'Умный', 'Сильный'
  ]
  const nouns = [
    'Волк', 'Ворон', 'Лис', 'Медведь', 'Сокол',
    'Дракон', 'Тигр', 'Орёл', 'Барс', 'Кот'
  ]
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  const num = Math.floor(Math.random() * 100)
  
  return `${adj}${noun}${num}`
}
