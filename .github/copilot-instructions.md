# TriP - AI Coding Instructions

## Project Overview
TriP is a **mobile-first Virtual Tabletop (VTT)** for tabletop RPGs. Uses P2P architecture (PeerJS) with no central server. Master hosts a room, players join via room code.

## Architecture

### Core Concepts
- **Master** — Hosts room, controls map/NPCs, broadcasts game state
- **Player** — Joins room, controls single character, receives state from master
- **Token** — Visual representation on hex map (character or NPC)
- **Hex** — Map cell using axial coordinates `(q, r)` per [Red Blob Games](https://www.redblobgames.com/grids/hexagons/)

### Key Data Flows
1. **P2P Sync**: Master → broadcasts state changes → Players receive via `session.js` store
2. **State Machine**: `interaction.js` store manages map interaction states: `IDLE → TOKEN_SELECTED → PATH_SHOWN → DRAGGING_FACING`
3. **Persistence**: Pinia stores use `pinia-plugin-persistedstate` with `trip-*` key prefix

## File Organization

### Components (`src/components/`)
Organized by domain. Each subfolder has `README.md`:
- `battle/` — BattleMap, SceneLog (hex map rendering, events)
- `character/` — Creation wizard, character sheet (large files: 1800-3600 LOC)
- `equipment/` — Inventory, weapon/armor selection
- `master/` — Master tools, NPC panel, templates
- `layout/` — GameLayout, overlays, mobile adaptations
- `shared/` — Reusable: Avatar, HealthDisplay, icons

### Utilities (`src/utils/`)
Domain-organized with index.js re-exports:
```javascript
// Hex geometry
import { HexGrid, hexKey, hexDistance } from '@/utils/hex/grid'
import { findPath } from '@/utils/hex/pathfinding'

// Character calculations
import { calculateWoundSlots } from '@/utils/character/wounds'
import { getDefenceData } from '@/utils/character/defence'

// Assets
import { assetUrl, presetUrl } from '@/utils/assets'
```

### Stores (`src/stores/`)
8 Pinia stores with persist plugin:
- `session.js` — P2P room management, message queue, PeerJS connection (2000+ LOC)
- `battleMap.js` — Map state, tokens, viewport, terrain
- `characters.js` — Character data, sync between master/players
- `interaction.js` — State machine for map interactions

### Game Data (`src/data/`)
Static JSON files: `races.json`, `classes.json`, `items.json`, `terrains.json`, etc.

## Code Patterns

### Vue Components
```vue
<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCharactersStore } from '@/stores/characters'

const store = useCharactersStore()
const { characters } = storeToRefs(store)  // Always use storeToRefs for reactivity
</script>
```

### Store Definition
```javascript
export const useExampleStore = defineStore('example', {
  state: () => ({ /* ... */ }),
  actions: { /* ... */ },
  persist: { key: 'trip-example' }  // Required for persistence
})
```

### Composables (`src/composables/`)
Extract shared logic: `useTokenMovement.js`, `useBrushTool.js`, `useMapCamera.js`

## Commands
```powershell
npm run dev        # Start dev server
npm run test:unit  # Vitest unit tests
npm run lint       # ESLint with auto-fix
npm run build      # Production build
```

## Important Conventions

1. **Mobile-first**: All UI must work on touch devices. Use UnoCSS responsive classes.
2. **Hex coordinates**: Always use axial `{q, r}` format. Use `hexKey(q, r)` for string keys.
3. **P2P messages**: Broadcast via `session.js` actions. Message types defined in store.
4. **Large components**: Character sheets are 1500-3600 LOC. Extract logic to composables when editing.
5. **README per folder**: Update relevant `README.md` when adding new files.
6. **Icons**: Use `@iconify/vue` — `<Icon icon="mdi:sword" />`

## Testing
- Framework: Vitest + jsdom
- Test files: `src/stores/__tests__/`
- Run single: `npm run test:unit -- --filter=storeName`
