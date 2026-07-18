import { supabaseClient } from "./supabase.js";

const now = new Date();
const days = (n) => new Date(now.getTime() + n * 86400000).toISOString();

export const FIELDS = ["Maths", "Physics", "Programming", "Research", "Writing", "Design", "Robotics", "Debate"];
export const STRUCTURES = [
  { id: "direct_top", name: "Direct finalists", rounds: [{ name: "Final results", advances: 3 }] },
  { id: "top_100_30_3", name: "Top 100, top 30, top 3", rounds: [{ name: "Top 100", advances: 100 }, { name: "Top 30", advances: 30 }, { name: "Winners", advances: 3 }] },
  { id: "qualifier_final", name: "Qualifier and final", rounds: [{ name: "Qualifier", advances: 24 }, { name: "Final", advances: 3 }] }
];

export const mockProfile = {
  id: "demo-user",
  full_name: "Aarav Mehta",
  username: "aarav",
  account_type: "participant",
  bio: "Grade 10 student interested in programming, research, and team events.",
  social_links: ["https://github.com/aarav"],
  avatar_url: null
};

export const mockCompetitions = [
  {
    id: "vertex-code-cup",
    slug: "vertex-code-cup",
    name: "Vertex Code Cup",
    field: "Programming",
    prize: "INR 25,000 and mentorship",
    age_min: 12,
    age_max: 18,
    team_mode: "both",
    status: "registration_open",
    banner_gradient: "linear-gradient(135deg, #2563eb, #0d9488)",
    structure: STRUCTURES[1],
    categories: ["Junior", "Senior", "Best UI"],
    description: "Build a useful student tool in 48 hours, submit a working demo, and present to school mentors.",
    organizer_name: "Vertex Arena",
    registration_deadline: days(7),
    start_at: days(8),
    end_at: days(18),
    participant_count: 184,
    team_count: 62,
    saved: true
  },
  {
    id: "young-research-forum",
    slug: "young-research-forum",
    name: "Young Research Forum",
    field: "Research",
    prize: "Publication showcase",
    age_min: 14,
    age_max: 19,
    team_mode: "team",
    status: "in_progress",
    banner_gradient: "linear-gradient(135deg, #0f766e, #f59e0b)",
    structure: STRUCTURES[2],
    categories: ["Environment", "Health", "Systems"],
    description: "Submit a research abstract, advance through peer review, and defend findings in live panels.",
    organizer_name: "North Ridge School",
    registration_deadline: days(-2),
    start_at: days(-1),
    end_at: days(12),
    participant_count: 326,
    team_count: 91,
    saved: false
  },
  {
    id: "maths-sprint",
    slug: "maths-sprint",
    name: "Maths Sprint",
    field: "Maths",
    prize: "Medals and certificates",
    age_min: 10,
    age_max: 16,
    team_mode: "individual",
    status: "registration_open",
    banner_gradient: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
    structure: STRUCTURES[0],
    categories: ["Speed", "Proof"],
    description: "Fast-paced problem solving with live results and category prizes for precision and explanation.",
    organizer_name: "Stellar Academy",
    registration_deadline: days(14),
    start_at: days(15),
    end_at: days(16),
    participant_count: 540,
    team_count: 0,
    saved: false
  }
];

export const mockAnnouncements = [
  { id: 1, competition_id: "vertex-code-cup", title: "Orientation room open", body: "The briefing starts at 5:00 PM. Meeting link is visible in your competition panel.", created_at: days(-1) },
  { id: 2, competition_id: "vertex-code-cup", title: "Submission checklist", body: "Upload one ZIP file and one live URL before the round deadline.", created_at: days(-0.3) }
];

export const mockQuestions = [
  { id: 1, competition_id: "vertex-code-cup", author_name: "Mira Shah", question: "Can we use Supabase for auth?", answer: "Yes. Mention external services in your README.", created_at: days(-0.5) },
  { id: 2, competition_id: "vertex-code-cup", author_name: "Kabir Rao", question: "Can team members be from different schools?", answer: "", created_at: days(-0.2) }
];

export const mockTeams = [
  { id: "team-1", name: "Null Pointers", score: 96, category: "Senior", members: [{ full_name: "Aarav Mehta", username: "aarav" }, { full_name: "Mira Shah", username: "mira" }] },
  { id: "team-2", name: "Stack Sparks", score: 94, category: "Best UI", members: [{ full_name: "Kabir Rao", username: "kabir" }] },
  { id: "team-3", name: "Compile Crew", score: 92, category: "Junior", members: [{ full_name: "Ira Sen", username: "ira" }] },
  { id: "team-4", name: "Byte Bench", score: 89, category: "Senior", members: [{ full_name: "Dev Nair", username: "dev" }] }
];

export async function fetchCompetitions(filters = {}) {
  if (!supabaseClient) return filterLocal(mockCompetitions, filters);
  let query = supabaseClient.from("competitions").select("*").order("created_at", { ascending: false });
  if (filters.field && filters.field !== "All") query = query.eq("field", filters.field);
  if (filters.team && filters.team !== "all") query = query.eq("team_mode", filters.team);
  if (filters.search) query = query.ilike("name", `%${filters.search}%`);
  const { data, error } = await query;
  if (error) return mockCompetitions;
  return data?.length ? data.map(normalizeCompetition) : mockCompetitions;
}

export async function getCompetition(slug) {
  const local = mockCompetitions.find((item) => item.slug === slug || item.id === slug);
  if (!supabaseClient) return local;
  const { data, error } = await supabaseClient.from("competitions").select("*").eq("slug", slug).maybeSingle();
  if (error || !data) return local;
  return normalizeCompetition(data);
}

export async function createCompetition(payload) {
  const structureId = payload.structure_id;
  const cleanPayload = { ...payload };
  delete cleanPayload.structure_id;
  const session = supabaseClient ? (await supabaseClient.auth.getSession()).data.session : null;
  const record = {
    ...cleanPayload,
    slug: slugify(payload.name),
    organiser_id: session?.user?.id || payload.organiser_id || null,
    structure: STRUCTURES.find((item) => item.id === structureId) || STRUCTURES[0],
    banner_gradient: payload.banner_gradient || "linear-gradient(135deg, #2563eb, #0d9488)",
    status: "registration_open"
  };
  if (!supabaseClient) {
    mockCompetitions.unshift({ ...record, id: record.slug, participant_count: 0, team_count: 0 });
    return record;
  }
  const { data, error } = await supabaseClient.from("competitions").insert(record).select().single();
  if (error) throw error;
  return normalizeCompetition(data);
}

export async function registerForCompetition(competitionId, mode, teamName) {
  if (!supabaseClient) return { id: `demo-${Date.now()}`, competition_id: competitionId, mode, team_name: teamName };
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Sign in required.");
  const { data, error } = await supabaseClient.from("registrations").insert({
    competition_id: competitionId,
    participant_id: userId,
    mode,
    team_name: teamName || null
  }).select().single();
  if (error) throw error;
  return data;
}

export async function insertTable(table, payload) {
  if (!supabaseClient) return { ...payload, id: Date.now() };
  const { data, error } = await supabaseClient.from(table).insert(payload).select().single();
  if (error) throw error;
  return data;
}

export function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function normalizeCompetition(item) {
  return {
    ...item,
    structure: typeof item.structure === "string" ? JSON.parse(item.structure) : item.structure,
    categories: item.categories || [],
    registration_deadline: item.registration_deadline || item.timeline?.registration_deadline,
    start_at: item.start_at || item.timeline?.start_at,
    end_at: item.end_at || item.timeline?.end_at
  };
}

function filterLocal(items, filters = {}) {
  return items.filter((item) => {
    const matchesSearch = !filters.search || item.name.toLowerCase().includes(filters.search.toLowerCase());
    const matchesField = !filters.field || filters.field === "All" || item.field === filters.field;
    const matchesTeam = !filters.team || filters.team === "all" || item.team_mode === filters.team;
    return matchesSearch && matchesField && matchesTeam;
  });
}
