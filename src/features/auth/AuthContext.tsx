import React, { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase, checkSupabaseConfig } from '@/lib/supabase'
import type { Profile } from '@/types/database'
import { clearOfflineCache } from '@/lib/offline/db'

export type ThemePreference = 'system' | 'light' | 'dark'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: Profile | null
  isLoading: boolean
  isConfigured: boolean
  missingConfig: string[]
  themePreference: ThemePreference
  isDarkMode: boolean
  setThemePreference: (theme: ThemePreference) => Promise<void>
  toggleTheme: () => Promise<void>
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  isConfigured: false,
  missingConfig: [],
  themePreference: 'system',
  isDarkMode: false,
  setThemePreference: async () => {},
  toggleTheme: async () => {},
  refreshProfile: async () => {},
  signOut: async () => {},
})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => {
    return (localStorage.getItem('theme_preference') as ThemePreference) || 'system'
  })
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme_preference')
    if (saved === 'dark') return true
    if (saved === 'light') return false
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const configStatus = checkSupabaseConfig()

  // Apply theme to DOM
  const applyTheme = (pref: ThemePreference) => {
    let isDark = false
    if (pref === 'dark') {
      isDark = true
    } else if (pref === 'light') {
      isDark = false
    } else {
      // System default
      isDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    }

    setIsDarkMode(isDark)
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const setThemePreference = async (newPref: ThemePreference) => {
    setThemePreferenceState(newPref)
    localStorage.setItem('theme_preference', newPref)
    applyTheme(newPref)

    if (user) {
      const dbThemeValue = newPref === 'dark' ? 'dark' : (newPref === 'light' ? 'light' : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
      try {
        await supabase
          .from('profiles')
          .update({ theme: dbThemeValue })
          .eq('id', user.id)
      } catch (e) {
        console.warn('Could not persist theme to profile:', e)
      }
    }
  }

  const toggleTheme = async () => {
    const nextPref: ThemePreference = isDarkMode ? 'light' : 'dark'
    await setThemePreference(nextPref)
  }

  // Listen to system changes if in 'system' mode
  useEffect(() => {
    applyTheme(themePreference)

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      const currentPref = (localStorage.getItem('theme_preference') as ThemePreference) || 'system'
      if (currentPref === 'system') {
        applyTheme('system')
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [themePreference])

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (!error && data) {
        setProfile(data as Profile)
        // If user already saved a theme preference in their profile
        if (data.theme === 'dark' || data.theme === 'light') {
          setThemePreferenceState(data.theme)
          localStorage.setItem('theme_preference', data.theme)
          applyTheme(data.theme)
        }
      } else {
        setProfile({
          id: userId,
          full_name: user?.user_metadata?.full_name || null,
          avatar_url: null,
          university: null,
          course: null,
          weekly_goal_minutes: 720,
          daily_goal_minutes: 120,
          theme: 'light',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error('Error fetching profile:', err)
    }
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id)
    }
  }

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
    } catch (e) {
      console.error('SignOut error:', e)
    } finally {
      await clearOfflineCache()
      setUser(null)
      setSession(null)
      setProfile(null)
    }
  }

  useEffect(() => {
    if (!configStatus.isConfigured) {
      setIsLoading(false)
      return
    }

    let mounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => {
          if (mounted) setIsLoading(false)
        })
      } else {
        setIsLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }
      setIsLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [configStatus.isConfigured])

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isLoading,
        isConfigured: configStatus.isConfigured,
        missingConfig: configStatus.missingItems,
        themePreference,
        isDarkMode,
        setThemePreference,
        toggleTheme,
        refreshProfile,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
