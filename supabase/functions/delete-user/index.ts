// supabase/functions/delete-user/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request): Promise<Response> => {
  // Préflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing userId" }),
        { headers: corsHeaders, status: 400 },
      );
    }

    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { headers: corsHeaders, status: 400 },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: corsHeaders, status: 200 },
    );
  } catch (err) {
    console.error("delete-user error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { headers: corsHeaders, status: 500 },
    );
  }
});

