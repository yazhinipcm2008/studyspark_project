import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0m'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function formatTime(timeStr: string): string {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const formattedHour = hour % 12 || 12
  return `${formattedHour}:${m} ${ampm}`
}

export function getGreeting(name?: string | null): string {
  const hour = new Date().getHours()
  let timeGreeting = 'Good morning'
  if (hour >= 12 && hour < 17) {
    timeGreeting = 'Good afternoon'
  } else if (hour >= 17) {
    timeGreeting = 'Good evening'
  }
  return name ? `${timeGreeting}, ${name}` : timeGreeting
}
