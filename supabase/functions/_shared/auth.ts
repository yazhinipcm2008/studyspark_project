import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'

export async function authenticateUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    throw new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || supabaseAnonKey

  const client = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await client.auth.getUser(token)

  if (error || !user) {
    throw new Response(JSON.stringify({ error: 'Invalid or expired session token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return { user, supabase: client }
}
