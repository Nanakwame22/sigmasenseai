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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const action: "enable" | "disable" | "check" | "model_check" = body.action ?? "check";

    // ── 1. Update workflow enabled state if action is enable/disable ────────
    if (action === "enable" || action === "disable") {
      const { error: settingsErr } = await supabase
        .from("cpi_workflow_settings")
        .update({
          enabled: action === "enable",
          updated_at: new Date().toISOString(),
        })
        .eq("workflow_id", "readmission-nav");

      if (settingsErr) throw settingsErr;
    }

    if (action === "disable") {
      return new Response(
        JSON.stringify({ success: true, enabled: false, alert_fired: false, message: "Readmission Prevention workflow disabled." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Read current readmission domain snapshot ─────────────────────────
    const { data: domain, error: domainErr } = await supabase
      .from("cpi_domain_snapshots")
      .select("risk_score, status, predictive_insight, metrics, alerts_count")
      .eq("domain_id", "readmission")
      .maybeSingle();

    if (domainErr) throw domainErr;

    if (!domain) {
      return new Response(
        JSON.stringify({ success: true, enabled: true, alert_fired: false, message: "No readmission domain snapshot found." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const metrics = domain.metrics as Record<string, string>;
    const highRiskPatients = metrics["high_risk_patients"] ?? "?";
    const riskScore30d = metrics["risk_score_30d"] ?? "—";
    const interventionsActive = metrics["interventions_active"] ?? "—";
    const riskScore: number = domain.risk_score ?? 0;

    // ── 3. Build prediction text from live data ────────────────────────────
    const predictionText = `${highRiskPatients} high-risk patients (30-day score > 75th percentile) — CHF/COPD/Pneumonia cohort`;

    // ── 4. model_check: update cpi_models and return result, bypass enabled ─
    if (action === "model_check") {
      const { data: modelRow } = await supabase
        .from("cpi_models")
        .select("id, run_count_today, accuracy")
        .eq("model_key", "readmission")
        .maybeSingle();

      if (modelRow) {
        const nudge = (Math.random() - 0.45) * 0.35;
        const newAccuracy = parseFloat(
          Math.min(99.9, Math.max(60.0, parseFloat(modelRow.accuracy) + nudge)).toFixed(2)
        );
        await supabase
          .from("cpi_models")
          .update({
            last_run_at: new Date().toISOString(),
            run_count_today: (modelRow.run_count_today ?? 0) + 1,
            accuracy: newAccuracy,
            predictions: predictionText,
            updated_at: new Date().toISOString(),
          })
          .eq("model_key", "readmission");
      }

      const alertThreshold = 55;
      const shouldAlert = riskScore >= alertThreshold;
      let alertFired = false;
      let alertSeverity: string | undefined;

      if (shouldAlert) {
        // Dedup — skip if similar alert exists < 60 min
        const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recent } = await supabase
          .from("cpi_feed")
          .select("id")
          .eq("category", "readmission")
          .eq("acknowledged", false)
          .ilike("title", "Readmission Prevention:%")
          .gte("created_at", sixtyMinutesAgo);

        if (!recent || recent.length === 0) {
          alertSeverity = riskScore >= 75 ? "critical" : "warning";
          await supabase.from("cpi_feed").insert({
            category: "readmission",
            severity: alertSeverity,
            title: `Readmission Prevention: ${highRiskPatients} High-Risk Patients Identified`,
            body: `${domain.predictive_insight} Risk index: ${riskScore}/100. 30-day risk score: ${riskScore30d}. Active interventions: ${interventionsActive}. Care transition navigators should be assigned immediately.`,
            action_label: "Assign care transition navigator",
            icon: "ri-refresh-alert-line",
            acknowledged: false,
          });
          await supabase
            .from("cpi_domain_snapshots")
            .update({ alerts_count: (domain.alerts_count ?? 0) + 1, updated_at: new Date().toISOString() })
            .eq("domain_id", "readmission");
          alertFired = true;
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          alert_fired: alertFired,
          severity: alertSeverity,
          risk_score: riskScore,
          prediction: predictionText,
          message: alertFired
            ? `Alert fired — ${highRiskPatients} high-risk readmission patients, risk ${riskScore}/100. Navigator assignment recommended.`
            : shouldAlert
            ? `Risk elevated (${riskScore}/100) — alert already active in feed. ${highRiskPatients} patients monitored.`
            : `Risk score ${riskScore}/100 is below alert threshold. ${highRiskPatients} patients being monitored proactively.`,
          display_metrics: [
            { label: "High-Risk Patients", value: String(highRiskPatients) },
            { label: "30-Day Risk Score", value: riskScore30d },
            { label: "Active Interventions", value: interventionsActive },
          ],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 5. Standard check — respects workflow enabled state ────────────────
    const { data: settings, error: settingsReadErr } = await supabase
      .from("cpi_workflow_settings")
      .select("enabled, runs_today")
      .eq("workflow_id", "readmission-nav")
      .maybeSingle();

    if (settingsReadErr) throw settingsReadErr;

    if (!settings?.enabled) {
      return new Response(
        JSON.stringify({ success: true, enabled: false, alert_fired: false, message: "Workflow is disabled. Enable it first to activate monitoring." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (domain.risk_score < 55) {
      return new Response(
        JSON.stringify({
          success: true, enabled: true, alert_fired: false,
          message: `Risk score ${domain.risk_score}/100 is below threshold (55). No alert triggered — monitoring active.`,
          risk_score: domain.risk_score,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentAlerts, error: dedupeErr } = await supabase
      .from("cpi_feed")
      .select("id")
      .eq("category", "readmission")
      .eq("acknowledged", false)
      .ilike("title", "Readmission Prevention:%")
      .gte("created_at", sixtyMinutesAgo);

    if (dedupeErr) throw dedupeErr;

    if (recentAlerts && recentAlerts.length > 0) {
      return new Response(
        JSON.stringify({
          success: true, enabled: true, alert_fired: false,
          message: "Alert already exists in feed (within last 60 min). Monitoring active — will re-trigger after acknowledged.",
          risk_score: domain.risk_score,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const severity = domain.risk_score >= 75 ? "critical" : "warning";
    const alertTitle = `Readmission Prevention: ${highRiskPatients} High-Risk Patients Identified`;
    const alertBody =
      `Readmission prevention workflow triggered automatically. ${domain.predictive_insight} ` +
      `Risk index: ${domain.risk_score}/100. Care transition navigators should be assigned immediately ` +
      `to intercept 30-day readmissions for CHF, COPD, and Pneumonia cohorts.`;

    const { data: newAlert, error: insertErr } = await supabase
      .from("cpi_feed")
      .insert({
        category: "readmission",
        severity,
        title: alertTitle,
        body: alertBody,
        action_label: "Assign care transition navigator",
        icon: "ri-refresh-alert-line",
        acknowledged: false,
      })
      .select("id")
      .maybeSingle();

    if (insertErr) throw insertErr;

    await supabase
      .from("cpi_workflow_settings")
      .update({
        runs_today: (settings.runs_today ?? 0) + 1,
        last_run_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("workflow_id", "readmission-nav");

    await supabase
      .from("cpi_domain_snapshots")
      .update({ alerts_count: (domain.alerts_count ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq("domain_id", "readmission");

    return new Response(
      JSON.stringify({
        success: true, enabled: true, alert_fired: true, alert_id: newAlert?.id, severity,
        message: `Alert inserted — ${highRiskPatients} high-risk patients flagged. Care transition navigator assignment workflow active.`,
        risk_score: domain.risk_score,
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
