const SHELL='repo-runner-shell-v1';
const FILES=['./','index.html','manifest.json','icon.svg'];

let _db;
const open=()=>_db||(_db=new Promise((res,rej)=>{
  const r=indexedDB.open('repo-runner',1);
  r.onupgradeneeded=()=>{r.result.createObjectStore('files');r.result.createObjectStore('repos',{keyPath:'id'})};
  r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);
}));
const getFile=async key=>{
  const d=await open();
  return new Promise((res,rej)=>{
    const q=d.transaction('files','readonly').objectStore('files').get(key);
    q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);
  });
};

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(SHELL).then(c=>c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    for(const k of await caches.keys())if(k!==SHELL)await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  const base=new URL(self.registration.scope);
  if(u.origin!==location.origin||!u.pathname.startsWith(base.pathname))return;
  const rel=u.pathname.slice(base.pathname.length);
  if(rel.startsWith('r/')){e.respondWith(serveRepo(rel.slice(2),base.pathname));return}
  if(e.request.method!=='GET')return;
  e.respondWith(
    fetch(e.request).then(res=>{
      if(res.ok){const copy=res.clone();caches.open(SHELL).then(c=>c.put(e.request,copy))}
      return res;
    }).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('./')))
  );
});

async function serveRepo(p,basePath){
  const i=p.indexOf('/');
  if(i<0)return new Response('Not found',{status:404});
  const id=decodeURIComponent(p.slice(0,i));
  let path=decodeURIComponent(p.slice(i+1));
  if(!path||path.endsWith('/'))path+='index.html';
  let rec=await getFile(id+'/'+path);
  if(!rec&&!/\.[a-z0-9]+$/i.test(path)){
    rec=await getFile(id+'/'+path+'/index.html')||await getFile(id+'/index.html');
  }
  if(!rec)return new Response('File not found in saved project: '+path,{status:404,headers:{'Content-Type':'text/plain'}});
  if(rec.type==='text/html'){
    const prefix=basePath+'r/'+encodeURIComponent(id)+'/';
    const html=new TextDecoder().decode(rec.buf)
      .replace(/(\s(?:src|href|action)=["'])\/(?!\/)/gi,'$1'+prefix);
    return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}});
  }
  return new Response(rec.buf,{headers:{'Content-Type':rec.type}});
}
