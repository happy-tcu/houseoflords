// Supabase Edge Function: sends a House of Lords invite email via Resend.
//
// Deploy:
//   supabase functions deploy send-invite --no-verify-jwt=false
// Secrets:
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx
//   supabase secrets set APP_URL=https://houseoflords.vercel.app
//   supabase secrets set FROM_EMAIL="House of Lords <invite@yourdomain.com>"

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")
const APP_URL = Deno.env.get("APP_URL") ?? "https://houseoflords.vercel.app"
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "House of Lords <onboarding@resend.dev>"
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "POST only" }, 405)
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not set" }, 500)

  try {
    const authHeader = req.headers.get("Authorization") ?? ""
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    // Verify caller is an admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return json({ error: "not authed" }, 401)
    const { data: me } = await supabase
      .from("allowed_users")
      .select("role")
      .eq("email", user.email.toLowerCase())
      .maybeSingle()
    if (me?.role !== "admin") return json({ error: "admin only" }, 403)

    const body = await req.json()
    const email = String(body.email || "").trim().toLowerCase()
    const role  = String(body.role || "").trim()
    const name  = String(body.name || "").trim()
    const code  = body.code ? String(body.code).trim() : ""
    if (!email || !role) return json({ error: "email + role required" }, 400)

    // Send via Resend
    const subject = `You're invited to House of Lords — ${role}`
    const html = renderInviteHtml({ email, role, name, code })
    const text = renderInviteText({ email, role, name, code })

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject,
        html,
        text,
      }),
    })
    if (!resp.ok) {
      const errBody = await resp.text()
      return json({ error: `resend: ${resp.status} ${errBody}` }, 502)
    }
    // Record invited_at
    await supabase.from("allowed_users").update({ invited_at: new Date().toISOString() }).eq("email", email)
    return json({ ok: true })
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500)
  }
})

function json(o: any, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  })
}

function renderInviteText({ email, role, name, code }: any) {
  return `Hi ${name || email},

You've been added to the House of Lords tournament roster as ${role.toUpperCase()}${code ? ` (${code})` : ""}.

House of Lords is Isomo's Scholars' Debate — 18 July 2026. Vision 2050, five rounds, 25 motions.

To join:
1. Go to ${APP_URL}
2. Click "Sign in with Google"
3. Sign in using this exact email: ${email}

Only this email can access your ${role} portal. If it doesn't work, ping an organizer.

— Isomo · House of Lords`
}

function renderInviteHtml({ email, role, name, code }: any) {
  return `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#f7f8fa; padding:24px;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border:1px solid #e6e8ec; border-radius:4px; overflow:hidden;">
    <div style="padding:22px 28px; border-bottom:6px solid #8cc63e;">
      <div style="font-size:11px; letter-spacing:2px; text-transform:uppercase; font-weight:800; color:#7ab332;">Isomo · House of Lords</div>
      <div style="font-size:22px; font-weight:800; color:#2b2c2d; margin-top:4px;">You're on the list.</div>
    </div>
    <div style="padding:24px 28px; color:#333; font-size:15px; line-height:1.55;">
      <p>Hi ${escapeHtml(name || email)},</p>
      <p>You've been added to the House of Lords tournament roster as
        <b style="color:#2b2c2d; text-transform:uppercase;">${escapeHtml(role)}</b>${code ? ` · <b>${escapeHtml(code)}</b>` : ""}.
      </p>
      <p><b>House of Lords</b> is Isomo's Scholars' Debate — 18 July 2026.
         Vision 2050, five rounds, 25 motions, 60 voices.</p>

      <p style="margin-top:24px;">
        <a href="${APP_URL}" style="display:inline-block; background:#2b2c2d; color:#fff; text-decoration:none; padding:12px 20px; border-radius:4px; font-weight:700; letter-spacing:0.5px;">
          Sign in
        </a>
      </p>
      <p style="font-size:13px; color:#6b7280;">Use <b>Sign in with Google</b> and pick the account <b>${escapeHtml(email)}</b>. Only that email can access your ${escapeHtml(role)} portal.</p>
    </div>
    <div style="padding:14px 28px; border-top:1px solid #e6e8ec; font-size:11px; color:#6b7280; letter-spacing:1px; text-transform:uppercase; font-weight:700;">
      What can we do now, with what we have?
    </div>
  </div>
</body></html>`
}

function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
}
