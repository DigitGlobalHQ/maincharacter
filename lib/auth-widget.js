/**
 * lib/auth-widget.js
 * Global account control, injected into every page's <head> (see server.js servePage),
 * so sign-in / sign-up / the signed-in name + sign-out are present site-wide and
 * identical on every surface.
 *
 * Wiring (uses the REAL auth system, invents nothing):
 *   - session  : JWT in localStorage['lookmax.token']
 *   - identity : GET /api/lookmax/me  (Bearer)  → { user: { name, email, … } }
 *   - logout   : stateless — POST /api/lookmax/auth/logout (best-effort) then drop the token
 *   - sign in  : /lookmaxing/start   ·   sign up : /lookmaxing (the reading funnel)
 *
 * Signed OUT  → "Sign In · Sign Up".
 * Signed IN   → the user's name; clicking it opens My Account / Sign Out.
 *
 * It hides the existing in-nav auth links (#nav-auth-link, #lm-nav-auth,
 * .nav__auth-link) so there is exactly one account control per page. Built on
 * design tokens, so it flips with light mode. Paired top-right with the
 * bottom-right theme toggle (no collision).
 */

const STYLE = `<style id="mc-auth-style">
.mc-auth{position:fixed;top:12px;right:14px;z-index:2147482000;font-family:'Sora',system-ui,sans-serif;display:flex;align-items:center;gap:9px}
.mc-auth__link{font-size:12px;letter-spacing:.04em;color:var(--ink-dim,#9b988f);text-decoration:none;padding:6px 3px;cursor:pointer;background:none;border:none;transition:color .2s ease}
.mc-auth__link:hover{color:var(--ink,#f4f1ea)}
.mc-auth__sep{color:var(--silver-faint,#5a5a5a);font-size:11px}
.mc-auth__name{display:inline-flex;align-items:center;gap:7px;max-width:44vw;font-family:'Sora',system-ui,sans-serif;font-size:12px;letter-spacing:.03em;color:var(--ink,#f4f1ea);background:var(--panel,#0f0f12);border:1px solid var(--line,#1d1d20);border-radius:999px;padding:6px 13px;cursor:pointer;transition:border-color .2s ease}
.mc-auth__name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-auth__name:hover{border-color:var(--silver-mid,#c0c0c0)}
.mc-auth__caret{font-size:8px;color:var(--ink-faint,#5c5a54);flex-shrink:0}
.mc-auth__menu{position:absolute;top:44px;right:0;min-width:172px;background:var(--panel,#0f0f12);border:1px solid var(--line,#1d1d20);border-radius:11px;box-shadow:0 10px 34px rgba(0,0,0,.42);padding:6px;display:none}
.mc-auth__menu.open{display:block}
.mc-auth__item{display:block;width:100%;box-sizing:border-box;text-align:left;font-family:'Sora',system-ui,sans-serif;font-size:12.5px;letter-spacing:.03em;color:var(--ink-dim,#9b988f);text-decoration:none;padding:9px 12px;border-radius:7px;background:none;border:none;cursor:pointer}
.mc-auth__item:hover{background:var(--surface-2,#1c1c21);color:var(--ink,#f4f1ea)}
@media print{.mc-auth{display:none}}
</style>`;

const SCRIPT = `<script>document.addEventListener('DOMContentLoaded',function(){try{
var K='lookmax.token';
['#nav-auth-link','#lm-nav-auth'].forEach(function(s){var e=document.querySelector(s);if(e)e.style.display='none';});
document.querySelectorAll('.nav__auth-link').forEach(function(e){e.style.display='none';});
var wrap=document.createElement('div');wrap.className='mc-auth';document.body.appendChild(wrap);
function esc(s){var d=document.createElement('div');d.textContent=(s==null?'':String(s));return d.innerHTML;}
function out(){
  wrap.innerHTML='';
  var a=document.createElement('a');a.className='mc-auth__link';a.href='/lookmaxing/start';a.textContent='Sign In';
  var sep=document.createElement('span');sep.className='mc-auth__sep';sep.textContent='\\u00B7';
  var b=document.createElement('a');b.className='mc-auth__link';b.href='/lookmaxing';b.textContent='Sign Up';
  wrap.appendChild(a);wrap.appendChild(sep);wrap.appendChild(b);
}
function signOut(){var t=null;try{t=localStorage.getItem(K)}catch(e){}try{fetch('/api/lookmax/auth/logout',{method:'POST',headers:t?{Authorization:'Bearer '+t}:{}})}catch(e){}try{localStorage.removeItem(K)}catch(e){}location.href='/';}
function inn(name){
  wrap.innerHTML='';
  var btn=document.createElement('button');btn.className='mc-auth__name';btn.type='button';btn.setAttribute('aria-haspopup','true');btn.setAttribute('aria-expanded','false');
  btn.innerHTML='<span>'+esc(name)+'</span><span class="mc-auth__caret">\\u25BC</span>';
  var menu=document.createElement('div');menu.className='mc-auth__menu';menu.setAttribute('role','menu');
  var acct=document.createElement('a');acct.className='mc-auth__item';acct.href='/lookmax/settings';acct.textContent='My Account';acct.setAttribute('role','menuitem');
  var so=document.createElement('button');so.className='mc-auth__item';so.type='button';so.textContent='Sign Out';so.setAttribute('role','menuitem');so.addEventListener('click',signOut);
  menu.appendChild(acct);menu.appendChild(so);
  btn.addEventListener('click',function(e){e.stopPropagation();var o=menu.classList.toggle('open');btn.setAttribute('aria-expanded',o?'true':'false');});
  document.addEventListener('click',function(){menu.classList.remove('open');btn.setAttribute('aria-expanded','false');});
  wrap.appendChild(btn);wrap.appendChild(menu);
}
var token=null;try{token=localStorage.getItem(K)}catch(e){}
if(!token){out();return;}
inn('Account');
fetch('/api/lookmax/me',{headers:{Authorization:'Bearer '+token}}).then(function(r){return r.ok?r.json():(r.status===401||r.status===403?'expired':null)}).then(function(d){if(d==='expired'){try{localStorage.removeItem(K)}catch(e){}out();}else if(d&&d.user){inn(d.user.name||d.user.email||'My Account');}}).catch(function(){});
}catch(e){}});</script>`;

/**
 * Head fragment: the widget style + the runtime that renders signed-in/out state.
 * @returns {string}
 */
function authWidgetHead() {
  return STYLE + SCRIPT;
}

module.exports = { authWidgetHead };
