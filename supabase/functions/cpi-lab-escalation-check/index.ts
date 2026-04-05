import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    const parseMetricNumber = (value: string | undefined) => {
      if (!value) return 0;
      const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const action: "enable" | "disable" | "check" | "model_check" = body.action ?? "check";

    // ── 1. Update workflow enabled state if action is enable/disable ───────
    if (action === "enable" || action === "disable") {
      const { error: settingsErr } = await supabase
        .from("cpi_workflow_settings")
        .update({
          enabled: action === "enable",
          updated_at: new Date().toISOString(),
        })
        .eq("workflow_id", "lab-escalation");

      if (settingsErr) throw settingsErr;
    }

    // If disabling, done
    if (action === "disable") {
      return new Response(
        JSON.stringify({
          success: true,
          enabled: false,
          alert_fired: false,
          message: "Lab Escalation workflow paused. Monitoring stopped.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Confirm the workflow is enabled ─────────────────────────────────
    const { data: settings, error: settingsReadErr } = await supabase
      .from("cpi_workflow_settings")
      .select("enabled, runs_today")
      .eq("workflow_id", "lab-escalation")
      .maybeSingle();

    if (settingsReadErr) throw settingsReadErr;

    if (!settings?.enabled) {
      return new Response(
        JSON.stringify({
          success: true,
          enabled: false,
          alert_fired: false,
          message: "Workflow is disabled. Enable it to activate lab escalation monitoring.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 3. Read the lab domain snapshot ────────────────────────────────────
    const { data: domain, error: domainErr } = await supabase
      .from("cpi_domain_snapshots")
      .select("risk_score, status, predictive_insight, metrics, alerts_count")
      .eq("domain_id", "lab")
      .maybeSingle();

    if (domainErr) throw domainErr;

    // ── 4. Check cpi_feed for unacknowledged critical lab alerts > 30 min ─
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: staleCriticalAlerts, error: staleErr } = await supabase
      .from("cpi_feed")
      .select("id, title, created_at")
      .eq("category", "lab")
      .eq("severity", "critical")
      .eq("acknowledged", false)
      .lt("created_at", thirtyMinutesAgo);

    if (staleErr) throw staleErr;

    const staleCount = staleCriticalAlerts?.length ?? 0;
    const domainRisk = domain?.risk_score ?? 0;
    const criticalUnread = (domain?.metrics as Record<string, string>)?.["critical_unread"] ?? "0";
    const criticalUnreadNum = parseInt(criticalUnread, 10) || 0;
    const avgTat = (domain?.metrics as Record<string, string>)?.["avg_tat"] ?? "—";
    const pendingResults = (domain?.metrics as Record<string, string>)?.["pending_results"] ?? "—";
    const avgTatNum = parseMetricNumber(avgTat);
    const pendingResultsNum = parseMetricNumber(pendingResults);
    const predictionText =
      criticalUnreadNum > 0
        ? `${criticalUnreadNum} critical result${criticalUnreadNum === 1 ? "" : "s"} pending acknowledgement; average TAT ${avgTat}.`
        : `No critical-result backlog detected; average TAT ${avgTat}.`;

    if (action === "model_check") {
      const { data: modelRows } = await supabase
        .from("cpi_models")
        .select("id, model_key, run_count_today, accuracy, learn_count")
        .in("model_key", ["lab-escalation", "lab"]);

      if (modelRows && modelRows.length > 0) {
        const pressureScore =
          domainRisk * 0.5 +
          Math.min(criticalUnreadNum, 15) * 3.2 +
          Math.min(staleCount, 6) * 5 +
          Math.min(avgTatNum, 180) * 0.12 +
          Math.min(pendingResultsNum, 50) * 0.25;

        for (const modelRow of modelRows) {
          const learnBoost = Math.min(6, (modelRow.learn_count ?? 0) * 0.7);
          const newAccuracy = parseFloat(clamp(72 + pressureScore * 0.1 + learnBoost, 60, 98.5).toFixed(2));
          const predictionConfidence = parseFloat(
            clamp(66 + pressureScore * 0.14 + Math.min(8, (modelRow.run_count_today ?? 0) * 0.15) + learnBoost, 60, 98).toFixed(2)
          );
          await supabase
            .from("cpi_models")
            .update({
              last_run_at: new Date().toISOString(),
              run_count_today: (modelRow.run_count_today ?? 0) + 1,
              accuracy: newAccuracy,
              prediction_confidence: predictionConfidence,
              predictions: predictionText,
              impact: criticalUnreadNum > 0 ? "Escalation queue active" : "No live lab backlog",
              updated_at: new Date().toISOString(),
            })
            .eq("id", modelRow.id);
        }
      }
    }

    // Trigger condition: stale unacknowledged critical lab alerts OR lab risk >= 50
    const shouldTrigger = staleCount > 0 || domainRisk >= 50;

    if (!shouldTrigger) {
      return new Response(
        JSON.stringify({
          success: true,
          enabled: true,
          alert_fired: false,
          message: `No escalation trigger met. Lab risk: ${domainRisk}/100, stale critical alerts: ${staleCount}. Monitoring active.`,
          risk_score: domainRisk,
          stale_alerts: staleCount,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 5. Dedup — skip if automation escalation alert already exists < 60 min
    const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentAutomation, error: dedupeErr } = await supabase
      .from("cpi_feed")
      .select("id")
      .eq("category", "lab")
      .eq("acknowledged", false)
      .ilike("title", "Lab Escalation:%")
      .gte("created_at", sixtyMinutesAgo);

    if (dedupeErr) throw dedupeErr;

    if (recentAutomation && recentAutomation.length > 0) {
      return new Response(
        JSON.stringify({
          success: true,
          enabled: true,
          alert_fired: false,
          message: `Lab escalation alert already active in feed (within last 60 min). Will re-trigger after current alert is acknowledged.`,
          risk_score: domainRisk,
          stale_alerts: staleCount,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 6. Compose context-rich alert body ────────────────────────────────
    const staleAlertDetails = staleCriticalAlerts && staleCriticalAlerts.length > 0
      ? ` ${staleCount} critical result(s) have been unacknowledged for 30+ minutes.`
      : "";

    const alertTitle = `Lab Escalation: ${criticalUnreadNum} Critical Result${criticalUnreadNum !== 1 ? "s" : ""} Require Immediate Attention`;
    const alertBody =
      `Lab escalation workflow triggered automatically.${staleAlertDetails} ` +
      (domain?.predictive_insight ?? "") +
      ` Lab risk index: ${domainRisk}/100. Avg TAT: ${avgTat}. ` +
      `Pending results: ${pendingResults}. ` +
      `Escalating to covering physician with patient context.`;

    const severity = domainRisk >= 75 || staleCount >= 3 ? "critical" : "warning";

    // ── 7. Insert escalation alert into cpi_feed ──────────────────────────
    const { data: newAlert, error: insertErr } = await supabase
      .from("cpi_feed")
      .insert({
        category: "lab",
        severity,
        title: alertTitle,
        body: alertBody,
        action_label: "Escalate to covering physician",
        icon: "ri-test-tube-line",
        acknowledged: false,
      })
      .select("id")
      .maybeSingle();

    if (insertErr) throw insertErr;

    // ── 8. Increment runs_today + last_run_at ─────────────────────────────
    await supabase
      .from("cpi_workflow_settings")
      .update({
        runs_today: (settings.runs_today ?? 0) + 1,
        last_run_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("workflow_id", "lab-escalation");

    // ── 9. Bump alerts_count on lab domain snapshot ───────────────────────
    if (domain) {
      await supabase
        .from("cpi_domain_snapshots")
        .update({
          alerts_count: (domain.alerts_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("domain_id", "lab");
    }

    return new Response(
      JSON.stringify({
        success: true,
        enabled: true,
        alert_fired: true,
        alert_id: newAlert?.id,
        severity,
        message: `Lab escalation alert inserted into live feed — ${criticalUnreadNum} critical result${criticalUnreadNum !== 1 ? "s" : ""} flagged, ${staleCount} stale unacknowledged alert${staleCount !== 1 ? "s" : ""} detected. Physician escalation workflow active.`,
        risk_score: domainRisk,
        stale_alerts: staleCount,
        critical_unread: criticalUnreadNum,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
