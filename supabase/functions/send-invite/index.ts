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

    const body = await req.json()
    const email = String(body.email || "").trim().toLowerCase()
    const role  = String(body.role || "").trim()
    const name  = String(body.name || "").trim()
    const code  = body.code ? String(body.code).trim() : ""
    const kind  = String(body.kind || "invite").trim().toLowerCase()  // 'invite' | 'waitlist' | 'decline' | 'confirm-team' | 'confirm-judge'
    const context = String(body.context || "").trim()                  // e.g. team name, optional
    if (!email) return json({ error: "email required" }, 400)

    // Public kinds (no auth required): only send our fixed templates, so blast radius is bounded.
    const publicKinds = new Set(["confirm-team", "confirm-judge"])
    if (!publicKinds.has(kind)) {
      // Admin-only paths.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) return json({ error: "not authed" }, 401)
      const { data: me } = await supabase
        .from("allowed_users")
        .select("role")
        .eq("email", user.email.toLowerCase())
        .maybeSingle()
      if (me?.role !== "admin") return json({ error: "admin only" }, 403)
    }

    if (kind === "invite" && !role) return json({ error: "role required for invite" }, 400)

    // Send via Resend
    let subject: string, html: string, text: string
    if (kind === "waitlist") {
      subject = "House of Lords — waitlisted"
      html = renderWaitlistHtml({ email, name, context })
      text = renderWaitlistText({ email, name, context })
    } else if (kind === "decline") {
      subject = "House of Lords — registration update"
      html = renderDeclineHtml({ email, name, context })
      text = renderDeclineText({ email, name, context })
    } else if (kind === "confirm-team") {
      subject = "House of Lords — registration received"
      html = renderConfirmTeamHtml({ email, name, context })
      text = renderConfirmTeamText({ email, name, context })
    } else if (kind === "confirm-judge") {
      subject = "House of Lords — judge registration received"
      html = renderConfirmJudgeHtml({ email, name })
      text = renderConfirmJudgeText({ email, name })
    } else {
      subject = `You're invited to House of Lords — ${role}`
      html = renderInviteHtml({ email, role, name, code })
      text = renderInviteText({ email, role, name, code })
    }

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
    // Record invited_at (invite only; waitlist/decline don't grant portal access).
    if (kind === "invite") {
      await supabase.from("allowed_users").update({ invited_at: new Date().toISOString() }).eq("email", email)
    }
    return json({ ok: true, kind })
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
  const logoUrl = `${APP_URL}/assets/isomo.png`
  const roleLabel = String(role).toUpperCase()
  return `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#f7f8fa; padding:24px; margin:0;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px; margin:0 auto; background:#fff; border:1px solid #e6e8ec; border-radius:4px;">
    <tr><td style="padding:28px 32px 20px 32px; border-bottom:6px solid #8cc63e;">
      <img src="${logoUrl}" alt="Isomo" width="120" style="display:block; height:auto;">
      <div style="margin-top:14px; display:inline-block; padding:4px 10px; background:rgba(140,198,62,0.15); color:#7ab332; font-size:10px; letter-spacing:2px; text-transform:uppercase; font-weight:800;">
        House of Lords
      </div>
    </td></tr>
    <tr><td style="padding:32px 32px 8px 32px;">
      <div style="font-family:'Montserrat',-apple-system,sans-serif; font-size:32px; font-weight:800; letter-spacing:-0.5px; color:#2b2c2d; line-height:1.15;">
        You're on the list.
      </div>
    </td></tr>
    <tr><td style="padding:14px 32px 8px 32px; color:#333; font-size:15px; line-height:1.6;">
      <p style="margin:0 0 14px 0;">Hi ${escapeHtml(name || email.split('@')[0])},</p>
      <p style="margin:0 0 14px 0;">
        You've been added to the <b>House of Lords</b> roster as
        <span style="display:inline-block; padding:3px 9px; background:#2b2c2d; color:#fff; font-family:'Montserrat',sans-serif; font-size:11px; letter-spacing:1.5px; font-weight:800;">${escapeHtml(roleLabel)}</span>${code ? ` <span style="display:inline-block; padding:3px 9px; background:rgba(140,198,62,0.15); color:#7ab332; font-family:'Montserrat',sans-serif; font-size:11px; letter-spacing:1.5px; font-weight:800;">${escapeHtml(code)}</span>` : ""}.
      </p>
      <p style="margin:0 0 14px 0;">
        Isomo's Scholars' Debate. Vision 2050. Five rounds, 25 motions, 60 voices.
        <b>18 July 2026.</b>
      </p>
    </td></tr>
    <tr><td style="padding:14px 32px 8px 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="background:#2b2c2d;">
          <a href="${APP_URL}" style="display:inline-block; padding:14px 24px; color:#fff; text-decoration:none; font-family:'Montserrat',sans-serif; font-weight:700; font-size:14px; letter-spacing:0.5px;">
            Open the portal &nbsp;→
          </a>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:12px 32px 32px 32px; font-size:13px; color:#6b7280; line-height:1.55;">
      Use <b>Sign in with Google</b> and pick <b style="color:#2b2c2d;">${escapeHtml(email)}</b>. Only that address unlocks your ${escapeHtml(role)} portal.
    </td></tr>
    <tr><td style="padding:16px 32px; border-top:1px solid #e6e8ec; background:#fbfcfd; font-size:10px; color:#6b7280; letter-spacing:1.5px; text-transform:uppercase; font-weight:700;">
      <span style="color:#7ab332;">Isomo</span> &middot; Scholars' Debate &nbsp;&nbsp;|&nbsp;&nbsp; What can we do now, with what we have?
    </td></tr>
  </table>
</body></html>`
}

function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
}

/* ---------------- WAITLIST ---------------- */

function renderWaitlistText({ email, name, context }: any) {
  return `Hi ${name || email},

Thanks for registering for House of Lords 2026${context ? ` (${context})` : ""}.

You're currently on our waitlist. Slots are limited to six classes and thirty judges — if space opens up before Saturday, we'll email you immediately with next steps.

Either way, we appreciate you stepping up.

— Isomo · House of Lords`
}

function renderWaitlistHtml({ email, name, context }: any) {
  const logoUrl = `${APP_URL}/assets/isomo.png`
  return `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#f7f8fa; padding:24px; margin:0;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px; margin:0 auto; background:#fff; border:1px solid #e6e8ec; border-radius:4px;">
    <tr><td style="padding:28px 32px 20px 32px; border-bottom:6px solid #efb34a;">
      <img src="${logoUrl}" alt="Isomo" width="120" style="display:block; height:auto;">
      <div style="margin-top:14px; display:inline-block; padding:4px 10px; background:rgba(239,179,74,0.15); color:#a67628; font-size:10px; letter-spacing:2px; text-transform:uppercase; font-weight:800;">
        House of Lords · Waitlist
      </div>
    </td></tr>
    <tr><td style="padding:32px 32px 8px 32px;">
      <div style="font-family:'Cormorant Garamond', Georgia, serif; font-style:italic; font-size:36px; font-weight:700; color:#2b2c2d; line-height:1.15;">
        You're on the waitlist.
      </div>
    </td></tr>
    <tr><td style="padding:14px 32px 8px 32px; color:#333; font-size:15px; line-height:1.6;">
      <p style="margin:0 0 14px 0;">Hi ${escapeHtml(name || email.split('@')[0])},</p>
      <p style="margin:0 0 14px 0;">
        Thanks for registering for <b>House of Lords 2026</b>${context ? ` <span style="color:#6b7280;">(${escapeHtml(context)})</span>` : ""}.
      </p>
      <p style="margin:0 0 14px 0;">
        Slots are limited &mdash; six classes on the floor, thirty judges in the rooms. You're currently on the waitlist. If space opens up before Saturday we'll email again with your login details and code.
      </p>
      <p style="margin:0 0 14px 0;">
        Either way &mdash; thank you for stepping up.
      </p>
    </td></tr>
    <tr><td style="padding:12px 32px 32px 32px; font-size:13px; color:#6b7280; line-height:1.55;">
      Questions? Reply to this email or ping an organizer.
    </td></tr>
    <tr><td style="padding:16px 32px; border-top:1px solid #e6e8ec; background:#fbfcfd; font-size:10px; color:#6b7280; letter-spacing:1.5px; text-transform:uppercase; font-weight:700;">
      <span style="color:#7ab332;">Isomo</span> &middot; Scholars' Debate &nbsp;&nbsp;|&nbsp;&nbsp; What can we do now, with what we have?
    </td></tr>
  </table>
</body></html>`
}

/* ---------------- DECLINE ---------------- */

function renderDeclineText({ email, name, context }: any) {
  return `Hi ${name || email},

Thanks for registering for House of Lords 2026${context ? ` (${context})` : ""}.

We're unable to include you in this year's tournament roster. This isn't a reflection on you — we had far more submissions than slots. Isomo runs programming year-round, and we'd love to see you at the next opening.

— Isomo · House of Lords`
}

function renderDeclineHtml({ email, name, context }: any) {
  const logoUrl = `${APP_URL}/assets/isomo.png`
  return `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#f7f8fa; padding:24px; margin:0;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px; margin:0 auto; background:#fff; border:1px solid #e6e8ec; border-radius:4px;">
    <tr><td style="padding:28px 32px 20px 32px; border-bottom:6px solid #2b2c2d;">
      <img src="${logoUrl}" alt="Isomo" width="120" style="display:block; height:auto;">
      <div style="margin-top:14px; display:inline-block; padding:4px 10px; background:rgba(43,44,45,0.08); color:#2b2c2d; font-size:10px; letter-spacing:2px; text-transform:uppercase; font-weight:800;">
        House of Lords · Registration Update
      </div>
    </td></tr>
    <tr><td style="padding:32px 32px 8px 32px;">
      <div style="font-family:'Cormorant Garamond', Georgia, serif; font-style:italic; font-size:32px; font-weight:700; color:#2b2c2d; line-height:1.15;">
        Not this year.
      </div>
    </td></tr>
    <tr><td style="padding:14px 32px 8px 32px; color:#333; font-size:15px; line-height:1.6;">
      <p style="margin:0 0 14px 0;">Hi ${escapeHtml(name || email.split('@')[0])},</p>
      <p style="margin:0 0 14px 0;">
        Thanks for registering for <b>House of Lords 2026</b>${context ? ` <span style="color:#6b7280;">(${escapeHtml(context)})</span>` : ""}.
      </p>
      <p style="margin:0 0 14px 0;">
        We're unable to include you in this year's tournament roster. This isn't a reflection on you — we had far more submissions than slots.
      </p>
      <p style="margin:0 0 14px 0;">
        Isomo runs programming year-round. Watch our channels for the next Circle, workshop, or open call.
      </p>
    </td></tr>
    <tr><td style="padding:16px 32px; border-top:1px solid #e6e8ec; background:#fbfcfd; font-size:10px; color:#6b7280; letter-spacing:1.5px; text-transform:uppercase; font-weight:700;">
      <span style="color:#7ab332;">Isomo</span> &middot; Scholars' Debate &nbsp;&nbsp;|&nbsp;&nbsp; What can we do now, with what we have?
    </td></tr>
  </table>
</body></html>`
}

/* ---------------- CONFIRMATION (team) ---------------- */

function renderConfirmTeamText({ email, name, context }: any) {
  return `Hi ${name || email},

We've received your House of Lords registration${context ? ` for ${context}` : ""}.

An organizer will review your submission shortly. Once approved, every speaker on your team will get an email with their code (e.g. B3) and login instructions.

Nothing to do right now. Watch your inbox — if there's an issue we'll reach out directly.

Deadline for edits: Fri 17 Jul, 7:00 pm (CAT). After that, pairings lock.

— Isomo · House of Lords`
}

function renderConfirmTeamHtml({ email, name, context }: any) {
  const logoUrl = `${APP_URL}/assets/isomo.png`
  return `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#f7f8fa; padding:24px; margin:0;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px; margin:0 auto; background:#fff; border:1px solid #e6e8ec; border-radius:4px;">
    <tr><td style="padding:28px 32px 20px 32px; border-bottom:6px solid #8cc63e;">
      <img src="${logoUrl}" alt="Isomo" width="120" style="display:block; height:auto;">
      <div style="margin-top:14px; display:inline-block; padding:4px 10px; background:rgba(140,198,62,0.15); color:#7ab332; font-size:10px; letter-spacing:2px; text-transform:uppercase; font-weight:800;">
        House of Lords · Received
      </div>
    </td></tr>
    <tr><td style="padding:32px 32px 8px 32px;">
      <div style="font-family:'Cormorant Garamond', Georgia, serif; font-style:italic; font-size:38px; font-weight:700; color:#2b2c2d; line-height:1.1;">
        We got it.
      </div>
    </td></tr>
    <tr><td style="padding:14px 32px 8px 32px; color:#333; font-size:15px; line-height:1.6;">
      <p style="margin:0 0 14px 0;">Hi ${escapeHtml(name || email.split('@')[0])},</p>
      <p style="margin:0 0 14px 0;">
        We've received your House of Lords registration${context ? ` for <b>${escapeHtml(context)}</b>` : ""}.
      </p>
      <p style="margin:0 0 14px 0;">
        An organizer will review shortly. Once approved, <b>every speaker on your team</b> will get their own email with their code (e.g. B3) and login instructions.
      </p>
      <p style="margin:0 0 14px 0;">
        Nothing to do right now &mdash; if we spot an issue we'll reach out directly.
      </p>
      <p style="margin:14px 0 0 0; padding:10px 14px; background:#fbf7ee; border-left:3px solid #efb34a; font-size:14px;">
        <b>Edits close:</b> Fri 17 Jul, 7:00 pm (CAT). After that, pairings lock.
      </p>
    </td></tr>
    <tr><td style="padding:16px 32px; border-top:1px solid #e6e8ec; background:#fbfcfd; font-size:10px; color:#6b7280; letter-spacing:1.5px; text-transform:uppercase; font-weight:700;">
      <span style="color:#7ab332;">Isomo</span> &middot; Scholars' Debate &nbsp;&nbsp;|&nbsp;&nbsp; What can we do now, with what we have?
    </td></tr>
  </table>
</body></html>`
}

/* ---------------- CONFIRMATION (judge) ---------------- */

function renderConfirmJudgeText({ email, name }: any) {
  return `Hi ${name || email},

We've received your registration as a judge for House of Lords 2026.

An organizer will review your submission and email you back with your J-code (e.g. J17) and login instructions. Once approved, you'll also get the link for Judges' Training Session 1 (Fri 17 Jul, 8:00 p.m. via Zoom).

Nothing to do right now — watch your inbox.

— Isomo · House of Lords`
}

function renderConfirmJudgeHtml({ email, name }: any) {
  const logoUrl = `${APP_URL}/assets/isomo.png`
  return `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#f7f8fa; padding:24px; margin:0;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px; margin:0 auto; background:#fff; border:1px solid #e6e8ec; border-radius:4px;">
    <tr><td style="padding:28px 32px 20px 32px; border-bottom:6px solid #1dafec;">
      <img src="${logoUrl}" alt="Isomo" width="120" style="display:block; height:auto;">
      <div style="margin-top:14px; display:inline-block; padding:4px 10px; background:rgba(29,175,236,0.15); color:#1189c1; font-size:10px; letter-spacing:2px; text-transform:uppercase; font-weight:800;">
        House of Lords · Judge Application
      </div>
    </td></tr>
    <tr><td style="padding:32px 32px 8px 32px;">
      <div style="font-family:'Cormorant Garamond', Georgia, serif; font-style:italic; font-size:38px; font-weight:700; color:#2b2c2d; line-height:1.1;">
        We got it.
      </div>
    </td></tr>
    <tr><td style="padding:14px 32px 8px 32px; color:#333; font-size:15px; line-height:1.6;">
      <p style="margin:0 0 14px 0;">Hi ${escapeHtml(name || email.split('@')[0])},</p>
      <p style="margin:0 0 14px 0;">
        Thanks for offering to judge <b>House of Lords 2026</b>. Your registration is in.
      </p>
      <p style="margin:0 0 14px 0;">
        An organizer will review and email you back with your <b>J-code</b> (e.g. J17) and portal login.
        Once approved you'll also receive the link for <b>Judges' Training Session 1</b> (Fri 17 Jul, 8:00 p.m. via Zoom).
      </p>
      <p style="margin:14px 0 0 0; padding:10px 14px; background:#fbf7ee; border-left:3px solid #1dafec; font-size:14px;">
        Nothing to do right now &mdash; watch your inbox.
      </p>
    </td></tr>
    <tr><td style="padding:16px 32px; border-top:1px solid #e6e8ec; background:#fbfcfd; font-size:10px; color:#6b7280; letter-spacing:1.5px; text-transform:uppercase; font-weight:700;">
      <span style="color:#7ab332;">Isomo</span> &middot; Scholars' Debate &nbsp;&nbsp;|&nbsp;&nbsp; What can we do now, with what we have?
    </td></tr>
  </table>
</body></html>`
}
