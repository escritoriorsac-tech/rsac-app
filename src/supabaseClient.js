import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jrcojsnjxuykdczbqfuo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_RISoEhMJU-ARzP6A1dmLUA_r0JJexqr";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
