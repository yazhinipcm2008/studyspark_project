export interface BadgeDefinition {
  key: string
  title: string
  description: string
  icon: string
  pointsReward: number
}

export const BADGES: Record<string, BadgeDefinition> = {
  first_quiz: {
    key: 'first_quiz',
    title: 'Quiz Novice',
    description: 'Completed your first AI-generated quiz',
    icon: 'Brain',
    pointsReward: 20,
  },
  five_quizzes: {
    key: 'five_quizzes',
    title: 'Quiz Champion',
    description: 'Completed 5 quizzes',
    icon: 'Award',
    pointsReward: 50,
  },
  perfect_score: {
    key: 'perfect_score',
    title: 'Perfectionist',
    description: 'Scored 100% on a study quiz',
    icon: 'Sparkles',
    pointsReward: 40,
  },
  three_day_streak: {
    key: 'three_day_streak',
    title: 'Momentum Builder',
    description: 'Maintained a 3-day active study streak',
    icon: 'Flame',
    pointsReward: 30,
  },
  week_warrior: {
    key: 'week_warrior',
    title: 'Week Warrior',
    description: 'Studied 7 days in a row',
    icon: 'Zap',
    pointsReward: 70,
  },
  month_master: {
    key: 'month_master',
    title: 'Consistent Scholar',
    description: 'Reached a 30-day study streak',
    icon: 'Crown',
    pointsReward: 150,
  },
  first_flashcard_set: {
    key: 'first_flashcard_set',
    title: 'Active Recall',
    description: 'Reviewed your first flashcard deck',
    icon: 'Layers',
    pointsReward: 25,
  },
  hundred_cards_reviewed: {
    key: 'hundred_cards_reviewed',
    title: 'Memory Master',
    description: 'Reviewed over 100 flashcards',
    icon: 'BookOpen',
    pointsReward: 80,
  },
  weekly_goal_met: {
    key: 'weekly_goal_met',
    title: 'Goal Crusher',
    description: 'Achieved your weekly target study hours',
    icon: 'Target',
    pointsReward: 50,
  },
  first_plan: {
    key: 'first_plan',
    title: 'Strategic Learner',
    description: 'Generated and organized a study plan',
    icon: 'Compass',
    pointsReward: 30,
  },
}

export interface ActivityDateRecord {
  date: string // YYYY-MM-DD
}

/**
 * Calculates current and longest streak from distinct active dates in user's timezone
 */
export function calculateStreaks(
  activeDatesSet: Set<string>,
  userTimezone: string = 'UTC'
): { currentStreak: number; longestStreak: number; isActiveToday: boolean } {
  if (activeDatesSet.size === 0) {
    return { currentStreak: 0, longestStreak: 0, isActiveToday: false }
  }

  // Format today and yesterday in the user's timezone
  const now = new Date()
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: userTimezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  
  const todayStr = dtf.format(now) // YYYY-MM-DD in user tz

  const yesterdayDate = new Date(now)
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterdayStr = dtf.format(yesterdayDate)

  const isActiveToday = activeDatesSet.has(todayStr)
  const isActiveYesterday = activeDatesSet.has(yesterdayStr)

  // Sort dates ascending
  const sortedDates = Array.from(activeDatesSet).sort()

  let currentStreak = 0
  let longestStreak = 0
  let tempStreak = 0
  let prevDate: Date | null = null

  for (const dateStr of sortedDates) {
    const curDate = new Date(`${dateStr}T12:00:00Z`)
    if (!prevDate) {
      tempStreak = 1
    } else {
      const diffMs = curDate.getTime() - prevDate.getTime()
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
      if (diffDays === 1) {
        tempStreak += 1
      } else if (diffDays > 1) {
        tempStreak = 1
      }
    }
    if (tempStreak > longestStreak) {
      longestStreak = tempStreak
    }
    prevDate = curDate
  }

  // Calculate current streak
  if (isActiveToday) {
    currentStreak = 1
    let checkDate = new Date(now)
    while (true) {
      checkDate.setDate(checkDate.getDate() - 1)
      const dateStr = dtf.format(checkDate)
      if (activeDatesSet.has(dateStr)) {
        currentStreak += 1
      } else {
        break
      }
    }
  } else if (isActiveYesterday) {
    currentStreak = 1
    let checkDate = new Date(yesterdayDate)
    while (true) {
      checkDate.setDate(checkDate.getDate() - 1)
      const dateStr = dtf.format(checkDate)
      if (activeDatesSet.has(dateStr)) {
        currentStreak += 1
      } else {
        break
      }
    }
  } else {
    currentStreak = 0
  }

  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
    isActiveToday,
  }
}
