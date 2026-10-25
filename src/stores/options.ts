import { create } from 'zustand'
import { client, errorText } from '@/api/rpc'
import type { GlobalOptions } from '@/types/aria2'

interface OptionsState {
  globalOptions: GlobalOptions
  loading: boolean
  lastError: string | null
  loadGlobal: () => Promise<void>
  saveGlobal: (options: Record<string, string | undefined>) => Promise<boolean>
  saveSession: () => Promise<boolean>
  disconnect: () => Promise<boolean>
  /** Apply one global option immediately, without a full reload */
  changeGlobalOption: (key: string, value: string) => Promise<boolean>
}

export const useOptions = create<OptionsState>((set, get) => ({
  globalOptions: {},
  loading: false,
  lastError: null,

  loadGlobal: async () => {
    set({ loading: true })
    try {
      set({ globalOptions: (await client.call<GlobalOptions>('getGlobalOption')) ?? {} })
    } catch (e) {
      set({ lastError: errorText(e) })
    } finally {
      set({ loading: false })
    }
  },

  saveGlobal: async (options) => {
    const payload: Record<string, string> = {}
    for (const [k, v] of Object.entries(options)) {
      if (v !== undefined) payload[k] = v
    }
    try {
      await client.call('changeGlobalOption', [payload])
      await get().loadGlobal()
      return true
    } catch (e) {
      set({ lastError: errorText(e) })
      return false
    }
  },

  disconnect: async () => {
    try {
      await client.call('shutdown')
      return true
    } catch (e) {
      set({ lastError: errorText(e) })
      return false
    }
  },

  saveSession: async () => {
    try {
      await client.call('saveSession')
      return true
    } catch (e) {
      set({ lastError: errorText(e) })
      return false
    }
  },

  changeGlobalOption: async (key, value) => {
    try {
      // aria2.changeGlobalOption takes a single struct param: { key: value }
      await client.call('changeGlobalOption', [{ [key]: value }])
      set((s) => ({ globalOptions: { ...s.globalOptions, [key]: value } }))
      return true
    } catch (e) {
      set({ lastError: errorText(e) })
      return false
    }
  },
}))
