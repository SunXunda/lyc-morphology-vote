"use strict";
const $=id=>document.getElementById(id),labels={Merger:"并合迹象",No_visible_merger:"未见并合迹象",Uncertain:"无法判断"};
let D=null,user=null,csrf="",votes=new Map(),view=[],selected="",busy=false,sessionInfo={};
const TOKEN_KEY="lyc-vote-session-v1";
let token="";try{token=localStorage.getItem(TOKEN_KEY)||"";}catch{}
function rememberToken(value){token=value||"";try{token?localStorage.setItem(TOKEN_KEY,token):localStorage.removeItem(TOKEN_KEY);}catch{}}
const API=window.LYC_CONFIG.apiOrigin;
async function request(url,options={}){
 const headers={...(options.headers||{})};
 if(token)headers.Authorization="Bearer "+token;
 if(options.method&&options.method!=="GET")headers["Content-Type"]="application/json";
 let resp;try{resp=await fetch(API+url,{credentials:"omit",...options,headers});}
 catch(e){throw new Error("未收到共享存储确认；请恢复连接后刷新记录，核对这次判断是否保存。");}
 if(!resp.ok){const data=await resp.json().catch(()=>({error:"共享存储没有返回可用内容。"}));const err=new Error(data.error||"请求失败");err.status=resp.status;err.data=data;if(resp.status===401)rememberToken("");throw err;}
 return resp;
}
async function api(url,options={}){return (await request(url,options)).json();}
async function catalog(){
 const files=await Promise.all(["objects","papers","summary"].map(async n=>{
 const r=await fetch("./"+n+".json");if(!r.ok)throw new Error("目录加载失败，请刷新网页。");return r.json();}));
 return {dataset:"lyc-morphology-114-20261016-v1",objects:files[0],papers:files[1],summary:files[2]};
}
async function download(url){
 try{const r=await request(url),blob=await r.blob();const name=r.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1]||url.split("/").pop();
 const a=document.createElement("a"),blobURL=URL.createObjectURL(blob);a.href=blobURL;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(blobURL),30000);}
 catch(e){status(e.message,true);$("matrixStatus").textContent=e.message;}
}
function pdf(p){return "https://arxiv.org/pdf/"+p.arxiv;}
function status(s,error=false){$("saveStatus").textContent=s;$("saveStatus").classList.toggle("error",error);}
function notice(s){$("notice").hidden=!s;$("notice").textContent=s;}
function anchor(label,href){const a=document.createElement("a");a.textContent=label;a.href=href;a.target="_blank";a.rel="noopener";return a;}
function current(){return D?.objects.find(o=>o.id===selected);}
function own(id=selected){return votes.get(id);}
function progress(){const n=D.objects.filter(o=>o.priority&&own(o.id)?.vote).length;$("progress").textContent=user?"我的进度 "+n+" / 75 · 已同步":"先看图，填写用户名后保存判断";}
function lock(value){busy=value;document.querySelectorAll("[data-vote],#saveNotes,#clearVote,#prev,#next,#sourceSelect,#filter,#search,#refreshVotes,#logout").forEach(b=>b.disabled=value);if(!value)navState();}
function navState(){const i=view.findIndex(o=>o.id===selected);$("prev").disabled=i<=0;$("next").disabled=i<0||i>=view.length-1;document.querySelectorAll("[data-vote],#saveNotes,#clearVote").forEach(b=>b.disabled=!selected||!!sessionInfo.preview_only);}
function updateAuth(){
 $("authOpen").hidden=!!user||sessionInfo.preview_only;$("logout").hidden=!user;$("userBadge").hidden=!user;
 $("userBadge").textContent=user?user.username:"";
 $("adminBtn").hidden=!user;$("myExport").hidden=!user;$("importLabel").hidden=!user;
 if(sessionInfo.preview_only)notice("这是只读布局预览。正式部署后，参与者填写自己的用户名即可投票。");
}
function filterView(prefer=selected){
 const f=$("filter").value,q=$("search").value.trim().toLowerCase();
 view=D.objects.filter(o=>(f==="all"||f==="priority"&&o.priority||f==="unvoted"&&o.priority&&!own(o.id)?.vote||f==="unclassified"&&o.previous==="Unclassified"||f==="ambiguous"&&o.previous==="Ambiguous")&&(o.id+" "+o.catalogue).toLowerCase().includes(q));
 $("sourceSelect").replaceChildren();view.forEach(o=>{const opt=document.createElement("option");opt.value=o.id;opt.textContent=o.id+" · "+o.catalogue;$("sourceSelect").append(opt);});
 selected=view.some(o=>o.id===prefer)?prefer:view[0]?.id||"";$("sourceSelect").value=selected;render();progress();
}
function render(){
 const o=current(),i=view.findIndex(o=>o.id===selected);$("position").textContent=o?(i+1)+" / "+view.length:"0 / 0";navState();
 $("existing").open=false;$("imageGallery").replaceChildren();$("paperLinks").replaceChildren();
 if(!o){$("objectTitle").textContent="当前筛选没有目标";$("objectMeta").textContent="";$("existingText").textContent="";$("notes").value="";$("confidence").value="";paintVote();status("");return;}
 $("objectTitle").textContent=o.id;$("objectMeta").textContent=o.catalogue+(o.z?" · z = "+Number(o.z).toFixed(3):"");
 $("imageGallery").classList.toggle("single",o.images.length===1);
 for(const [i,im]of o.images.entries()){
  const card=document.createElement("figure");card.className="image-card";
  const title=document.createElement("div");title.className="image-heading";title.textContent=(o.images.length>1?(i===0?"a · ":"b · "):"")+im.label;
  const button=document.createElement("button");button.className="image-stage";button.title="点击放大 "+o.id;
  const image=document.createElement("img");image.src="./"+im.path;image.alt=o.id+" — "+im.bands;if((im.path.includes("/cos/")||im.path.startsWith("images_cos_")))image.className="pixel";
  image.onerror=()=>status("图片加载失败，请刷新页面或联系组织者。",true);
  button.append(image);button.onclick=()=>{$("zoomTitle").textContent=o.id+" · "+im.bands;$("zoomImage").src=image.src;$("zoomImage").alt=image.alt;$("zoomImage").className=image.className;$("zoom").showModal();};
  const cap=document.createElement("figcaption"),bands=document.createElement("div");bands.className="bands";bands.textContent=im.bands;
  const links=document.createElement("div");links.className="image-links";const p=D.papers.find(p=>p.arxiv===im.paper);
  if(p)links.append(anchor("原文 · p."+im.page,pdf(p)+"#page="+im.page));links.append(anchor("原始来源",im.source),anchor("完整图片","./"+im.path));
  const detail=document.createElement("details"),sum=document.createElement("summary"),note=document.createElement("p"),credit=document.createElement("p");sum.textContent="图像与视场说明";note.textContent=im.note;credit.className="credit";credit.textContent=im.credit+" · "+im.figure;detail.append(sum,note,credit);
  if(im.raw)detail.append(anchor("原始 FITS",im.source));cap.append(bands,links,detail);card.append(title,button,cap);$("imageGallery").append(card);
 }
 o.papers.forEach(id=>{const p=D.papers.find(p=>p.arxiv===id);if(p)$("paperLinks").append(anchor(p.authors+" · "+p.arxiv,pdf(p)));});
 $("existingText").textContent="原表："+o.previous+(o.published_votes?"；文献 "+o.published_votes+" / 24 票为 merger":"")+(o.caveat?"。"+o.caveat:"");
 const r=own();$("notes").value=r?.notes||"";$("confidence").value=r?.confidence||"";paintVote();
 status(!user?"填写用户名后，判断会保存到共享存储。":r?.vote?"已保存："+labels[r.vote]:"尚未投票。");
}
function paintVote(){document.querySelectorAll("[data-vote]").forEach(b=>{const active=b.dataset.vote===own()?.vote;b.classList.toggle("active",active);b.querySelector(".check").textContent=active?"✓":"";});}
async function loadVotes(){if(!user){votes.clear();return;}const data=await api("/api/votes");votes=new Map(data.records.map(r=>[r.object_id,r]));}
async function submitVote(choice,withdraw=false){
 if(busy||!selected)return;if(!user){openAuth();return;}
 const id=selected,r=own(),body={vote:choice,confidence:$("confidence").value,notes:$("notes").value,version:r?.version||0};
 lock(true);status("正在保存到共享存储…");
 try{const data=await api("/api/votes/"+encodeURIComponent(id),{method:withdraw?"DELETE":"PUT",body:JSON.stringify(body)});votes.set(id,data.record);paintVote();progress();status(withdraw?"已撤回，汇总表中此格将为空白。":"已保存到共享存储："+labels[choice]);if(withdraw){$("notes").value="";$("confidence").value="";}}
 catch(e){if(e.status===409&&e.data.current){votes.set(id,e.data.current);$("notes").value=e.data.current.notes;$("confidence").value=e.data.current.confidence;paintVote();progress();}if(e.status===401){user=null;votes.clear();updateAuth();paintVote();}status(e.message,true);}
 finally{lock(false);}
}
function next(delta){if(busy)return;const i=view.findIndex(o=>o.id===selected),o=view[i+delta];if(o){selected=o.id;$("sourceSelect").value=selected;render();}}
function openAuth(){$("authStatus").textContent="";if(!$("authDialog").open)$("authDialog").showModal();$("username").focus();}
$("authOpen").onclick=openAuth;$("authClose").onclick=()=>$("authDialog").close();
$("authForm").onsubmit=async e=>{
 e.preventDefault();$("authSubmit").disabled=true;$("authStatus").textContent="正在连接…";
 try{const r=await api("/api/enter",{method:"POST",body:JSON.stringify({username:$("username").value})});user=r.user;rememberToken(r.token);$("authDialog").close();await loadVotes();updateAuth();filterView();status("正在以 "+user.username+" 判断，记录已同步。");}
 catch(e){$("authStatus").textContent=e.message;}
 finally{$("authSubmit").disabled=false;}
};
$("logout").onclick=async()=>{if(busy)return;try{const r=await api("/api/logout",{method:"POST",body:"{}"});rememberToken(r.token);user=null;votes.clear();updateAuth();filterView();openAuth();}catch(e){status(e.message,true);}};
$("prev").onclick=()=>next(-1);$("next").onclick=()=>next(1);$("sourceSelect").onchange=()=>{selected=$("sourceSelect").value;render();};
$("filter").onchange=()=>filterView();$("search").oninput=()=>filterView();
document.querySelectorAll("[data-vote]").forEach(b=>b.onclick=()=>submitVote(b.dataset.vote));
$("saveNotes").onclick=()=>own()?.vote?submitVote(own().vote):status("先选择一个判断，再保存备注。",true);
$("clearVote").onclick=()=>own()?.vote?submitVote(null,true):status("当前没有需要撤回的判断。");
$("refreshVotes").onclick=async()=>{if(!user)return openAuth();try{await loadVotes();filterView();status("已从共享存储刷新。");}catch(e){status(e.message,true);}};
$("closeZoom").onclick=()=>$("zoom").close();
$("myExport").onclick=()=>{download("/api/exports/mine.json");};
$("importFile").onchange=async function(){
 const file=this.files[0];if(!file)return;
 try{const data=JSON.parse(await file.text());const r=await api("/api/import",{method:"POST",body:JSON.stringify(data)});await loadVotes();filterView();status("已导入 "+r.added+" 票；共享存储已有 "+r.kept_existing+" 票保留，其他用户名 "+r.skipped_other_users+" 票跳过。");}
 catch(e){status(e.message,true);}this.value="";
};
document.querySelectorAll("[data-export]").forEach(a=>{a.onclick=e=>{e.preventDefault();download("/api/exports/"+a.dataset.export);};});
async function matrix(){
 $("matrixStatus").textContent="正在获取共享存储上的全部投票…";
 try{const data=await api("/api/matrix");$("matrixStatus").textContent=data.people+" 位参与者 · "+data.votes+" 票 · 114 个源";
  const table=document.createElement("table"),head=document.createElement("thead"),tr=document.createElement("tr");data.headers.forEach(x=>{const th=document.createElement("th");th.textContent=x;tr.append(th);});head.append(tr);table.append(head);
  const tbody=document.createElement("tbody");data.rows.forEach(row=>{const tr=document.createElement("tr");row.forEach((x,i)=>{const td=document.createElement("td");td.textContent=i>=3?(labels[x]||"—"):x;if(i>=3&&x)td.className="cell-"+x;tr.append(td);});tbody.append(tr);});table.append(tbody);$("matrixTable").replaceChildren(table);
 }catch(e){$("matrixStatus").textContent=e.message;}
}
$("adminBtn").onclick=()=>{$("adminDialog").showModal();matrix();};$("reloadMatrix").onclick=matrix;$("closeAdmin").onclick=()=>$("adminDialog").close();
document.addEventListener("keydown",e=>{if(["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)||document.querySelector("dialog[open]")||busy)return;if(["1","2","3"].includes(e.key)){e.preventDefault();submitVote(["Merger","No_visible_merger","Uncertain"][+e.key-1]);}if(e.key==="ArrowRight"){e.preventDefault();next(1);}if(e.key==="ArrowLeft"){e.preventDefault();next(-1);}});
(async()=>{
 try{
  if(location.protocol==="file:")throw new Error("请通过网页网址打开此多人投票版本。");
  D=await catalog();filterView();updateAuth();
  try{
   sessionInfo=await api("/api/session");user=sessionInfo.user;if(!user)rememberToken("");
   await loadVotes();updateAuth();filterView();
  }catch(e){notice("图像可以浏览；共享投票暂未连接："+e.message);$("progress").textContent="投票存储未连接";}
 }catch(e){notice(e.message);$("progress").textContent="目录加载失败";}
})();
