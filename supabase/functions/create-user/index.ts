import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, password, role } = await req.json();

    if (!email || !password || !role) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing data" }),
        { headers: corsHeaders, status: 400 }
      );
    }

    // ADMIN KEY (OBLIGATOIRE)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1) Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return new Response(
        JSON.stringify({ success: false, error: authError.message }),
        { headers: corsHeaders, status: 400 }
      );
    }

    const userId = authData.user.id;

    // 2) Insert profile
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: userId,
        email,
        role,
      });

    if (profileError) {
      return new Response(
        JSON.stringify({ success: false, error: profileError.message }),
        { headers: corsHeaders, status: 400 }
      );
    }

    return new Response(
      JSON.stringify({ success: true, userId }),
      { headers: corsHeaders, status: 200 }
    );

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: corsHeaders,
      status: 400,
    });
  }
});
