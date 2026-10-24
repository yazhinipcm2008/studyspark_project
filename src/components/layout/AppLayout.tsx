import React, { useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Home,
  BookOpen,
  Calendar,
  BarChart3,
  Bot,
  BrainCircuit,
  Layers,
  AlertTriangle,
  Bell,
  Settings,
  LogOut,
  Moon,
  Sun,
  Flame,
  Award,
  Wifi,
  WifiOff,
  RefreshCw,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  Video,
  Timer,
  GraduationCap,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { subscribeSyncStatus, SyncStatus } from '@/lib/offline/sync'
import { reminderScheduler } from '@/features/reminders/reminderScheduler'
import { calculateStreaks } from '@/lib/gamification'
import { cn } from '@/lib/utils'

// Feature color tokens mapping according to Bright Spectrum design system
const featureColorClasses: Record<string, {
  activeBg: string
  activeText: string
  activeIcon: string
  accentBar: string
  badgeBg: string
  badgeText: string
}> = {
  blue: {
    activeBg: 'bg-blue-500/12 dark:bg-blue-500/15',
    activeText: 'text-blue-600 dark:text-blue-400 font-semibold',
    activeIcon: 'text-blue-600 dark:text-blue-400',
    accentBar: 'bg-blue-500',
    badgeBg: 'bg-blue-100 dark:bg-blue-950/60',
    badgeText: 'text-blue-700 dark:text-blue-300',
  },
  pink: {
    activeBg: 'bg-pink-500/12 dark:bg-pink-500/15',
    activeText: 'text-pink-600 dark:text-pink-400 font-semibold',
    activeIcon: 'text-pink-600 dark:text-pink-400',
    accentBar: 'bg-pink-500',
    badgeBg: 'bg-pink-100 dark:bg-pink-950/60',
    badgeText: 'text-pink-700 dark:text-pink-300',
  },
  sky: {
    activeBg: 'bg-sky-500/12 dark:bg-sky-500/15',
    activeText: 'text-sky-700 dark:text-sky-300 font-semibold',
    activeIcon: 'text-sky-600 dark:text-sky-400',
    accentBar: 'bg-sky-500',
    badgeBg: 'bg-sky-100 dark:bg-sky-950/60',
    badgeText: 'text-sky-800 dark:text-sky-300',
  },
  coral: {
    activeBg: 'bg-coral-500/12 dark:bg-coral-500/15',
    activeText: 'text-rose-600 dark:text-coral-400 font-semibold',
    activeIcon: 'text-rose-500 dark:text-coral-400',
    accentBar: 'bg-coral-500',
    badgeBg: 'bg-coral-100 dark:bg-coral-950/60',
    badgeText: 'text-rose-800 dark:text-coral-400',
  },
  sun: {
    activeBg: 'bg-sun-500/12 dark:bg-sun-500/15',
    activeText: 'text-amber-700 dark:text-sun-400 font-semibold',
    activeIcon: 'text-amber-600 dark:text-sun-400',
    accentBar: 'bg-sun-500',
    badgeBg: 'bg-sun-100 dark:bg-sun-950/60',
    badgeText: 'text-amber-900 dark:text-sun-400',
  },
  mint: {
    activeBg: 'bg-mint-500/12 dark:bg-mint-500/15',
    activeText: 'text-emerald-700 dark:text-mint-400 font-semibold',
    activeIcon: 'text-emerald-600 dark:text-mint-400',
    accentBar: 'bg-mint-500',
    badgeBg: 'bg-mint-100 dark:bg-mint-950/60',
    badgeText: 'text-emerald-800 dark:text-mint-400',
  },
  violet: {
    activeBg: 'bg-violet-500/12 dark:bg-violet-500/15',
    activeText: 'text-violet-600 dark:text-violet-400 font-semibold',
    activeIcon: 'text-violet-600 dark:text-violet-400',
    accentBar: 'bg-violet-500',
    badgeBg: 'bg-violet-100 dark:bg-violet-950/60',
    badgeText: 'text-violet-700 dark:text-violet-300',
  },
}

export const AppLayout: React.FC = () => {
  const { user, profile, signOut, refreshProfile, isDarkMode, toggleTheme } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [syncState, setSyncState] = useState<{ status: SyncStatus; pendingCount: number }>({
    status: navigator.onLine ? 'online' : 'offline',
    pendingCount: 0,
  })

  const [totalPoints, setTotalPoints] = useState<number>(0)
  const [currentStreak, setCurrentStreak] = useState<number>(0)
  const [unreadRemindersCount, setUnreadRemindersCount] = useState<number>(0)

  // Subscribe to sync engine
  useEffect(() => {
    const unsub = subscribeSyncStatus((status, count) => {
      setSyncState({ status, pendingCount: count })
    })
    return unsub
  }, [])

  // Init reminder scheduler
  useEffect(() => {
    if (user) {
      reminderScheduler.init(user.id)
    }
    return () => {
      reminderScheduler.stop()
    }
  }, [user])

  // Fetch real points, streak, and reminders
  const loadUserMetrics = async () => {
    if (!user) return
    try {
      // 1. Total points
      const { data: pointsData } = await supabase
        .from('points_ledger')
        .select('points')
        .eq('user_id', user.id)

      const pts = (pointsData || []).reduce((acc, row) => acc + (row.points || 0), 0)
      setTotalPoints(pts)

      // 2. Streaks from real activity dates across sessions, tasks, quizzes, reviews
      const datesSet = new Set<string>()

      const { data: sessions } = await supabase
        .from('study_sessions')
        .select('started_at')
        .eq('user_id', user.id)
      sessions?.forEach(s => datesSet.add(s.started_at.split('T')[0]))

      const { data: tasks } = await supabase
        .from('study_tasks')
        .select('completed_at')
        .eq('user_id', user.id)
        .eq('completed', true)
        .not('completed_at', 'is', null)
      tasks?.forEach(t => t.completed_at && datesSet.add(t.completed_at.split('T')[0]))

      const { data: attempts } = await supabase
        .from('quiz_attempts')
        .select('completed_at')
        .eq('user_id', user.id)
        .eq('status', 'completed')
      attempts?.forEach(a => datesSet.add(a.completed_at.split('T')[0]))

      const { data: reviews } = await supabase
        .from('flashcard_reviews')
        .select('reviewed_at')
        .eq('user_id', user.id)
      reviews?.forEach(r => datesSet.add(r.reviewed_at.split('T')[0]))

      const streakResult = calculateStreaks(datesSet, profile?.timezone || 'UTC')
      setCurrentStreak(streakResult.currentStreak)

      // 3. Unread / upcoming reminders count
      const { count } = await supabase
        .from('reminders')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('enabled', true)
        .is('delivered_at', null)

      setUnreadRemindersCount(count || 0)
    } catch (err) {
      console.error('Error fetching user metrics:', err)
    }
  }

  useEffect(() => {
    loadUserMetrics()
  }, [user, location.pathname])

  const navItems = [
    { name: 'Home', path: '/dashboard', icon: Home, color: 'blue' },
    { name: 'Study Rooms', path: '/study-room', icon: Video, badge: 'Live', color: 'pink' },
    { name: 'Study Materials', path: '/materials', icon: BookOpen, color: 'sky' },
    { name: 'Focus Timer', path: '/focus', icon: Timer, badge: 'Pomodoro', color: 'coral' },
    { name: 'Quizzes', path: '/quizzes', icon: BrainCircuit, color: 'blue' },
    { name: 'Exam Mode', path: '/exam', icon: GraduationCap, badge: 'Simulation', color: 'sun' },
    { name: 'Flashcards', path: '/flashcards', icon: Layers, color: 'coral' },
    { name: 'Study Planner', path: '/planner', icon: Calendar, color: 'mint' },
    { name: 'Weak Topics', path: '/weak-topics', icon: AlertTriangle, color: 'coral' },
    { name: 'Progress Analytics', path: '/analytics', icon: BarChart3, color: 'mint' },
    { name: 'AI Assistant', path: '/assistant', icon: Bot, color: 'violet' },
    { name: 'Reminders', path: '/reminders', icon: Bell, badge: unreadRemindersCount, color: 'sun' },
    { name: 'Settings', path: '/settings', icon: Settings, color: 'blue' },
  ]

  const mobileTabs = [
    { name: 'Home', path: '/dashboard', icon: Home, color: 'blue' },
    { name: 'Study', path: '/materials', icon: BookOpen, color: 'sky' },
    { name: 'Planner', path: '/planner', icon: Calendar, color: 'mint' },
    { name: 'Progress', path: '/analytics', icon: BarChart3, color: 'mint' },
    { name: 'Assistant', path: '/assistant', icon: Bot, color: 'violet' },
  ]

  return (
    <div className="flex h-screen w-full bg-neutral-bg dark:bg-ink-950 text-ink dark:text-white overflow-hidden font-sans">
      {/* DESKTOP SIDEBAR */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-neutral-border dark:border-ink-800 bg-white dark:bg-ink-900 transition-all duration-300 z-30 select-none',
          isSidebarCollapsed ? 'w-20' : 'w-64'
        )}
      >
        {/* Logo and Collapse Toggle */}
        <div className="flex items-center justify-between p-4 h-16 border-b border-neutral-border dark:border-ink-800">
          <div className="flex items-center gap-3 overflow-hidden cursor-pointer" onClick={() => navigate('/dashboard')}>
            {/* Logo: Solid blue rounded square with a small sun-colored spark */}
            <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-blue-600 flex items-center justify-center text-white relative shadow-sm">
              <span className="font-extrabold text-lg text-white">S</span>
              <Sparkles className="h-3 w-3 text-sun fill-sun absolute -top-1 -right-1" />
            </div>
            {!isSidebarCollapsed && (
              <div className="flex flex-col leading-tight">
                <span className="font-semibold text-base tracking-tight text-ink dark:text-white">
                  StudySpark
                </span>
                <span className="text-[10px] text-neutral-muted uppercase tracking-wider font-semibold">
                  AI Study Companion
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-1.5 rounded-lg text-neutral-muted hover:text-ink dark:hover:text-white hover:bg-neutral-bg dark:hover:bg-ink-800 transition-colors"
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* User Stats Pills in Sidebar (Sun colored for streak and points) */}
        {!isSidebarCollapsed && (
          <div className="p-3 mx-3 my-2 rounded-2xl bg-neutral-bg dark:bg-ink-950 border border-neutral-border dark:border-ink-800 flex items-center justify-between">
            {/* Streak */}
            <div className="flex items-center gap-2" title={`${currentStreak} day study streak`}>
              <div className="h-7 w-7 rounded-xl bg-sun-100 dark:bg-sun-950/60 text-amber-700 dark:text-sun-400 flex items-center justify-center shadow-sm">
                <Flame className="h-4 w-4" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-ink dark:text-white">{currentStreak}d</p>
                <p className="text-[10px] text-neutral-muted uppercase">Streak</p>
              </div>
            </div>

            <div className="h-6 w-[1px] bg-neutral-border dark:border-ink-800" />

            {/* Points */}
            <div className="flex items-center gap-2" title={`${totalPoints} total points earned`}>
              <div className="h-7 w-7 rounded-xl bg-sun-100 dark:bg-sun-950/60 text-amber-700 dark:text-sun-400 flex items-center justify-center shadow-sm">
                <Award className="h-4 w-4" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-ink dark:text-white">{totalPoints}</p>
                <p className="text-[10px] text-neutral-muted uppercase">Points</p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Links: Soft 12% tint of feature color, colored icon & 3px left accent bar */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon
            const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path))
            const style = featureColorClasses[item.color] || featureColorClasses.blue

            return (
              <NavLink
                key={item.path}
                to={item.path}
                title={isSidebarCollapsed ? item.name : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all group relative font-medium',
                  isActive
                    ? cn(style.activeBg, style.activeText)
                    : 'text-neutral-muted hover:text-ink dark:hover:text-white hover:bg-neutral-bg dark:hover:bg-ink-800'
                )}
              >
                {/* 3px Left Accent Bar */}
                {isActive && (
                  <span className={cn('absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full', style.accentBar)} />
                )}
                <Icon
                  className={cn(
                    'h-5 w-5 flex-shrink-0 transition-colors',
                    isActive ? style.activeIcon : 'text-neutral-muted group-hover:text-ink dark:group-hover:text-white'
                  )}
                />
                {!isSidebarCollapsed && (
                  <span className="truncate flex-1">{item.name}</span>
                )}
                {!isSidebarCollapsed && Boolean(item.badge) && (
                  <span className={cn(
                    'px-1.5 py-0.5 text-[10px] font-bold rounded-full',
                    style.badgeBg,
                    style.badgeText
                  )}>
                    {item.badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Bottom Profile and Controls */}
        <div className="p-3 border-t border-neutral-border dark:border-ink-800 space-y-2">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-neutral-muted hover:text-ink dark:hover:text-white hover:bg-neutral-bg dark:hover:bg-ink-800 transition-colors',
              isSidebarCollapsed && 'justify-center'
            )}
            title="Toggle Dark/Light Mode"
          >
            {isDarkMode ? <Sun className="h-4 w-4 text-sun" /> : <Moon className="h-4 w-4 text-blue-600" />}
            {!isSidebarCollapsed && <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>

          {/* User Profile */}
          <div className="flex items-center justify-between pt-1">
            <div
              className={cn(
                'flex items-center gap-2.5 overflow-hidden cursor-pointer flex-1',
                isSidebarCollapsed && 'justify-center'
              )}
              onClick={() => navigate('/settings')}
              title="Open Settings"
            >
              <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-xs uppercase flex-shrink-0">
                {profile?.full_name ? profile.full_name.charAt(0) : <User className="h-4 w-4" />}
              </div>
              {!isSidebarCollapsed && (
                <div className="truncate text-left leading-tight">
                  <p className="text-xs font-bold text-ink dark:text-white truncate">
                    {profile?.full_name || user?.email?.split('@')[0] || 'Student'}
                  </p>
                  <p className="text-[10px] text-neutral-muted truncate">
                    {profile?.university || user?.email}
                  </p>
                </div>
              )}
            </div>

            {!isSidebarCollapsed && (
              <button
                onClick={signOut}
                className="p-1.5 rounded-lg text-neutral-muted hover:text-coral hover:bg-coral-50 dark:hover:bg-coral-950/40 transition-colors"
                title="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b border-neutral-border dark:border-ink-800 bg-white/80 dark:bg-ink-900/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between z-20 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-neutral-muted hover:text-ink dark:hover:text-white hover:bg-neutral-bg dark:hover:bg-ink-800"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {/* Mobile Header Logo */}
            <div className="flex items-center gap-2 md:hidden">
              <div className="h-8 w-8 rounded-xl bg-blue-600 flex items-center justify-center text-white relative shadow-sm">
                <span className="font-extrabold text-sm text-white">S</span>
                <Sparkles className="h-2.5 w-2.5 text-sun fill-sun absolute -top-0.5 -right-0.5" />
              </div>
              <span className="font-semibold text-base text-ink dark:text-white">
                StudySpark
              </span>
            </div>
          </div>

          {/* Right: Sync Status + Reminders + Profile */}
          <div className="flex items-center gap-3">
            {/* Sync Badge */}
            <div
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all',
                syncState.status === 'online' && 'bg-mint-50 dark:bg-mint-950/40 text-emerald-800 dark:text-mint-400 border-mint-200 dark:border-mint-800',
                syncState.status === 'syncing' && 'bg-sun-50 dark:bg-sun-950/40 text-amber-800 dark:text-sun-400 border-sun-200 dark:border-sun-800',
                syncState.status === 'offline' && 'bg-coral-50 dark:bg-coral-950 text-rose-800 dark:text-coral-400 border-coral-200'
              )}
              title={
                syncState.status === 'offline'
                  ? 'Working offline. Changes are saved locally in IndexedDB and will sync when reconnected.'
                  : syncState.status === 'syncing'
                  ? `Syncing ${syncState.pendingCount} local updates to cloud...`
                  : 'Up to date with cloud'
              }
            >
              {syncState.status === 'online' && <Wifi className="h-3.5 w-3.5 text-mint-600" />}
              {syncState.status === 'syncing' && <RefreshCw className="h-3.5 w-3.5 text-sun-600 animate-spin" />}
              {syncState.status === 'offline' && <WifiOff className="h-3.5 w-3.5 text-coral-600" />}
              <span className="hidden sm:inline capitalize">
                {syncState.status === 'syncing' ? `Syncing (${syncState.pendingCount})` : syncState.status}
              </span>
            </div>

            {/* Streak Chip (Visible on mobile header) */}
            <div
              className="md:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-streak text-ink-navy text-xs font-bold shadow-sm"
              title={`${currentStreak} day study streak`}
            >
              <Flame className="h-3.5 w-3.5 text-coral-600" />
              <span>{currentStreak}d</span>
            </div>

            {/* Notifications / Reminders Bell */}
            <button
              onClick={() => navigate('/reminders')}
              className="relative p-2 rounded-xl text-neutral-muted hover:text-ink dark:hover:text-white hover:bg-neutral-bg dark:hover:bg-ink-800 transition-colors"
              title="Reminders"
            >
              <Bell className="h-5 w-5" />
              {unreadRemindersCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-sun animate-pulse" />
              )}
            </button>

            {/* Mobile Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="md:hidden p-2 rounded-xl text-neutral-muted hover:text-ink dark:hover:text-white hover:bg-neutral-bg dark:hover:bg-ink-800"
              title="Toggle theme"
            >
              {isDarkMode ? <Sun className="h-4 w-4 text-sun" /> : <Moon className="h-4 w-4 text-blue-600" />}
            </button>
          </div>
        </header>

        {/* Mobile Full Sidebar Drawer Overlay */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            <div className="fixed inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
            <div className="relative w-72 bg-white dark:bg-ink-900 h-full flex flex-col p-4 shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-neutral-border dark:border-ink-800">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-blue-600 flex items-center justify-center text-white relative shadow-sm">
                    <span className="font-extrabold text-sm text-white">S</span>
                    <Sparkles className="h-2.5 w-2.5 text-sun fill-sun absolute -top-0.5 -right-0.5" />
                  </div>
                  <span className="font-semibold text-base text-ink dark:text-white">
                    StudySpark
                  </span>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-neutral-muted hover:bg-neutral-bg"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-3 space-y-1">
                {navItems.map(item => {
                  const Icon = item.icon
                  const isActive = location.pathname === item.path
                  const style = featureColorClasses[item.color] || featureColorClasses.blue
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                        isActive
                          ? cn(style.activeBg, style.activeText)
                          : 'text-neutral-muted hover:text-ink dark:hover:text-white hover:bg-neutral-bg dark:hover:bg-ink-800'
                      )}
                    >
                      <Icon className={cn('h-5 w-5', isActive ? style.activeIcon : 'text-neutral-muted')} />
                      <span>{item.name}</span>
                    </NavLink>
                  )
                })}
              </div>

              <div className="pt-3 border-t border-neutral-border dark:border-ink-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-xs uppercase">
                    {profile?.full_name ? profile.full_name.charAt(0) : 'S'}
                  </div>
                  <div className="text-xs truncate">
                    <p className="font-bold truncate text-ink dark:text-white">{profile?.full_name || 'Student'}</p>
                    <p className="text-neutral-muted truncate text-[10px]">{user?.email}</p>
                  </div>
                </div>
                <button onClick={signOut} className="p-2 text-coral hover:bg-coral-50 dark:hover:bg-coral-950/40 rounded-lg">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PAGE CONTENT CONTAINER */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
          <Outlet />
        </main>

        {/* MOBILE BOTTOM TAB BAR (< 768px) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 dark:bg-ink-900/95 backdrop-blur-md border-t border-neutral-border dark:border-ink-800 flex items-center justify-around px-2 z-30 shadow-lg">
          {mobileTabs.map(tab => {
            const Icon = tab.icon
            const isActive = location.pathname === tab.path || (tab.path !== '/dashboard' && location.pathname.startsWith(tab.path))
            const style = featureColorClasses[tab.color] || featureColorClasses.blue
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={cn(
                  'flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition-all',
                  isActive
                    ? cn(style.activeBg, style.activeText, 'scale-105')
                    : 'text-neutral-muted hover:text-ink dark:hover:text-neutral-200'
                )}
              >
                <Icon className={cn('h-5 w-5', isActive ? style.activeIcon : '')} />
                <span className={cn('text-[10px] mt-0.5', isActive ? style.activeText : '')}>{tab.name}</span>
              </NavLink>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
