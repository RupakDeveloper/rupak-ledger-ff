import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const auth = req.headers.get("Authorization");
  if (!auth) return new Response("Unauthorized", { status: 401 });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Unauthorized", { status: 401 });
  try {
    const { pdfBase64, username } = await req.json();
    if (typeof pdfBase64 !== "string" || pdfBase64.length > 1200000 || typeof username !== "string") return new Response("Invalid request", { status: 400 });
    const emailKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("EMAIL_FROM");
    if (!emailKey || !from) return new Response("Email provider not configured", { status: 500 });
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${emailKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: ["rupakfx@gmail.com"], subject: `Consented profile summary: @${username}`, html: `<p>User <b>@${username}</b> (${user.email ?? "authenticated account"}) consented to submit their ledger summary.</p>`, attachments: [{ filename: `profile-${username}-summary.pdf`, content: pdfBase64 }] })
    });
    if (!response.ok) return new Response("Email provider rejected the request", { status: 502 });
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch { return new Response("Invalid request", { status: 400 }); }
});
