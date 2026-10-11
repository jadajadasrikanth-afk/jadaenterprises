import { supabase } from "./supabaseClient";

// Supabase Auth needs an email under the hood; we synthesize one from the
// mobile number so users only ever see/enter their mobile number + password.
function mobileToEmail(mobile: string) {
  const digits = mobile.replace(/\D/g, "");
  return `${digits}@fielddata.local`;
}

export async function signUp(mobile: string, password: string) {
  const email = mobileToEmail(mobile);
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error("Signup failed");

  const { error: profileErr } = await supabase.from("profiles").insert({
    id: data.user.id,
    mobile_number: mobile.replace(/\D/g, ""),
  });
  if (profileErr) throw profileErr;

  return data.user;
}

export async function signIn(mobile: string, password: string) {
  const email = mobileToEmail(mobile);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function requestPasswordReset(mobile: string) {
  const { error } = await supabase
    .from("password_reset_requests")
    .insert({ mobile_number: mobile.replace(/\D/g, "") });
  if (error) throw error;
}
