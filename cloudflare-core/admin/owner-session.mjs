/**
 * Afiléon owner-only admin session guard — STAGING / TESTS ONLY.
 *
 * This module never logs in an administrator, issues tokens, reads customer
 * sessions or creates a public route. The final Docker-patched Render service
 * hashes "adms_" + 64 lowercase hex bearer sessions with SHA-256.
 * No fallback ADMIN_TOKEN, no cookies, and no customer Pitlane privileges.
 * Do not import this into public Worker until admin login, audit and mobile
 * app permissions have been integrated, tested, and approved.
 */
const encoder=new TextEncoder();
const bearer=/^Bearer (adms_[a-f0-9]{64})$/;
export async function adminSessionHash(token) {
  if(typeof token!=="string"||!/^adms_[a-f0-9]{64}$/.test(token))
    throw Error("invalid_session_token");
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(token)));
  return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function denied(error,status=401){return {ok:false,error,status};}
function originAllowed(request,env) {
  const origin=request.headers.get("Origin");
  if(!origin)return true; // native app may not send Origin; bearer still mandatory
  const allowed=String(env.ADMIN_ALLOWED_ORIGINS||env.SITE_ORIGIN||"").split(",")
    .map(x=>x.trim()).filter(x=>x.startsWith("https://"));
  // No wildcard or substring-match; every authorised origin must be exact.
  return allowed.includes(origin);
}
export async function verifyOwnerSession(request,env,{now=new Date()}={}) {
  if(!env?.DB || !env.ADMIN_OWNER_USERNAME ||
      !Number.isFinite(now?.getTime?.()))return denied("admin_not_configured",503);
  if(!originAllowed(request,env))return denied("origin_forbidden",403);
  const raw=request.headers.get("Authorization")||"";
  const parsed=bearer.exec(raw);
  if(!parsed)return denied("unauthorized");
  const hash=await adminSessionHash(parsed[1]);
  let row;
  try {
    row=await env.DB.prepare(
      "SELECT username,expires_at,revoked_at FROM admin_sessions "+
      "WHERE token_hash=?1 AND revoked_at IS NULL AND expires_at>?2 LIMIT 1"
    ).bind(hash,now.toISOString()).first();
  } catch {return denied("admin_database_unavailable",503);}
  if(!row || row.revoked_at || typeof row.expires_at!=="string" ||
      !Number.isFinite(Date.parse(row.expires_at)) ||
      Date.parse(row.expires_at)<=now.getTime())
    return denied("unauthorized");
  if(typeof row.username!=="string" ||
      row.username.toLowerCase()!==String(env.ADMIN_OWNER_USERNAME).toLowerCase())
    return denied("owner_scope_required",403);
  return {ok:true,username:row.username,session_hash:hash};
}
