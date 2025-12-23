# Stores / Хранилища состояния

Pinia stores с персистентностью для управления состоянием приложения.

## battleMap.js
Состояние боевой карты.

**State:**
- `map` - данные карты (гексы, terrain)
- `tokens` - токены на карте
- `selectedTokenId` - выбранный токен
- `viewport` - позиция и масштаб камеры
- `mode` - режим (view/move/paint)

**Actions:**
- `addToken()`, `removeToken()`, `moveToken()`
- `setTerrain()`, `clearArea()`
- `selectToken()`, `selectHex()`

## characters.js
Управление персонажами.

**State:**
- `characters` - Map всех персонажей
- `playerCharacterId` - ID персонажа текущего игрока

**Actions:**
- `createFromWizard()` - создание из визарда
- `updateCharacter()` - обновление данных
- `applyDamage()`, `heal()` - изменение HP
- `syncFromMaster()` - синхронизация с мастера

## characterCreation.js
Процесс создания персонажа.

**State:**
- `step` - текущий шаг визарда
- `formData` - данные формы
- `constraints` - ограничения от мастера

## session.js
P2P сессия и подключения.

**State:**
- `roomId` - код комнаты
- `status` - статус подключения
- `connections` - подключённые игроки
- `peer` - PeerJS instance

**Actions:**
- `createRoom()`, `joinRoom()`
- `broadcast()` - отправка всем
- `sendTo()` - отправка конкретному

## user.js
Данные текущего пользователя.

**State:**
- `userId` - уникальный ID
- `nickname` - имя
- `avatar` - аватар
- `isMaster` - роль мастера

## sceneLog.js
Лог событий игры.

**State:**
- `entries` - массив событий
- `filters` - активные фильтры

**Actions:**
- `addEntry()` - добавить событие
- `clearLog()` - очистить лог

## terrain.js
Данные terrain для карты.

**State:**
- `terrainTypes` - типы terrain из JSON
- `currentBrush` - текущая кисть

## interaction.js
Состояние взаимодействия с картой (state machine).

**States (InteractionState):**
- `IDLE` - ничего не выбрано
- `TOKEN_SELECTED` - выбран токен
- `PATH_SHOWN` - показан путь к цели
- `DRAGGING_FACING` - драг для выбора направления (slingshot)

**State:**
- `currentState` - текущее состояние машины
- `selectedHex` - координаты целевого гекса
- `selectedFacing` - выбранное направление (0-11)
- `activePath` - путь движения
- `activeTokenId` - ID активного токена

**Actions:**
- `selectToken(tokenId)` - выбрать токен
- `showPath(path, targetHex)` - показать путь к гексу
- `startFacingDrag()` - начать выбор направления
- `updateFacing(facing)` - обновить направление
- `confirmMove()` - подтвердить ход
- `cancel()` - отменить и вернуться в IDLE

**Getters:**
- `isTokenSelected` - выбран ли токен
- `canMove` - можно ли двигаться
- `isRotateInPlace` - поворот на месте (без движения)

## fillProfile.js
Профили заполнения карты.

**State:**
- `profiles` - сохранённые профили
- `activeProfile` - активный профиль

## Персистентность

Stores используют `pinia-plugin-persistedstate`:
```javascript
{
  persist: {
    key: 'trip-characters',
    storage: localStorage
  }
}
```
