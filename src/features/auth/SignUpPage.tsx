import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Check, X, Sparkles } from 'lucide-react'

export const SignUpPage: React.FC = () => {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [university, setUniversity] = useState('')
  const [course, setCourse] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isVerificationSent, setIsVerificationSent] = useState(false)

  // Password strength checks
  const hasMinLength = password.length >= 8
  const hasNumber = /\d/.test(password)
  const hasUpper = /[A-Z]/.test(password)
  const isMatch = password.length > 0 && password === confirmPassword

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!hasMinLength || !hasNumber) {
      setErrorMsg('Password must be at least 8 characters and include at least one number.')
      return
    }

    if (!isMatch) {
      setErrorMsg('Passwords do not match.')
      return
    }

    setIsLoading(true)

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            university: university || null,
            course: course || null,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          },
        },
      })

      if (error) {
        throw error
      }

      if (data.session) {
        toast.success('Account created successfully! Welcome to StudySpark.')
        navigate('/dashboard')
      } else {
        // Confirmation email required
        setIsVerificationSent(true)
      }
    } catch (err: any) {
      if (err.message === 'Failed to fetch') {
        setErrorMsg('Connection error. Please hard-refresh your browser (Ctrl + Shift + R) to load the new environment configuration.')
      } else {
        setErrorMsg(err.message || 'Failed to sign up. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (isVerificationSent) {
    return (
      <div className="min-h-screen bg-neutral-bg dark:bg-ink-950 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center p-6">
          <div className="h-12 w-12 rounded-2xl bg-sky/15 text-sky mx-auto flex items-center justify-center mb-4">
            <Sparkles className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">Check your inbox</CardTitle>
          <CardDescription className="mt-2 text-sm leading-relaxed">
            We sent a verification link to <strong>{email}</strong>. Please confirm your email address to begin studying with StudySpark.
          </CardDescription>
          <Button variant="outline" className="mt-6 w-full" onClick={() => navigate('/login')}>
            Back to Login
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-bg dark:bg-ink-950 flex items-center justify-center p-4">
      <Card className="max-w-md w-full shadow-card">
        <CardHeader className="text-center pb-2">
          <div className="h-10 w-10 rounded-2xl bg-blue flex items-center justify-center text-white mx-auto shadow-card mb-2">
            <Sparkles className="h-5 w-5 text-sun fill-sun" />
          </div>
          <CardTitle className="text-2xl">Create your Account</CardTitle>
          <CardDescription>
            Join StudySpark to generate active-recall quizzes and tailored plans.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSignUp} className="space-y-4">
            {errorMsg && (
              <div className="p-3 text-xs text-destructive bg-destructive-50 dark:bg-destructive/10 rounded-xl border border-destructive/20">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                Full Name
              </label>
              <Input
                required
                placeholder="Alex Rivers"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
              />
            </div>

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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                  University (optional)
                </label>
                <Input
                  placeholder="e.g. Stanford"
                  value={university}
                  onChange={e => setUniversity(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                  Major / Course
                </label>
                <Input
                  placeholder="e.g. Biology"
                  value={course}
                  onChange={e => setCourse(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                Password
              </label>
              <Input
                type="password"
                required
                placeholder="At least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              {/* Strength Indicators */}
              <div className="mt-2 space-y-1 text-[11px] text-neutral-muted">
                <div className="flex items-center gap-1.5">
                  {hasMinLength ? <Check className="h-3.5 w-3.5 text-mint" /> : <X className="h-3.5 w-3.5 text-neutral-muted/50" />}
                  <span className={hasMinLength ? 'text-mint font-medium' : ''}>8+ characters</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {hasNumber ? <Check className="h-3.5 w-3.5 text-mint" /> : <X className="h-3.5 w-3.5 text-neutral-muted/50" />}
                  <span className={hasNumber ? 'text-mint font-medium' : ''}>At least one number</span>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                Confirm Password
              </label>
              <Input
                type="password"
                required
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
              {confirmPassword.length > 0 && (
                <p className={`mt-1 text-[11px] font-medium ${isMatch ? 'text-mint' : 'text-coral'}`}>
                  {isMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
                </p>
              )}
            </div>

            <Button
              type="submit"
              variant="blue"
              className="w-full mt-2"
              isLoading={isLoading}
            >
              Sign Up
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center border-t border-neutral-border dark:border-ink-800 text-xs text-neutral-muted pt-4">
          Already have an account?{' '}
          <Link to="/login" className="ml-1 text-blue font-bold hover:underline">
            Sign In
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
