import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticateUser } from '../_shared/auth.ts'

const AwardPointsSchema = z.object({
  event_type: z.enum([
    'task_completed',
    'flashcard_set_reviewed',
    'daily_goal_met',
    'weekly_goal_met',
  ]),
  source_id: z.string().uuid(),
  points: z.number().int().min(1).max(100),
})

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user, supabase } = await authenticateUser(req)
    const body = await req.json()
    const input = AwardPointsSchema.parse(body)

    // Call the security definer database function
    const { data, error } = await supabase.rpc('award_points_and_badges', {
      p_user_id: user.id,
      p_event_type: input.event_type,
      p_source_id: input.source_id,
      p_points: input.points,
    })

    if (error) {
      throw error
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('award-points error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
