const config = window.VERTEX_CONFIG || {};

export const supabaseClient = window.supabase?.createClient(
  config.SUPABASE_PROJECT_URL,
  config.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

export async function getSession() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  return data.session;
}

export async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, profile) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: profile }
  });
  if (error) throw error;
  if (data.user) await upsertProfile(data.user.id, profile);
  return data;
}

export async function getProfile(userId) {
  if (!supabaseClient || !userId) return null;
  const { data, error } = await supabaseClient.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) return null;
  return data;
}

export async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
}

export async function upsertProfile(id, profile) {
  const payload = {
    id,
    full_name: profile.full_name,
    username: profile.username?.replace(/^@/, "").toLowerCase(),
    account_type: profile.account_type,
    bio: profile.bio || "",
    social_links: profile.social_links || [],
    avatar_url: profile.avatar_url || null
  };
  const { error } = await supabaseClient.from("profiles").upsert(payload);
  if (error) throw error;
}

export async function updateProfile(id, profile) {
  const payload = {
    full_name: profile.full_name,
    username: profile.username?.replace(/^@/, "").toLowerCase(),
    bio: profile.bio || "",
    social_links: profile.social_links || [],
    avatar_url: profile.avatar_url || null
  };
  const { data, error } = await supabaseClient.from("profiles").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function uploadFile(bucket, path, file) {
  const { data, error } = await supabaseClient.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: publicData } = supabaseClient.storage.from(bucket).getPublicUrl(data.path);
  return publicData.publicUrl;
}

export function subscribeTo(table, filter, handler) {
  if (!supabaseClient) return () => {};
  const channel = supabaseClient
    .channel(`vertex:${table}:${filter || "all"}`)
    .on("postgres_changes", { event: "*", schema: "public", table, filter }, handler)
    .subscribe();
  return () => supabaseClient.removeChannel(channel);
}
