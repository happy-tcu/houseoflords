// Receives Resend delivery events and records email_opened_at.
// Configure in Resend dashboard → Webhooks → URL:
//   https://nihlptpptlyxjdxclmhp.supabase.co/functions/v1/resend-webhook
// Subscribe to: email.opened (email.delivered optional for future use)

import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
// Optional: shared secret for extra protection. Configure Resend to send in `x-webhook-secret` header.
const SHARED_SECRET = Deno.env.get("WEBHOOK_SHARED_SECRET") ?? null

serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 })

  if (SHARED_SECRET) {
    if (req.headers.get("x-webhook-secret") !== SHARED_SECRET) {
      return new Response("bad secret", { status: 401 })
    }
  }

  try {
    const body = await req.json()
    // Resend webhook format: { type: "email.opened", data: { to: [...], ... } }
    const type = String(body?.type ?? "")
    const to = body?.data?.to
    const email = Array.isArray(to) ? to[0] : to
    if (!email) return new Response("no recipient", { status: 400 })

    if (type === "email.opened" || type === "email.delivered") {
      const sb = createClient(SUPABASE_URL, SERVICE_ROLE)
      await sb.rpc("mark_email_opened", { p_email: String(email).toLowerCase() })
    }
    return new Response("ok")
  } catch (e) {
    return new Response("bad json: " + (e as Error).message, { status: 400 })
  }
})
