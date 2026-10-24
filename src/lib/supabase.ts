import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export interface ConfigStatus {
  hasUrl: boolean
  hasAnonKey: boolean
  isConfigured: boolean
  missingItems: string[]
}

export function checkSupabaseConfig(): ConfigStatus {
  const missing: string[] = []
  const hasUrl = Boolean(supabaseUrl && supabaseUrl.trim() !== '' && supabaseUrl.startsWith('http'))
  const hasAnonKey = Boolean(supabaseAnonKey && supabaseAnonKey.trim() !== '')

  if (!hasUrl) missing.push('VITE_SUPABASE_URL')
  if (!hasAnonKey) missing.push('VITE_SUPABASE_ANON_KEY')

  return {
    hasUrl,
    hasAnonKey,
    isConfigured: missing.length === 0,
    missingItems: missing,
  }
}

// Create single Supabase client (fallback to placeholder URL so app won't crash on boot before setup screen displays)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
    },
  }
)
