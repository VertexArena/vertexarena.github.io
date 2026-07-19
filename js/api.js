const cfg=window.VERTEX_CONFIG;
export const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY||cfg.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const competitionSelect='*,organisation:organisations(name,slug),competition_tags(tag:tags(name,slug))';
export const api={
 async session(){return(await db.auth.getSession()).data.session},
 async signIn(email,password){return db.auth.signInWithPassword({email,password})},
 async signUp({email,password,fullName,username,accountType}){return db.auth.signUp({email,password,options:{data:{full_name:fullName,username,account_type:accountType}}})},
 async signOut(){return db.auth.signOut()},
 async profile(id){return db.from('profiles').select('*').eq('id',id).maybeSingle()},
 async updateProfile(id,values){return db.from('profiles').update({...values,updated_at:new Date().toISOString()}).eq('id',id).select().single()},
 async competitions(filters={}){let q=db.from('competitions').select(competitionSelect).in('status',['published','ongoing']).order('registration_deadline');if(filters.search)q=q.ilike('name',`%${filters.search}%`);if(filters.teamMode)q=q.eq('team_mode',filters.teamMode);return q},
 async competition(slug){return db.from('competitions').select('*,organisation:organisations(name,slug),rounds(*),competition_tags(tag:tags(*)),organisers:competition_organisers(profile:profiles(*))').eq('slug',slug).maybeSingle()},
 async organisedCompetitions(id){return db.from('competitions').select(competitionSelect).eq('created_by',id).order('created_at',{ascending:false})},
 async organisationCompetitions(id){return db.from('competitions').select(competitionSelect).eq('organisation_id',id).order('created_at',{ascending:false})},
 async registrations(id){return db.from('registrations').select('*,competition:competitions('+competitionSelect+')').eq('participant_id',id).order('created_at',{ascending:false})},
 async register(competitionId,categoryId=null){return db.from('registrations').insert({competition_id:competitionId,participant_id:(await this.session()).user.id,category_id:categoryId}).select().single()},
 async bookmarks(id){return db.from('bookmarks').select('competition_id,competition:competitions('+competitionSelect+')').eq('profile_id',id).order('created_at',{ascending:false})},
 async addBookmark(profileId,competitionId){return db.from('bookmarks').insert({profile_id:profileId,competition_id:competitionId})},
 async removeBookmark(profileId,competitionId){return db.from('bookmarks').delete().eq('profile_id',profileId).eq('competition_id',competitionId)},
 async createCompetition(values,userId){return db.from('competitions').insert({...values,created_by:userId,status:'draft'}).select().single()},
 async competitionCounts(id){const[p,t]=await Promise.all([db.from('registrations').select('*',{count:'exact',head:true}).eq('competition_id',id),db.from('teams').select('*',{count:'exact',head:true}).eq('competition_id',id)]);return{participants:p.count||0,teams:t.count||0}},
 async notifications(id){return db.from('notifications').select('*').eq('recipient_id',id).order('created_at',{ascending:false})},
 async announcements(competitionId){return db.from('announcements').select('*,author:profiles(full_name,username)').eq('competition_id',competitionId).order('created_at',{ascending:false})},
 async questions(competitionId){return db.from('questions').select('*,author:profiles(full_name,username),answers(*,author:profiles(full_name,username))').eq('competition_id',competitionId).order('created_at',{ascending:false})},
 channel(name,table,filter,callback){return db.channel(name).on('postgres_changes',{event:'*',schema:'public',table,filter},callback).subscribe()}
};