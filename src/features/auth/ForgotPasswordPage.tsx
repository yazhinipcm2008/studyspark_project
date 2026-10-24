import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { MailCheck } from 'lucide-react'

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setIsLoading(true)

    try {
      const redirectUrl = `${window.location.origin}/reset-password`
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      })

      if (error) {
        throw error
      }

      setIsSubmitted(true)
      toast.success('Password reset email sent!')
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send password reset email.')
    } finally {
      setIsLoading(false)
    }
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-neutral-bg dark:bg-ink-950 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center p-6">
          <div className="h-12 w-12 rounded-2xl bg-cool-100 text-cool-600 mx-auto flex items-center justify-center mb-4">
            <MailCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">Check your email</CardTitle>
          <CardDescription className="mt-2 text-sm">
            We sent a password reset link to <strong>{email}</strong>. Open the link to set a new password.
          </CardDescription>
          <Button variant="outline" className="mt-6 w-full" onClick={() => setIsSubmitted(false)}>
            Resend Email
          </Button>
          <div className="mt-4">
            <Link to="/login" className="text-xs text-primary font-bold hover:underline">
              Back to Sign In
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-bg dark:bg-ink-950 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl">Reset Password</CardTitle>
          <CardDescription>
            Enter your email and we will send you a secure link to reset your account password.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleResetRequest} className="space-y-4">
            {errorMsg && (
              <div className="p-3 text-xs text-destructive bg-destructive-50 dark:bg-destructive/10 rounded-xl border border-destructive/20">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                Account Email
              </label>
              <Input
                type="email"
                required
                placeholder="student@university.edu"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              variant="signature"
              className="w-full mt-2"
              isLoading={isLoading}
            >
              Send Reset Link
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center border-t border-neutral-border dark:border-ink-800 text-xs text-neutral-muted pt-4">
          Remember your password?{' '}
          <Link to="/login" className="ml-1 text-primary font-bold hover:underline">
            Sign In
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
