import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useSessionStore } from '../session'

describe('session store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllTimers()
  })

  it('starts idle without role', () => {
    const store = useSessionStore()
    expect(store.status).toBe('idle')
    expect(store.role).toBeNull()
    expect(store.reconnectAttempts).toBe(0)
  })

  it('switches roles properly', () => {
    const store = useSessionStore()
    store.setRole('master')
    expect(store.role).toBe('master')
    store.setRole('player')
    expect(store.role).toBe('player')
  })

  it('clears reconnect timer on disconnect', () => {
    const store = useSessionStore()
    store.reconnectTimer = setTimeout(() => {}, 1000)
    const timerId = store.reconnectTimer
    
    store.disconnect()
    
    expect(store.reconnectTimer).toBeNull()
    expect(store.reconnectAttempts).toBe(0)
  })

  it('schedules reconnect with exponential backoff', () => {
    vi.useFakeTimers()
    const store = useSessionStore()
    store.role = 'player'
    store.roomId = 'TEST123'
    
    const joinSpy = vi.spyOn(store, 'joinRoom')
    
    store.scheduleReconnect()
    expect(store.reconnectAttempts).toBe(1)
    
    vi.advanceTimersByTime(1000)
    expect(joinSpy).toHaveBeenCalledWith('TEST123')
    
    vi.useRealTimers()
  })
})
