import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { KeyRound, LogIn, Mail, Sparkles } from 'lucide-react'

export const LoginPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState<'signin' | 'change_password'>('signin')

  // Sign In state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Change Password state
  const [changeEmail, setChangeEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [changeSuccessMsg, setChangeSuccessMsg] = useState<string | null>(null)

  const from = (location.state as any)?.from?.pathname || '/dashboard'

  // Handle standard student sign in
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setIsLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        throw error
      }

      if (data.session) {
        toast.success('Welcome back to StudySpark!')
        navigate(from, { replace: true })
      }
    } catch (err: any) {
      if (err.message === 'Failed to fetch') {
        setErrorMsg('Connection error. Please refresh your browser (Ctrl + Shift + R).')
      } else {
        setErrorMsg(err.message || 'Invalid email or password.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Handle direct web password update
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setChangeSuccessMsg(null)

    if (newPassword.length < 8) {
      setErrorMsg('New password must be at least 8 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('New passwords do not match.')
      return
    }

    setIsChangingPassword(true)

    try {
      // 1. Authenticate with current credentials
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: changeEmail,
        password: currentPassword,
      })

      if (signInErr || !signInData.session) {
        throw new Error('Current email or password is incorrect. Please check your credentials.')
      }

      // 2. Update to new password for this account
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (updateErr) throw updateErr

      setChangeSuccessMsg('Your StudySpark password has been successfully updated! You can now sign in with your new password.')
      toast.success('Password updated successfully!')

      // Pre-fill email and switch back to sign-in tab
      setEmail(changeEmail)
      setPassword('')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update password. Please verify your current credentials.')
    } finally {
      setIsChangingPassword(false)
    }
  }

  // Handle 1-click email reset link
  const handleSendResetEmail = async () => {
    if (!changeEmail && !email) {
      setErrorMsg('Please enter your account email address first.')
      return
    }

    const targetEmail = changeEmail || email
    setErrorMsg(null)
    setIsChangingPassword(true)

    try {
      const redirectUrl = `${window.location.origin}/reset-password`
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: redirectUrl,
      })

      if (error) throw error

      setChangeSuccessMsg(`Password reset link sent to ${targetEmail}! Check your inbox.`)
      toast.success('Reset email sent!')
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send password reset email.')
    } finally {
      setIsChangingPassword(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-bg dark:bg-ink-950 flex items-center justify-center p-4">
      <Card className="max-w-md w-full shadow-card">
        <CardHeader className="text-center pb-2">
          <div className="h-10 w-10 rounded-2xl bg-blue flex items-center justify-center text-white mx-auto shadow-card mb-2">
            <Sparkles className="h-5 w-5 text-sun fill-sun" />
          </div>

          <CardTitle className="text-2xl">
            {activeTab === 'signin' ? 'Welcome Back' : 'Change Password'}
          </CardTitle>
          <CardDescription>
            {activeTab === 'signin'
              ? 'Enter your credentials to continue your study sessions.'
              : 'Update your StudySpark account password directly on this web app.'}
          </CardDescription>

          {/* Tab Switcher */}
          <div className="flex rounded-xl bg-neutral-bg dark:bg-ink-900 p-1 border border-neutral-border dark:border-ink-800 mt-3">
            <button
              type="button"
              onClick={() => {
                setActiveTab('signin')
                setErrorMsg(null)
                setChangeSuccessMsg(null)
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'signin'
                  ? 'bg-white dark:bg-ink-800 text-blue shadow-sm'
                  : 'text-neutral-muted hover:text-ink dark:hover:text-white'
              }`}
            >
              <LogIn className="h-3.5 w-3.5" /> Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('change_password')
                setErrorMsg(null)
                setChangeSuccessMsg(null)
                if (email && !changeEmail) setChangeEmail(email)
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'change_password'
                  ? 'bg-white dark:bg-ink-800 text-blue shadow-sm'
                  : 'text-neutral-muted hover:text-ink dark:hover:text-white'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" /> Change Password
            </button>
          </div>
        </CardHeader>

        <CardContent className="pt-2">
          {errorMsg && (
            <div className="p-3 text-xs text-destructive bg-destructive-50 dark:bg-destructive/10 rounded-xl border border-destructive/20 mb-4">
              {errorMsg}
            </div>
          )}

          {changeSuccessMsg && (
            <div className="p-3 text-xs text-mint bg-mint/10 dark:bg-mint/20 rounded-xl border border-mint/30 mb-4">
              {changeSuccessMsg}
            </div>
          )}

          {activeTab === 'signin' ? (
            /* Sign In Form */
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                  Email Address
                </label>
                <Input
                  type="email"
                  required
                  placeholder="student@university.edu"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-ink dark:text-neutral-200">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setChangeEmail(email)
                      setActiveTab('change_password')
                    }}
                    className="text-[11px] text-blue hover:underline font-medium"
                  >
                    Change / Forgot password?
                  </button>
                </div>
                <Input
                  type="password"
                  required
                  placeholder="Your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                variant="blue"
                className="w-full mt-2"
                isLoading={isLoading}
              >
                Sign In
              </Button>
            </form>
          ) : (
            /* Change Password Form */
            <form onSubmit={handleChangePassword} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                  Account Email
                </label>
                <Input
                  type="email"
                  required
                  placeholder="student@university.edu"
                  value={changeEmail}
                  onChange={e => setChangeEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                  Current Password
                </label>
                <Input
                  type="password"
                  required
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                  New Password
                </label>
                <Input
                  type="password"
                  required
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                  Confirm New Password
                </label>
                <Input
                  type="password"
                  required
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                variant="blue"
                className="w-full mt-1"
                isLoading={isChangingPassword}
              >
                Update Password
              </Button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={handleSendResetEmail}
                  className="text-xs text-neutral-muted hover:text-blue transition-colors flex items-center justify-center gap-1 mx-auto"
                >
                  <Mail className="h-3.5 w-3.5" /> Don't know old password? Send reset link to email
                </button>
              </div>
            </form>
          )}
        </CardContent>

        <CardFooter className="justify-center border-t border-neutral-border dark:border-ink-800 text-xs text-neutral-muted pt-4">
          {activeTab === 'signin' ? (
            <>
              Don't have an account?{' '}
              <Link to="/signup" className="ml-1 text-blue font-bold hover:underline">
                Sign Up
              </Link>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setActiveTab('signin')}
              className="text-blue font-bold hover:underline"
            >
              ← Back to Sign In
            </button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
