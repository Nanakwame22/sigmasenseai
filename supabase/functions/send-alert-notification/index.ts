import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationPayload {
  alertId: string;
  organizationId: string;
  userId: string;
}

interface AlertPreferences {
  email_enabled: boolean;
  in_app_enabled: boolean;
  sms_enabled: boolean;
  slack_enabled: boolean;
  frequency: string;
  critical_always: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  notification_email: string | null;
  sms_phone: string | null;
  slack_webhook_url: string | null;
  slack_channel: string | null;
}

interface AlertRecord {
  id: string;
  title: string;
  message: string;
  description: string;
  severity: string;
  category: string;
  status: string;
  created_at: string;
}

function isInQuietHours(start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;
  if (startMins <= endMins) {
    return currentTime >= startMins && currentTime <= endMins;
  }
  return currentTime >= startMins || currentTime <= endMins;
}

async function sendEmail(to: string, alert: AlertRecord): Promise<{ success: boolean; error?: string }> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) return { success: false, error: "RESEND_API_KEY not configured" };

  const severityColors: Record<string, string> = {
    critical: "#dc2626",
    high: "#ea580c",
    medium: "#d97706",
    low: "#059669",
  };
  const color = severityColors[alert.severity] || "#6b7280";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #0f766e, #0d9488); padding: 32px 40px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">⚡ Sigma Alert</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 14px;">Operational Intelligence Platform</p>
      </div>
      <div style="padding: 32px 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <div style="display: inline-block; background: ${color}18; border: 1px solid ${color}40; color: ${color}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 20px;">
          ${alert.severity} severity
        </div>
        <h2 style="color: #111827; font-size: 20px; font-weight: 700; margin: 0 0 12px;">${alert.title}</h2>
        <p style="color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">${alert.description || alert.message}</p>
        ${alert.category ? `<div style="background: #f9fafb; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;"><span style="color: #9ca3af; font-size: 12px; font-weight: 600; text-transform: uppercase;">Category</span><p style="color: #374151; font-size: 14px; margin: 4px 0 0; font-weight: 500;">${alert.category}</p></div>` : ""}
        <div style="border-top: 1px solid #f3f4f6; padding-top: 20px; margin-top: 8px;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">Triggered at ${new Date(alert.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p>
          <a href="${Deno.env.get("SITE_URL") || "https://app.sigma-intelligence.com"}/dashboard/alerts" style="display: inline-block; margin-top: 16px; background: #0f766e; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">View Alert →</a>
        </div>
      </div>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Sigma Alerts <alerts@sigma-intelligence.com>",
        to: [to],
        subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
        html,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: err };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

async function sendSMS(phone: string, alert: AlertRecord): Promise<{ success: boolean; error?: string }> {
  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
  const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER");

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    return { success: false, error: "Twilio credentials not configured" };
  }

  const body = `[Sigma Alert] ${alert.severity.toUpperCase()}: ${alert.title}\n${alert.message}\nView: ${Deno.env.get("SITE_URL") || "https://app.sigma-intelligence.com"}/dashboard/alerts`;

  try {
    const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    const params = new URLSearchParams({ To: phone, From: TWILIO_FROM_NUMBER, Body: body });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: { "Authorization": `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: err };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

async function sendSlack(webhookUrl: string, channel: string | null, alert: AlertRecord): Promise<{ success: boolean; error?: string }> {
  const severityEmoji: Record<string, string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🟢",
  };
  const emoji = severityEmoji[alert.severity] || "⚪";

  const payload: Record<string, unknown> = {
    text: `${emoji} *${alert.severity.toUpperCase()} Alert:* ${alert.title}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${emoji} ${alert.title}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Severity:*\n${alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1)}` },
          { type: "mrkdwn", text: `*Category:*\n${alert.category || "General"}` },
          { type: "mrkdwn", text: `*Status:*\n${alert.status || "New"}` },
          { type: "mrkdwn", text: `*Time:*\n${new Date(alert.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Details:*\n${alert.description || alert.message}` },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Alert", emoji: true },
            url: `${Deno.env.get("SITE_URL") || "https://app.sigma-intelligence.com"}/dashboard/alerts`,
            style: "primary",
          },
        ],
      },
    ],
  };

  if (channel) payload.channel = channel;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: err };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { alertId, organizationId, userId }: NotificationPayload = await req.json();

    if (!alertId || !organizationId || !userId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the alert
    const { data: alert, error: alertError } = await supabase
      .from("alerts")
      .select("*")
      .eq("id", alertId)
      .maybeSingle();

    if (alertError || !alert) {
      return new Response(JSON.stringify({ error: "Alert not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user preferences
    const { data: prefs, error: prefsError } = await supabase
      .from("alert_preferences")
      .select("*")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (prefsError || !prefs) {
      return new Response(JSON.stringify({ error: "No preferences found for user" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const preferences = prefs as AlertPreferences;
    const isCritical = alert.severity === "critical";
    const inQuiet = isInQuietHours(preferences.quiet_hours_start, preferences.quiet_hours_end);
    const shouldSuppress = inQuiet && !(isCritical && preferences.critical_always);

    const results: Record<string, { sent: boolean; error?: string; suppressed?: boolean }> = {};

    // Email
    if (preferences.email_enabled && preferences.notification_email) {
      if (shouldSuppress) {
        results.email = { sent: false, suppressed: true };
      } else {
        const r = await sendEmail(preferences.notification_email, alert as AlertRecord);
        results.email = { sent: r.success, error: r.error };
      }
    }

    // SMS
    if (preferences.sms_enabled && preferences.sms_phone) {
      if (shouldSuppress) {
        results.sms = { sent: false, suppressed: true };
      } else {
        const r = await sendSMS(preferences.sms_phone, alert as AlertRecord);
        results.sms = { sent: r.success, error: r.error };
      }
    }

    // Slack
    if (preferences.slack_enabled && preferences.slack_webhook_url) {
      if (shouldSuppress) {
        results.slack = { sent: false, suppressed: true };
      } else {
        const r = await sendSlack(preferences.slack_webhook_url, preferences.slack_channel, alert as AlertRecord);
        results.slack = { sent: r.success, error: r.error };
      }
    }

    // Log delivery attempt in audit_logs
    await supabase.from("audit_logs").insert({
      organization_id: organizationId,
      user_id: userId,
      action: "notification_sent",
      resource_type: "alert",
      resource_id: alertId,
      new_values: { channels: results, suppressed: shouldSuppress },
    });

    return new Response(JSON.stringify({ success: true, results, suppressed: shouldSuppress }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Notification error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
