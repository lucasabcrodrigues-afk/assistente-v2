/**
 * Multi-tenant Auth + Admin Console (Ctrl+L)
 * - Login: user+pass -> /api/login -> stores token and sets cloud sync token
 * - Data isolation: overrides server save/load functions to use tenant token
 * - Hidden console: Ctrl+L -> phrase "senhor das estrelas,acernitro,rx9070xt" + PIN -> admin panel
 *
 * Integration: include this file AFTER your main ERP scripts in index.html
 */
(function(){
  const API_BASE = ""; // same-origin
  const SESSION_KEY = "ERP_TENANT_SESSION_V1";
  const ADMIN_CACHE_KEY = "ERP_ADMIN_SESSION_V1";

  const css = `
  .ta-overlay{position:fixed;inset:0;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;z-index:999999}
  .ta-card{width:min(520px,92vw);background:#111;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:18px 18px 14px;color:#fff;box-shadow:0 20px 70px rgba(0,0,0,.55)}
  .ta-title{font-size:18px;font-weight:800;margin:0 0 10px}
  .ta-row{display:flex;gap:10px}
  .ta-row > *{flex:1}
  .ta-input{width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#fff;outline:none}
  .ta-btn{padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.12);color:#fff;cursor:pointer;font-weight:700}
  .ta-btn:hover{background:rgba(255,255,255,.18)}
  .ta-muted{opacity:.78;font-size:12px;line-height:1.35}
  .ta-error{color:#ffb4b4;font-size:13px;margin-top:8px}
  .ta-ok{color:#b4ffcf;font-size:13px;margin-top:8px}
  .ta-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .ta-table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
  .ta-table th,.ta-table td{border-bottom:1px solid rgba(255,255,255,.12);padding:8px 6px;text-align:left;vertical-align:top}
  .ta-chip{display:inline-block;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.14);font-size:11px}
  .ta-danger{background:rgba(255,60,60,.18);border-color:rgba(255,60,60,.35)}
  `;

  function injectStyle(){
    if(document.getElementById("tenant-auth-style")) return;
    const st=document.createElement("style");
    st.id="tenant-auth-style";
    st.textContent=css;
    document.head.appendChild(st);
  }

  function safeJsonParse(s, fallback=null){
    try{ return JSON.parse(s); }catch{ return fallback; }
  }

  function getSession(){
    return safeJsonParse(localStorage.getItem(SESSION_KEY), null);
  }

  function setSession(s){
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }

  function clearSession(){
    localStorage.removeItem(SESSION_KEY);
  }

  /**
   * Configura o token de nuvem para o ERP.
   * Além de atualizar os sinalizadores globais e o metadado do banco, este método
   * instala o módulo de atualização com uma chave de armazenamento específica
   * para o cliente (ERP_<TOKEN>). Isso garante que cada empresa tenha seu
   * próprio banco local isolado no navegador. Caso o módulo Update não esteja
   * carregado, a chamada é ignorada silenciosamente.
   * @param {string} token Token da empresa/cliente
   */
  function setCloudToken(token){
    try{
      window.UPDATE_FLAGS = window.UPDATE_FLAGS || {};
      window.UPDATE_FLAGS.enableCloudSync = true;
      window.UPDATE_FLAGS.cloudToken = token;
      // define storageKey específico para o tenant
      const upper = String(token || '').toUpperCase();
      if(window.Update && typeof Update.install === 'function'){
        try {
          Update.install({ storageKey: 'ERP_' + upper });
        } catch(_e) {
          console.warn('Falha ao instalar Update com chave personalizada:', _e);
        }
      }
      // também salva no meta do DB se disponível
      const db = (window.Update && Update.storage && Update.storage.db_core && Update.storage.db_core.get) ? Update.storage.db_core.get() : null;
      if(db){
        db._meta = db._meta || {};
        db._meta.cloudToken = token;
      }
    }catch(err){
      console.warn('setCloudToken: erro ao configurar token', err);
    }
  }

  /**
   * Simple HTTP wrapper used throughout the ERP to communicate with the backend.
   *
   * When running in a standalone or demo environment (e.g. via file:// or
   * during development without a back‑end), this function provides a
   * lightweight in‑memory stub for the admin API endpoints. The goal is to
  * preserve the behaviour of the hidden admin console without requiring an
   * actual server. The stub intercepts all requests to the `/api/admin/*`
   * endpoints regardless of the protocol or host (including sites hosted on
   * Cloudflare Pages). It accepts only the new secret phrase
   * "senhor das estrelas,acernitro,rx9070xt" (case‑insensitive) and treats the
   * PIN "0" as valid. Client records are stored in a module‑scoped array and can be
   * created, updated and blocked via the admin panel. Requests to other
   * endpoints (e.g. `/api/login`, `/api/data`) continue to be forwarded to
   * whatever back‑end is configured via `API_BASE` when present.
   */
  const __adminClients = [];
  // Persistência local de clientes e bancos (modo desenvolvimento). Em ambiente
  // `file://` ou `localhost`, não há back‑end disponível. Para possibilitar
  // testes offline, armazenamos a lista de clientes e os bancos por token
  // no localStorage usando chaves distintas. Em produção, estes dados são
  // ignorados porque as requisições são encaminhadas ao back‑end em
  // Cloudflare KV.
  const CLIENTS_STORAGE_KEY = 'ERP_TA_CLIENTS_V1';
  const DB_STORAGE_PREFIX   = 'ERP_TA_DB_';
  const __tenantDbs = {};

  /**
   * Carrega a lista de clientes persistida no localStorage. Retorna um array
   * vazio se nada estiver salvo ou se o JSON estiver corrompido.
   */
  function loadSavedClients(){
    try {
      const raw = localStorage.getItem(CLIENTS_STORAGE_KEY);
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch(_e) {
      return [];
    }
  }

  /**
   * Salva a lista atual de clientes no localStorage. Esta operação
   * sobrescreve o valor anterior.
   */
  function saveClients(){
    try {
      localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(__adminClients));
    } catch(_e){}
  }

  /**
   * Carrega todos os bancos de dados salvos no localStorage. Cada DB é
   * armazenado sob a chave `ERP_TA_DB_<TOKEN>`. O resultado é armazenado em
   * __tenantDbs para rápido acesso.
   */
  function loadAllDbs(){
    try {
      for(const k in localStorage){
        if(!Object.prototype.hasOwnProperty.call(localStorage, k)) continue;
        if(k.startsWith(DB_STORAGE_PREFIX)){
          const token = k.slice(DB_STORAGE_PREFIX.length).toLowerCase();
          try {
            const payload = JSON.parse(localStorage.getItem(k));
            if(payload && typeof payload === 'object' && payload.db){
              __tenantDbs[token] = { db: payload.db, meta: payload.meta || {}, savedAt: payload.savedAt || null };
            }
          } catch(_e){}
        }
      }
    } catch(_e){}
  }

  /**
   * Salva o banco de dados de um determinado token no localStorage. O banco
   * é serializado em JSON e armazenado sob a chave ERP_TA_DB_<TOKEN>.
   * @param {string} token Token da empresa
   * @param {object} db Objeto de banco de dados
   * @param {object} meta Metadados opcionais
   */
  function saveDb(token, db, meta={}){
    try {
      const key = DB_STORAGE_PREFIX + String(token || '').toUpperCase();
      const payload = { db, meta, savedAt: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(payload));
      __tenantDbs[String(token || '').toLowerCase()] = { db, meta, savedAt: payload.savedAt };
    } catch(_e){}
  }

  // Ao inicializar o script, carregamos clientes e DBs salvos para modo local.
  (function(){
    const isLocalEnv = (function(){
      try {
        const loc = window.location || {};
        const host = (loc.hostname || '').toLowerCase();
        const proto = (loc.protocol || '').toLowerCase();
        return proto === 'file:' || host === 'localhost' || host === '127.0.0.1';
      } catch(_e) {
        return false;
      }
    })();
    if(isLocalEnv){
      try {
        const saved = loadSavedClients();
        if(saved && saved.length){
          __adminClients.splice(0, __adminClients.length, ...saved);
        }
        loadAllDbs();
      } catch(_e){}
    }
  })();
  // Prepopulate with a default admin client. This ensures that when running
  // locally or without a back‑end, a base client record is available for
  // demonstration and management. The token is kept in lower‑case to match
  // the request from the project owner.
  // Seed the internal admin client for local/demo usage.  This
  // matches the production defaults (token b1, user admin, pass 123) and
  // is flagged as internal/admin so that the UI can decorate it.
  __adminClients.push({ token: "b1", user: "admin", pass: "123", startMonth: "", dueMonth: "", blocked: false, internal: true, admin: true });
  async function api(path, {method="GET", body=null, headers={}}={}){
    // Local stub: intercept /api/admin/* when no back‑end is available. The
    // stub only activates when the current protocol is file:// or when the
    // host is localhost/127.0.0.1. In these cases, network requests would
    // otherwise fail. For any other environment the request is forwarded
    // directly to the configured API base.
    // Always use the in‑memory stub for admin endpoints. Regardless of host or protocol,
    // we intercept all /api/admin requests. This ensures the admin panel functions
    // even when a back‑end is not available. The rest of the API requests are
    // forwarded to the server when present.
    const m = method.toUpperCase();
    // Admin endpoints: provide an in‑memory stub only when running locally
    // (file:// protocol or localhost). In production the requests are
    // forwarded to the back‑end APIs implemented in Cloudflare Workers.
    if(path.startsWith("/api/admin")){
      const loc = window.location || {};
      const host = (loc.hostname || '').toLowerCase();
      const proto = (loc.protocol || '').toLowerCase();
      const isLocal = proto === 'file:' || host === 'localhost' || host === '127.0.0.1';
      if(isLocal){
        // parse JSON body if provided as string
        const b = body || {};
        // /api/admin/verify
        if(path === "/api/admin/verify" && m === "POST"){
          const phrase = (b.phrase || "").toLowerCase().trim();
          const password = (b.password || "").trim();
          // Only accept the updated secret phrase and pin "0" in the local stub.
          const ok = (phrase === "senhor das estrelas,acernitro,rx9070xt" && password === "0");
          return { res: { ok: ok, json: async()=>({ ok }) }, data: { ok } };
        }
        // GET list of clients
        if(path === "/api/admin/clients" && m === "GET"){
          return { res: { ok: true, json: async()=>({ ok: true, clients: __adminClients }) }, data: { ok: true, clients: __adminClients } };
        }
        // POST create/update client
        if(path === "/api/admin/clients" && m === "POST"){
          const { token, user, pass, startMonth, dueMonth, blocked, prevToken } = b;
          if(!token || !user || !pass){
            return { res: { ok: false, json: async()=>({ ok: false, error: "Dados ausentes" }) }, data: { ok: false, error: "Dados ausentes" } };
          }
          // If prevToken is provided and different from token, remove the old record
          if(prevToken && prevToken !== token){
            const idxPrev = __adminClients.findIndex((c)=>c.token === prevToken);
            if(idxPrev >= 0){
              __adminClients.splice(idxPrev, 1);
            }
          }
          // find existing by current token
          const idx = __adminClients.findIndex((c)=>c.token === token);
          if(idx >= 0){
            __adminClients[idx] = { ...__adminClients[idx], user, pass, startMonth, dueMonth, blocked: !!blocked };
          }else{
            __adminClients.push({ token, user, pass, startMonth, dueMonth, blocked: !!blocked });
          }
          // Persistir clientes em modo local para sobrevivência entre recarregamentos
          saveClients();
          return { res: { ok: true, json: async()=>({ ok: true }) }, data: { ok: true } };
        }
        // POST block/unblock client
        if(path === "/api/admin/block" && m === "POST"){
          const { token, blocked } = b;
          const client = __adminClients.find((c)=>c.token === token);
          if(client){ client.blocked = !!blocked; }
          // Persistir mudanças
          saveClients();
          return { res: { ok: true, json: async()=>({ ok: true }) }, data: { ok: true } };
        }
        // POST delete client
        if(path === "/api/admin/delete" && m === "POST"){
          const { token } = b;
          const idx = __adminClients.findIndex((c)=>c.token === token);
          if(idx >= 0){ __adminClients.splice(idx, 1); }
          // Persistir alterações
          saveClients();
          return { res: { ok: true, json: async()=>({ ok: true }) }, data: { ok: true } };
        }
        // fallback stub
        return { res: { ok: false, json: async()=>({ ok: false, error: "endpoint" }) }, data: { ok: false, error: "endpoint" } };
      }
    }
    // Outros endpoints em modo local (file:// ou localhost): fornecemos
    // stubs para /api/login e /api/data para permitir testes offline. Em
    // produção esses requests são encaminhados normalmente ao servidor.
    {
      const loc = window.location || {};
      const host = (loc.hostname || '').toLowerCase();
      const proto = (loc.protocol || '').toLowerCase();
      const isLocalEnv = proto === 'file:' || host === 'localhost' || host === '127.0.0.1';
      if(isLocalEnv){
        // stub de login
        if(path === '/api/login' && m === 'POST'){
          const u = String((body?.user || '')).trim().toLowerCase();
          const p = String(body?.pass || '');
          const rec = __adminClients.find((c)=>String(c.user||'').trim().toLowerCase() === u && String(c.pass||'') === p);
          if(!rec){
            return { res: { ok: false, json: async()=>({ ok: false, error: 'Usuário ou senha inválidos.' }) }, data: { ok: false, error: 'Usuário ou senha inválidos.' } };
          }
          if(rec.blocked){
            return { res: { ok: true, json: async()=>({ ok: true, blocked: true, token: rec.token, company: rec.token, message: 'Conta bloqueada. Entre em contato com o suporte.' }) }, data: { ok: true, blocked: true, token: rec.token, company: rec.token, message: 'Conta bloqueada. Entre em contato com o suporte.' } };
          }
          return { res: { ok: true, json: async()=>({ ok: true, blocked: false, token: rec.token, company: rec.token }) }, data: { ok: true, blocked: false, token: rec.token, company: rec.token } };
        }
        // stub de data GET/POST
        if(path.startsWith('/api/data')){
          if(m === 'GET'){
            // extrai token da query
            let token = null;
            try {
              const urlObj = new URL(path, 'http://local');
              token = String(urlObj.searchParams.get('token') || '').trim().toLowerCase();
            } catch(_e) {
              token = '';
            }
            if(!token){
              return { res: { ok: false, json: async()=>({ ok: false, error: 'missing_token' }) }, data: { ok: false, error: 'missing_token' } };
            }
            const rec = __adminClients.find((c)=>c.token === token);
            if(rec && rec.blocked){
              return { res: { ok: false, json: async()=>({ ok: false, blocked: true, message: 'Conta bloqueada.' }) }, data: { ok: false, blocked: true, message: 'Conta bloqueada.' } };
            }
            const tdb = __tenantDbs[token];
            if(!tdb || !tdb.db){
              return { res: { ok: true, json: async()=>({ ok: true, exists: false, db: null }) }, data: { ok: true, exists: false, db: null } };
            }
            return { res: { ok: true, json: async()=>({ ok: true, exists: true, db: tdb.db, meta: tdb.meta || {}, savedAt: tdb.savedAt || null }) }, data: { ok: true, exists: true, db: tdb.db, meta: tdb.meta || {}, savedAt: tdb.savedAt || null } };
          }
          if(m === 'POST'){
            const t = String((body?.token || '')).trim().toLowerCase();
            const db = body?.db;
            if(!t || typeof db !== 'object'){ return { res: { ok: false, json: async()=>({ ok: false, error: 'bad_request' }) }, data: { ok: false, error: 'bad_request' } }; }
            const rec = __adminClients.find((c)=>c.token === t);
            if(rec && rec.blocked){
              return { res: { ok: false, json: async()=>({ ok: false, blocked: true, message: 'Conta bloqueada.' }) }, data: { ok: false, blocked: true, message: 'Conta bloqueada.' } };
            }
            saveDb(t, db, {});
            return { res: { ok: true, json: async()=>({ ok: true, savedAt: new Date().toISOString() }) }, data: { ok: true, savedAt: new Date().toISOString() } };
          }
        }
      }
    }
    // Normal network path: build options and forward
    const opts = { method: m, headers: { ...headers } };
    if(body){
      opts.headers["content-type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(API_BASE + path, opts);
    const data = await res.json().catch(() => ({ ok: false, error: "Resposta inválida" }));
    return { res, data };
  }

  function makeOverlay(inner){
    injectStyle();
    const ov=document.createElement("div");
    ov.className="ta-overlay";
    ov.innerHTML=inner;
    document.body.appendChild(ov);
    // Permitir fechar o overlay com a tecla Esc. O evento é adicionado
    // após um pequeno atraso para evitar capturar a tecla que abriu o overlay.
    function onKey(e){
      if(e.key === 'Escape'){
        try{
          ov.remove();
        }catch(_e){}
        document.removeEventListener('keydown', onKey);
      }
    }
    // registra após tick para não acionar imediatamente
    setTimeout(() => document.addEventListener('keydown', onKey));
    return ov;
  }

  // --- BLOCKED SCREEN ---
  function showBlocked(message){
    const ov=makeOverlay(`
      <div class="ta-card">
        <p class="ta-title">🚫 Acesso bloqueado</p>
        <p style="margin:0 0 10px">${message || "Seu serviço está bloqueado por falta de pagamento."}</p>
        <p class="ta-muted" style="margin:0">Entre em contato com o suporte para regularizar.</p>
      </div>
    `);
    // no close
    return ov;
  }

  // --- LOGIN SCREEN ---
  async function showLogin(){
    const ov=makeOverlay(`
      <div class="ta-card">
        <p class="ta-title">🔐 Login do Cliente</p>
        <div class="ta-row">
          <input id="taUser" class="ta-input" placeholder="Usuário" autocomplete="username" />
          <input id="taPass" class="ta-input" placeholder="Senha" type="password" autocomplete="current-password" />
        </div>
        <div class="ta-toolbar">
          <button id="taEnter" class="ta-btn">Entrar</button>
          <button id="taClear" class="ta-btn" title="Limpar sessão">Sair</button>
        </div>
        <div id="taMsg" class="ta-error" style="display:none"></div>
        <p class="ta-muted" style="margin:10px 0 0">
          Dica: seu token (ex.: B1, B2, B3) é associado automaticamente ao seu usuário.
        </p>
      </div>
    `);

    const $ = (id)=>ov.querySelector(id);
    const msg = $("#taMsg");
    const userEl = $("#taUser");
    const passEl = $("#taPass");

    function setMsg(text, ok=false){
      msg.style.display="block";
      msg.className = ok ? "ta-ok" : "ta-error";
      msg.textContent=text;
    }

    $("#taClear").onclick=()=>{
      clearSession();
      location.reload();
    };

    async function doLogin(){
      const user=userEl.value.trim();
      const pass=passEl.value;
      if(!user || !pass){ setMsg("Preencha usuário e senha."); return; }
      setMsg("Entrando...", true);
      try{
        const {data} = await api("/api/login", {method:"POST", body:{user, pass}});
        if(!data.ok){ setMsg(data.error || "Falha no login."); return; }
        if(data.blocked){
          setSession({ token:data.token, user, blocked:true, company:data.company, at:Date.now() });
          ov.remove();
          showBlocked(data.message);
          return;
        }
        setSession({ token:data.token, user, blocked:false, company:data.company, at:Date.now() });
        setCloudToken(data.token);
        // Após definir o token de nuvem, habilitamos os botões de salvar/carregar
        // do servidor e tentamos carregar o banco existente para o cliente. Caso
        // não exista, usamos o banco local atual como padrão e salvamos no
        // servidor. Isso garante que novos clientes tenham um banco inicial
        // funcional na primeira execução.
        try {
          overrideServerButtons(data.token);
          // consultar DB remoto
          const resp = await api('/api/data?token=' + encodeURIComponent(data.token));
          const resData = resp?.data || {};
          if (resData.ok && !resData.blocked) {
            if (resData.exists && resData.db) {
              // carregar DB existente
              if (typeof window.loadFromObject === 'function') {
                try {
                  window.loadFromObject(resData.db);
                } catch(_e) {
                  console.warn('Erro ao carregar DB do servidor:', _e);
                }
              }
            } else {
              // não existe DB: usar DB local como padrão
              const curDb = (window.Update && Update.storage && Update.storage.db_core && Update.storage.db_core.get) ? Update.storage.db_core.get() : null;
              if (curDb) {
                try {
                  await api('/api/data', { method: 'POST', body: { token: data.token, db: curDb } });
                } catch(_e) {
                  console.warn('Erro ao salvar DB inicial no servidor:', _e);
                }
              }
            }
          }
        } catch (_err) {
          console.warn('Falha ao preparar DB do cliente:', _err);
        }
        ov.remove();
        // opcional: carregar do servidor e mesclar na primeira vez
        // (mantemos apenas o login aqui para não surpreender).
      }catch(e){
        console.error(e);
        setMsg("Erro de rede ao logar.");
      }
    }

    $("#taEnter").onclick=doLogin;
    passEl.addEventListener("keydown",(e)=>{ if(e.key==="Enter") doLogin(); });
    userEl.focus();
  }

  // --- OVERRIDES: save/load server using tenant token ---
  function overrideServerButtons(token){
    // If your ERP already has these functions, we override to remove the admin prompt.
    const toast = window.toast || ((t)=>alert(t));
    window.saveToServer = async function(){
      try{
        const db = (window.Update && Update.storage && Update.storage.db_core && Update.storage.db_core.get) ? Update.storage.db_core.get() : null;
        if(!db){ toast("DB não encontrada em memória.", "bad"); return; }
        const {data} = await api("/api/data", {method:"POST", body:{token, db}});
        if(data.ok){ toast("☁️ Salvo no servidor!", "ok"); }
        else if(data.blocked){ showBlocked("Seu serviço está bloqueado por falta de pagamento."); }
        else { toast("Falha ao salvar: " + (data.error||"erro"), "bad"); }
      }catch(err){
        console.error(err);
        toast("Erro ao salvar no servidor.", "bad");
      }
    };

    window.loadFromServerReplace = async function(){
      try{
        const {data} = await api("/api/data?token=" + encodeURIComponent(token));
        if(data.blocked){ showBlocked("Seu serviço está bloqueado por falta de pagamento."); return; }
        if(!data.ok){ toast("Falha ao carregar: " + (data.error||"erro"), "bad"); return; }
        if(!data.exists || !data.db){ toast("Nenhum backup no servidor ainda.", "bad"); return; }
        if(typeof window.loadFromObject === "function"){
          window.loadFromObject(data.db);
          toast("⬇️ Carregado do servidor (substituiu).", "ok");
        }else{
          toast("Função loadFromObject não encontrada.", "bad");
        }
      }catch(err){
        console.error(err);
        toast("Erro ao carregar do servidor.", "bad");
      }
    };

    window.loadFromServerMerge = async function(){
      try{
        const {data} = await api("/api/data?token=" + encodeURIComponent(token));
        if(data.blocked){ showBlocked("Seu serviço está bloqueado por falta de pagamento."); return; }
        if(!data.ok){ toast("Falha ao carregar: " + (data.error||"erro"), "bad"); return; }
        if(!data.exists || !data.db){ toast("Nenhum backup no servidor ainda.", "bad"); return; }

        // Prefer native merge if your ERP has it; else we do a conservative merge:
        if(window.Update && Update.integrations && Update.integrations.serverSync && typeof Update.integrations.serverSync.mergeImportedFile === "function"){
          const cur = Update.storage.db_core.get();
          const result = Update.integrations.serverSync.mergeImportedFile(cur, data.db, { prefer:"current", sumStockQty:true });
          if(result && result.db && typeof window.loadFromObject === "function"){
            window.loadFromObject(result.db);
            toast("➕ Mesclado com sucesso (módulo nativo).", "ok");
          } else {
            toast("Não foi possível mesclar (módulo nativo).", "bad");
          }
          return;
        }

        // Conservative merge fallback:
        const cur = (window.Update && Update.storage && Update.storage.db_core && Update.storage.db_core.get) ? Update.storage.db_core.get() : null;
        const merged = deepMergeConservative(cur || {}, data.db || {});
        if(typeof window.loadFromObject === "function"){
          window.loadFromObject(merged);
          toast("➕ Mesclado com sucesso (fallback).", "ok");
        }else{
          toast("Função loadFromObject não encontrada.", "bad");
        }
      }catch(err){
        console.error(err);
        toast("Erro ao mesclar do servidor.", "bad");
      }
    };
  }

  // Expor funções importantes no escopo global para uso pelo ERP.
  // Isso permite que o login interno configure o token de nuvem e sobrescreva os botões de servidor.
  window.setCloudToken = setCloudToken;
  window.overrideServerButtons = overrideServerButtons;

  function isPlainObject(x){
    return x && typeof x === "object" && !Array.isArray(x);
  }

  // Conservative merge: keeps current values if conflict, merges arrays by concatenation of unique IDs when possible
  function deepMergeConservative(current, incoming){
    if(Array.isArray(current) && Array.isArray(incoming)){
      // try merge by "id" field
      const byId = new Map();
      for(const it of current){
        if(it && typeof it === "object" && "id" in it) byId.set(it.id, it);
      }
      const out = current.slice();
      for(const it of incoming){
        if(it && typeof it === "object" && "id" in it){
          if(!byId.has(it.id)) out.push(it);
        }else{
          // primitive or no id: append if not already present
          if(!out.includes(it)) out.push(it);
        }
      }
      return out;
    }
    if(isPlainObject(current) && isPlainObject(incoming)){
      const out = {...incoming, ...current}; // current wins
      for(const k of Object.keys(incoming)){
        if(k in current){
          out[k] = deepMergeConservative(current[k], incoming[k]);
        }else{
          out[k] = incoming[k];
        }
      }
      for(const k of Object.keys(current)){
        if(!(k in incoming)) out[k] = current[k];
      }
      return out;
    }
    return (current !== undefined) ? current : incoming;
  }

  // --- ADMIN PANEL ---
  function getAdminSession(){ return safeJsonParse(localStorage.getItem(ADMIN_CACHE_KEY), null); }
  function setAdminSession(s){ localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify(s)); }

  async function showAdminConsole(){
    const ov=makeOverlay(`
      <div class="ta-card">
        <p class="ta-title">🕹️ Console Oculto</p>
        <input id="taCmd" class="ta-input" placeholder="Digite um comando..." />
        <div class="ta-toolbar">
          <button id="taRun" class="ta-btn">Executar</button>
          <button id="taClose" class="ta-btn">Fechar</button>
        </div>
        <div id="taMsg" class="ta-muted" style="margin-top:10px"></div>
      </div>
    `);
    const cmd=ov.querySelector("#taCmd");
    const msg=ov.querySelector("#taMsg");
    ov.querySelector("#taClose").onclick=()=>ov.remove();
    function setMsg(t){ msg.textContent=t; }

    async function run(){
      const v=cmd.value.trim().toLowerCase();
      if(!v){ setMsg("Digite algo."); return; }
      // Validar a frase secreta. O comando deve corresponder exatamente à
      // sequência definida (ignorando diferenças de maiúsculas/minúsculas). Não
      // são aceitas abreviações ou outras grafias.
      const expectedCmd = "senhor das estrelas,acernitro,rx9070xt";
      if(v !== expectedCmd){
        setMsg("Comando desconhecido.");
        return;
      }
      // Não solicitamos mais PIN extra: ao reconhecer a frase secreta
      // concedemos acesso imediato ao painel de administração.  A frase
      // completa é registrada como "pin" da sessão apenas para manter
      // compatibilidade com o mecanismo existente que verifica a existência
      // da propriedade `pin` em getAdminSession().
      setAdminSession({ pin: v, at: Date.now() });
      ov.remove();
      await showAdminPanel();
    }

    ov.querySelector("#taRun").onclick=run;
    cmd.addEventListener("keydown",(e)=>{ if(e.key==="Enter") run(); });
    cmd.focus();
  }

  async function showAdminPanel(){
    const sess=getAdminSession();
    if(!sess?.pin){ alert("Sessão admin ausente."); return; }

    const ov=makeOverlay(`
      <div class="ta-card" style="width:min(980px,96vw);max-height:90vh;overflow:auto">
        <p class="ta-title">⭐ Painel de Clientes</p>

        <div class="ta-row">
          <input id="cUser" class="ta-input" placeholder="Usuário" />
          <input id="cPass" class="ta-input" placeholder="Senha" />
          <input id="cToken" class="ta-input" placeholder="Token (ex.: B1)" />
        </div>
        <div class="ta-row" style="margin-top:10px">
          <input id="cStart" class="ta-input" placeholder="Mês início (YYYY-MM)" />
          <input id="cDue" class="ta-input" placeholder="Mês vence (YYYY-MM)" />
          <select id="cBlocked" class="ta-input">
            <option value="0">Ativo</option>
            <option value="1">Bloqueado</option>
          </select>
        </div>

        <div class="ta-toolbar">
          <button id="btnUpsert" class="ta-btn">Cadastrar / Atualizar</button>
          <button id="btnRefresh" class="ta-btn">Atualizar Lista</button>
          <!-- Botão para cancelar modo de edição; escondido por padrão -->
          <button id="btnCancelEdit" class="ta-btn" style="display:none">Cancelar</button>
          <button id="btnClose" class="ta-btn">Fechar</button>
        </div>

        <div id="adminMsg" class="ta-muted" style="margin-top:10px"></div>


        <table class="ta-table" id="clientsTable">
          <thead>
            <tr>
              <th>Token</th>
              <th>Usuário</th>
              <th>Senha</th>
              <th>Início</th>
              <th>Vence</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>

        <p class="ta-muted" style="margin:10px 0 0">
          Observação: as senhas exibidas são aquelas cadastradas pelos usuários; proteja estas informações com cuidado.
        </p>
      </div>
    `);

    const $ = (sel)=>ov.querySelector(sel);
    const msg = $("#adminMsg");
    function setMsg(t){ msg.textContent=t; }

    // botões e controle de estado de edição
    const btnUpsert = $("#btnUpsert");
    const btnRefresh = $("#btnRefresh");
    const btnCancelEdit = $("#btnCancelEdit");
    const btnClose = $("#btnClose");
    // variáveis de estado para edição; quando editingToken não é nulo, estamos editando
    let editingToken = null;
    let lastClients = [];

    function clearForm(){
      $("#cUser").value = "";
      $("#cPass").value = "";
      $("#cToken").value = "";
      $("#cStart").value = "";
      $("#cDue").value = "";
      $("#cBlocked").value = "0";
      editingToken = null;
      btnUpsert.textContent = "Cadastrar / Atualizar";
      btnCancelEdit.style.display = "none";
    }

    function prefillForm(c){
      $("#cUser").value = c.user || "";
      $("#cPass").value = c.pass || "";
      $("#cToken").value = c.token || "";
      $("#cStart").value = c.startMonth || "";
      $("#cDue").value = c.dueMonth || "";
      $("#cBlocked").value = c.blocked ? "1" : "0";
      editingToken = c.token;
      btnUpsert.textContent = "Salvar";
      btnCancelEdit.style.display = "inline-block";
    }

    btnCancelEdit.onclick = () => {
      clearForm();
      setMsg("");
    };
    btnClose.onclick = ()=>ov.remove();

    // associa ações aos botões primários
    btnRefresh.onclick = refresh;

    // Não usamos mais token de admin; cabeçalhos permanecem vazios.
    const headers = {};

    function renderTable(list){
      const tbody=$("#clientsTable tbody");
      tbody.innerHTML="";
      for(const c of (list||[])){
        const tr=document.createElement("tr");
        // Determine if this is the internal admin client.  The server
        // marks the record with `internal` or `admin`; we fall back
        // to checking the known token "b1".  Internal/admin clients
        // cannot be edited, blocked or deleted.
        const isInternal = c.internal || c.admin || String(c.token||"").toLowerCase() === "b1";
        // Build status cell.  Admin always shows ADMIN; others show
        // ATIVO/BLOQUEADO chips.
        let statusHtml;
        if(isInternal){
          statusHtml = '<span class="ta-chip">ADMIN</span>';
        } else {
          statusHtml = c.blocked ? '<span class="ta-chip ta-danger">BLOQUEADO</span>' : '<span class="ta-chip">ATIVO</span>';
        }
        // Build actions.  Internal client shows placeholder text.
        let actions;
        if(isInternal){
          actions = '<span class="ta-muted">n/d</span>';
        } else {
          actions = `
            <button class="ta-btn" data-act="edit" data-token="${escapeAttr(c.token)}">Editar</button>
            <button class="ta-btn" data-act="block" data-token="${escapeAttr(c.token)}" data-block="${c.blocked?0:1}">
              ${c.blocked ? "Desbloquear" : "Bloquear"}
            </button>
            <button class="ta-btn" data-act="delete" data-token="${escapeAttr(c.token)}">Excluir</button>
          `;
        }
        tr.innerHTML=`
          <td><span class="ta-chip">${escapeHtml(c.token||"")}</span></td>
          <td>${escapeHtml(c.user||"")}</td>
          <td>${escapeHtml(c.pass||"******")}</td>
          <td>${escapeHtml(c.startMonth||"")}</td>
          <td>${escapeHtml(c.dueMonth||"")}</td>
          <td>${statusHtml}</td>
          <td>${actions}</td>
        `;
        tbody.appendChild(tr);
      }
      setMsg(`OK - ${list?.length||0} clientes.`);
    }

    async function refresh(){
      setMsg("Carregando...");
      // Always include the secret phrase and admin PIN via query
      // parameters on GET requests.  Without these the server will
      // return 401 because admin routes require authentication.  We
      // encode both values to handle spaces and commas.
      const phraseParam = encodeURIComponent("senhor das estrelas,acernitro,rx9070xt");
      const pwdParam    = encodeURIComponent(sess.pin || "");
      const path = `/api/admin/clients?phrase=${phraseParam}&password=${pwdParam}`;
      const {data}=await api(path, {headers});
      if(!data.ok){ setMsg("Erro: " + (data.message || data.error || "")); return; }
      lastClients = data.clients || [];
      renderTable(lastClients);
    }

    // btnRefresh is already bound above via variable; no need to reassign here
    // $("#btnRefresh").onclick=refresh;

    btnUpsert.onclick=async ()=>{
      const user=$("#cUser").value.trim();
      const pass=$("#cPass").value;
      const token=$("#cToken").value.trim();
      const startMonth=$("#cStart").value.trim();
      const dueMonth=$("#cDue").value.trim();
      const blocked=$("#cBlocked").value==="1";
      if(!user || !pass || !token){ setMsg("Preencha usuário, senha e token."); return; }
      setMsg("Salvando...");
      const {data}=await api("/api/admin/clients", {
        method:"POST",
        headers,
        body:{
          phrase:"senhor das estrelas,acernitro,rx9070xt",
          password:sess.pin,
          user, pass, token,
          startMonth, dueMonth,
          blocked,
          ...(editingToken && editingToken !== token ? { prevToken: editingToken } : {})
        }
      });
      if(!data.ok){ setMsg("Erro: " + (data.message || data.error || "")); return; }
      setMsg("Salvo/atualizado!");
      // Limpa o formulário e reseta o estado de edição
      clearForm();
      await refresh();
    };


    // Lida com cliques em botões de ação (editar/bloquear)
    ov.addEventListener("click", async (e) => {
      const btnElem = e.target.closest("button[data-act]");
      if(!btnElem) return;
      const act = btnElem.getAttribute("data-act");
      const tok = btnElem.getAttribute("data-token");
      if(act === "edit"){
        const c = lastClients.find((cl) => cl.token === tok);
        if(c) prefillForm(c);
        return;
      }
      if(act === "block"){
        const blocked = btnElem.getAttribute("data-block") === "1";
        setMsg("Atualizando...");
        const { data } = await api("/api/admin/block", {
          method: "POST",
          headers,
          body: { phrase: "senhor das estrelas,acernitro,rx9070xt", password: sess.pin, token: tok, blocked }
        });
        if(!data.ok){ setMsg("Erro: " + (data.message || data.error || "")); return; }
        setMsg(blocked ? "Bloqueado." : "Desbloqueado.");
        await refresh();
      }
      if(act === "delete"){
        // Confirmação antes de excluir
        if(!confirm(`Excluir cliente ${tok}? Esta ação não poderá ser desfeita.`)) return;
        setMsg("Excluindo...");
        const { data } = await api("/api/admin/delete", {
          method: "POST",
          headers,
          body: { phrase: "senhor das estrelas,acernitro,rx9070xt", password: sess.pin, token: tok }
        });
        if(!data.ok){ setMsg("Erro: " + (data.message || data.error || "")); return; }
        setMsg("Excluído.");
        // se estivermos editando este cliente, limpar formulário
        if(editingToken === tok){ clearForm(); }
        await refresh();
      }
    });

    await refresh();
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
  function escapeAttr(s){ return escapeHtml(s).replace(/"/g,"&quot;"); }

  // --- BOOT ---
  function boot(){
    injectStyle();
    const sess=getSession();
    // Se o usuário estiver bloqueado, exibe aviso e impede acesso.
    if(sess?.blocked){
      showBlocked("Seu serviço está bloqueado por falta de pagamento.");
      return;
    }
    // Se houver sessão salva com token, configurar automaticamente a sincronização.
    if(sess?.token){
      setCloudToken(sess.token);
      overrideServerButtons(sess.token);
    }
    // Em modo de desenvolvimento (?dev=1 ou protocolo file://) e sem sessão, gera token temporário.
    if(!sess && (window.location.search.includes('dev=1') || window.location.protocol === 'file:')){
      const devToken = 'DEV';
      try{
        localStorage.setItem(SESSION_KEY, JSON.stringify({ token: devToken, user:'dev', blocked:false, company:'dev', at:Date.now() }));
      }catch(_e){}
      setCloudToken(devToken);
      overrideServerButtons(devToken);
    }
    // registre detecção de concorrência entre abas: se o banco de dados mudar em outra aba,
    // ofereça ao usuário a possibilidade de recarregar para evitar sobrescritas silenciosas.
    try{
      const key = (window.Update && Update.config && typeof Update.config.getStorageKey === 'function') ? Update.config.getStorageKey() : null;
      if(key){
        window.addEventListener('storage', (e)=>{
          if(e.storageArea === localStorage && e.key === key){
            // Se houve modificação e não é a mesma string, notificar o usuário. Ignora valores nulos.
            if(e.oldValue && e.newValue && e.oldValue !== e.newValue){
              const promptMsg = 'Os dados foram modificados em outra aba. Deseja recarregar esta página para sincronizar?';
              if(confirm(promptMsg)){
                location.reload();
              }
            }
          }
        });
      }
    }catch(_e){}

    // Não mostrar login do cliente. O login será controlado pelo ERP.
    return;
  }

  // Ctrl+L opens hidden console
  window.addEventListener("keydown",(e)=>{
    if(e.ctrlKey && (e.key==="l" || e.key==="L")){
      e.preventDefault();
      showAdminConsole();
    }
  });

  // Start after DOM ready
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();