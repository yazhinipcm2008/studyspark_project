import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (newPassword.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.')
      return
    }

    setIsLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) {
        throw error
      }

      toast.success('Your password has been updated successfully!')
      navigate('/dashboard')
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update password. Your reset link may have expired.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-bg dark:bg-ink-950 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl">Set New Password</CardTitle>
          <CardDescription>
            Enter and confirm your new secure password below.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            {errorMsg && (
              <div className="p-3 text-xs text-destructive bg-destructive-50 dark:bg-destructive/10 rounded-xl border border-destructive/20">
                {errorMsg}
              </div>
            )}

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
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              variant="signature"
              className="w-full mt-2"
              isLoading={isLoading}
            >
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
