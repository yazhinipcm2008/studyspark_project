import React, { useState, useEffect } from 'react'
import {
  User,
  Settings as SettingsIcon,
  ShieldAlert,
  Moon,
  Sun,
  KeyRound,
  Trash2,
  CheckCircle2,
  Bell,
  Clock,
  Sparkles,
  Laptop,
  Palette,
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export const SettingsPage: React.FC = () => {
  const { user, profile, refreshProfile, signOut, themePreference, setThemePreference } = useAuth()

  // Profile fields
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [university, setUniversity] = useState(profile?.university || '')
  const [course, setCourse] = useState(profile?.course || '')
  const [timezone, setTimezone] = useState(profile?.timezone || 'UTC')
  const [weeklyGoalMinutes, setWeeklyGoalMinutes] = useState(profile?.weekly_goal_minutes || 720)
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)

  // Delete account confirmation
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('')
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)

  const handleThemeChange = async (newPref: 'system' | 'light' | 'dark') => {
    try {
      await setThemePreference(newPref)
      const label =
        newPref === 'system'
          ? 'System Default'
          : newPref === 'dark'
          ? 'Dark Mode'
          : 'Light Mode'
      toast.success(`Theme preference set to ${label}`)
    } catch (err: any) {
      toast.error('Failed to save theme preference')
    }
  }

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '')
      setUniversity(profile.university || '')
      setCourse(profile.course || '')
      setTimezone(profile.timezone || 'UTC')
      setWeeklyGoalMinutes(profile.weekly_goal_minutes || 720)
    }
  }, [profile])

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setIsUpdatingProfile(true)

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          university: university.trim() || null,
          course: course.trim() || null,
          timezone,
          weekly_goal_minutes: Number(weeklyGoalMinutes),
        })
        .eq('id', user.id)

      if (error) throw error

      await refreshProfile()
      toast.success('Profile updated successfully!')
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile')
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmationText !== 'DELETE') {
      toast.error('Please type DELETE to confirm.')
      return
    }

    setIsDeletingAccount(true)
    try {
      // Delete user materials and records
      await supabase.from('materials').delete().eq('user_id', user!.id)
      await supabase.from('quizzes').delete().eq('user_id', user!.id)
      await supabase.from('flashcard_sets').delete().eq('user_id', user!.id)
      await supabase.from('study_plans').delete().eq('user_id', user!.id)
      await supabase.from('profiles').delete().eq('id', user!.id)

      toast.success('All user data deleted')
      await signOut()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete account')
    } finally {
      setIsDeletingAccount(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink dark:text-white">
          Settings & Account
        </h1>
        <p className="text-sm text-neutral-muted dark:text-neutral-300 mt-1">
          Manage your personal details, study goals, credentials, and app preferences.
        </p>
      </div>

      {/* Profile Details Form */}
      <Card>
        <CardHeader>
          <CardTitle>Profile & University Information</CardTitle>
          <CardDescription>Your name and timezone are used for greetings and streak tracking.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold block mb-1">Full Name</label>
                <Input
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">Email Address</label>
                <Input value={user?.email || ''} disabled className="opacity-70 cursor-not-allowed" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold block mb-1">University / College</label>
                <Input
                  value={university}
                  onChange={e => setUniversity(e.target.value)}
                  placeholder="e.g. Stanford University"
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">Course / Major</label>
                <Input
                  value={course}
                  onChange={e => setCourse(e.target.value)}
                  placeholder="e.g. Computer Science"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold block mb-1">Weekly Study Goal (Hours)</label>
                <Input
                  type="number"
                  min={1}
                  max={80}
                  value={Math.round(weeklyGoalMinutes / 60)}
                  onChange={e => setWeeklyGoalMinutes(Number(e.target.value) * 60)}
                />
                <span className="text-[11px] text-neutral-muted mt-0.5 block">
                  Target: {weeklyGoalMinutes} minutes per week
                </span>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">Timezone</label>
                <Input
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                  placeholder="e.g. America/New_York or UTC"
                />
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" variant="blue" size="sm" isLoading={isUpdatingProfile}>
                Save Profile Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Appearance & Theme */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-blue" />
            <CardTitle>Appearance & Theme</CardTitle>
          </div>
          <CardDescription>
            Choose your preferred color theme. Dark mode follows your system setting by default, with this manual toggle saved per user.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* System Default */}
            <button
              type="button"
              onClick={() => handleThemeChange('system')}
              className={cn(
                'flex flex-col items-start p-4 rounded-2xl border text-left transition-all relative',
                themePreference === 'system'
                  ? 'border-blue ring-2 ring-blue/20 bg-blue/10 dark:bg-surface-elevated'
                  : 'border-neutral-border dark:border-ink-700 hover:border-neutral-muted dark:hover:border-ink-600 bg-white dark:bg-ink-900'
              )}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <div className="p-2 rounded-xl bg-neutral-bg dark:bg-ink-950 text-neutral-muted">
                  <Laptop className="h-5 w-5" />
                </div>
                {themePreference === 'system' && (
                  <CheckCircle2 className="h-4 w-4 text-blue" />
                )}
              </div>
              <p className="text-sm font-bold text-ink dark:text-white">System Default</p>
              <p className="text-[11px] text-neutral-muted mt-0.5">
                Automatically adapts to your device's light or dark mode setting.
              </p>
            </button>

            {/* Light Mode */}
            <button
              type="button"
              onClick={() => handleThemeChange('light')}
              className={cn(
                'flex flex-col items-start p-4 rounded-2xl border text-left transition-all relative',
                themePreference === 'light'
                  ? 'border-blue ring-2 ring-blue/20 bg-blue/10 dark:bg-surface-elevated'
                  : 'border-neutral-border dark:border-ink-700 hover:border-neutral-muted dark:hover:border-ink-600 bg-white dark:bg-ink-900'
              )}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <div className="p-2 rounded-xl bg-sun/15 text-sun">
                  <Sun className="h-5 w-5" />
                </div>
                {themePreference === 'light' && (
                  <CheckCircle2 className="h-4 w-4 text-blue" />
                )}
              </div>
              <p className="text-sm font-bold text-ink dark:text-white">Light Mode</p>
              <p className="text-[11px] text-neutral-muted mt-0.5">
                Crisp, clean light surfaces with high-contrast text and vibrant accents.
              </p>
            </button>

            {/* Dark Mode */}
            <button
              type="button"
              onClick={() => handleThemeChange('dark')}
              className={cn(
                'flex flex-col items-start p-4 rounded-2xl border text-left transition-all relative',
                themePreference === 'dark'
                  ? 'border-blue ring-2 ring-blue/20 bg-blue/10 dark:bg-surface-elevated'
                  : 'border-neutral-border dark:border-ink-700 hover:border-neutral-muted dark:hover:border-ink-600 bg-white dark:bg-ink-900'
              )}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <div className="p-2 rounded-xl bg-surface-elevated text-blue border border-neutral-border dark:border-ink-700">
                  <Moon className="h-5 w-5" />
                </div>
                {themePreference === 'dark' && (
                  <CheckCircle2 className="h-4 w-4 text-blue" />
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-ink dark:text-white">Dark Mode</p>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue/20 text-blue uppercase">
                  Dark
                </span>
              </div>
              <p className="text-[11px] text-neutral-muted mt-0.5">
                Deep #0E1426 background, #161E36 surface, vibrant Spectrum accents with WCAG AA contrast.
              </p>
            </button>
          </div>
          <p className="text-[11px] text-neutral-muted mt-3">
            * Selected preference is saved to your account profile and applies across all your devices.
          </p>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Permanently delete your account and all study records.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-neutral-muted mb-4">
            Once deleted, all uploaded materials, generated quizzes, flashcards, study plans, and topic analytics will be wiped permanently from the database.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDeleteModalOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete All My Data & Account
          </Button>
        </CardContent>
      </Card>

      {/* Confirm Deletion Dialog */}
      <Dialog
        open={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirm Irreversible Deletion"
        description="Type 'DELETE' in all capital letters below to confirm the permanent removal of your account and all associated study materials."
        confirmText="Permanently Erase Everything"
        confirmVariant="destructive"
        onConfirm={handleDeleteAccount}
        isConfirmLoading={isDeletingAccount}
      >
        <div className="space-y-3">
          <Input
            value={deleteConfirmationText}
            onChange={e => setDeleteConfirmationText(e.target.value)}
            placeholder="Type DELETE to confirm"
            className="border-destructive"
          />
        </div>
      </Dialog>
    </div>
  )
}
