/* PublishOS — video publication command center.
   Vanilla JS. All state in localStorage (single user). Zero fabricated metrics. */
(function(){
"use strict";

var LS_KEY = "publishos.v1";

var STAGES = [
  {id:"reference",   label:"Reference",   hint:"Collect 1–2 reference videos and lock the style match"},
  {id:"storyboard",  label:"Storyboard",  hint:"3 variants → pick a direction → lock one still per scene"},
  {id:"approval",    label:"Approval",    hint:"Every destination approved before anything ships"},
  {id:"scheduling",  label:"Scheduling",  hint:"Set a publish date/time per destination"},
  {id:"publishing",  label:"Publishing",  hint:"Publish only approved destinations"},
  {id:"measurement", label:"Measurement", hint:"Enter real metrics — never invent numbers"}
];

var DEST_TYPES = ["YouTube Shorts","YouTube Long-form","Instagram","X","WhatsApp"];
var DEST_STATUS = {
  draft:"Draft", awaiting_approval:"Awaiting approval",
  approved:"Approved", published:"Published"
};

/* ---------------- utils ---------------- */
function uid(){ return "x"+Date.now().toString(36)+Math.floor(Math.random()*1e6).toString(36); }
function esc(s){
  return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function fmtDate(ts){
  if(!ts) return "—";
  var d=new Date(ts);
  return d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
}
function fmtDateTime(ts){
  if(!ts) return "—";
  var d=new Date(ts);
  return d.toLocaleDateString(undefined,{month:"short",day:"numeric"})+", "+
         d.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});
}
function timeAgo(ts){
  if(!ts) return "";
  var s=Math.floor((Date.now()-ts)/1000);
  if(s<60) return "just now";
  if(s<3600) return Math.floor(s/60)+"m ago";
  if(s<86400) return Math.floor(s/3600)+"h ago";
  var d=Math.floor(s/86400);
  return d===1?"1 day ago":d+" days ago";
}
function daysSince(ts){ return ts? Math.floor((Date.now()-ts)/86400000) : 9999; }
function num(v){ return (v===null||v===undefined||v==="") ? null : Number(v); }
function fmtNum(v){ return v===null||v===undefined ? null : Number(v).toLocaleString(); }

/* ---------------- feedback: toasts + inline form errors ---------------- */
function toast(msg,kind){
  var w=document.getElementById("toast-wrap");
  if(!w){ w=document.createElement("div"); w.className="toast-wrap"; w.id="toast-wrap"; document.body.appendChild(w); }
  var t=document.createElement("div");
  t.className="toast "+(kind||""); t.textContent=msg;
  w.appendChild(t);
  setTimeout(function(){ t.classList.add("out"); setTimeout(function(){ t.remove(); },350); },2600);
}
function formErr(m){
  var e=document.querySelector("#modal-back .form-err");
  if(e){ e.textContent=m||""; e.style.display=m?"block":"none"; }
  else if(m){ toast(m,"err"); }
}

/* ---------------- store ---------------- */
function seed(){
  return {
    v:1,
    channels:[
      {id:"ch-bhakti", name:"Bhakti Aarti", handle:"@BhaktiAarti108",
       desc:"Hindi devotional chants & aartis", status:"active", emoji:"🪔", color:"#f5a524"},
      {id:"ch-mashi", name:"Mashi Adventures", handle:"@MashiAdventures",
       desc:"Kids superhero adventures (EN + HI)", status:"coming_soon", emoji:"🦸", color:"#2dd4bf"}
    ],
    campaigns:[],
    activity:[]
  };
}
function load(){
  try{
    var raw=localStorage.getItem(LS_KEY);
    if(!raw){ var s=seed(); localStorage.setItem(LS_KEY,JSON.stringify(s)); return s; }
    var db=JSON.parse(raw);
    if(!db.v||!db.channels) return seed();
    db.campaigns=db.campaigns||[]; db.activity=db.activity||[];
    return db;
  }catch(e){ return seed(); }
}
function save(){ try{ localStorage.setItem(LS_KEY,JSON.stringify(db)); }catch(e){} }
var db=load();

function log(text){
  db.activity.unshift({ts:Date.now(),text:text});
  db.activity=db.activity.slice(0,60);
}
function channel(id){ return db.channels.find(function(c){return c.id===id;}); }
function campaign(id){ return db.campaigns.find(function(c){return c.id===id;}); }
function stageIdx(id){ return STAGES.findIndex(function(s){return s.id===id;}); }

/* ---------------- attention engine (computed from real data only) ---------------- */
function attentionItems(){
  var items=[];
  db.campaigns.forEach(function(c){
    var ch=channel(c.channelId);
    var cname=c.title+(ch?" · "+ch.name:"");
    (c.destinations||[]).forEach(function(d){
      if(d.status==="awaiting_approval"){
        items.push({sev:"high",t:"Approval needed — "+d.type,
          s:cname+" is waiting on your review.",c:c.id,did:d.id,tab:"dest"});
      }else if(d.status==="approved" && !d.publishedAt){
        if(d.scheduledFor && d.scheduledFor<Date.now()){
          items.push({sev:"high",t:"Publish overdue — "+d.type,
            s:cname+" was scheduled for "+fmtDateTime(d.scheduledFor)+".",c:c.id,did:d.id,tab:"dest"});
        }else if(d.scheduledFor && d.scheduledFor<Date.now()+48*3600*1000){
          items.push({sev:"medium",t:"Publishing soon — "+d.type,
            s:cname+" · "+fmtDateTime(d.scheduledFor)+".",c:c.id,did:d.id,tab:"dest"});
        }else if(!d.scheduledFor){
          items.push({sev:"low",t:"Approved, not scheduled — "+d.type,
            s:cname+" is approved but has no publish slot.",c:c.id,did:d.id,tab:"dest"});
        }
      }else if(d.status==="published"){
        var m=d.metrics||{};
        var hasAny=["views","watchHours","subs","likes","comments"].some(function(k){return m[k]!==null&&m[k]!==undefined;});
        if(!hasAny && d.publishedAt && Date.now()-d.publishedAt>48*3600*1000){
          items.push({sev:"medium",t:"Metrics missing — "+d.type,
            s:cname+" published "+timeAgo(d.publishedAt)+" with no numbers entered.",c:c.id,did:d.id,tab:"metrics"});
        }else if(hasAny && m.updatedAt && Date.now()-m.updatedAt>7*86400000){
          items.push({sev:"low",t:"Metrics stale — "+d.type,
            s:cname+" numbers are "+timeAgo(m.updatedAt)+".",c:c.id,did:d.id,tab:"metrics"});
        }
        if(!d.url){
          items.push({sev:"low",t:"No public URL — "+d.type,
            s:cname+" is published but the link was never recorded.",c:c.id,did:d.id,tab:"dest"});
        }
      }
    });
    if(!(c.destinations||[]).length){
      items.push({sev:"low",t:"No destinations planned",s:cname+" has no publish destinations yet.",c:c.id,tab:"dest"});
    }
    if(daysSince(c.stageChangedAt)>7 && c.stage!=="measurement"){
      var stg=STAGES[stageIdx(c.stage)]||STAGES[0];
      items.push({sev:"low",t:"Stuck in "+stg.label,
        s:cname+" hasn't moved for "+daysSince(c.stageChangedAt)+" days.",c:c.id,tab:"stage"});
    }
  });
  var order={high:0,medium:1,low:2};
  items.sort(function(a,b){return order[a.sev]-order[b.sev];});
  return items;
}

function stageChecklist(c){
  var dests=c.destinations||[];
  return [
    {id:"reference", ok:(c.references||[]).length>0,
     label:"At least one reference saved ("+(c.references||[]).length+")"},
    {id:"storyboard", ok:!!c.storyboardLocked,
     label:c.storyboardLocked?"Storyboard direction locked":"Lock the storyboard direction"},
    {id:"approval", ok:dests.length>0 && dests.every(function(d){return d.status==="approved"||d.status==="published";}),
     label:dests.length? dests.filter(function(d){return d.status==="approved"||d.status==="published";}).length+"/"+dests.length+" destinations approved" : "Add destinations to approve"},
    {id:"scheduling", ok:dests.length>0 && dests.every(function(d){return !!d.scheduledFor;}),
     label:dests.length? dests.filter(function(d){return d.scheduledFor;}).length+"/"+dests.length+" destinations scheduled" : "Add destinations to schedule"},
    {id:"publishing", ok:dests.length>0 && dests.every(function(d){return d.status==="published";}),
     label:dests.length? dests.filter(function(d){return d.status==="published";}).length+"/"+dests.length+" destinations published" : "Add destinations to publish"},
    {id:"measurement", ok:dests.length>0 && dests.filter(function(d){return d.status==="published";}).every(function(d){
        var m=d.metrics||{};return ["views","watchHours","subs","likes","comments"].some(function(k){return m[k]!==null&&m[k]!==undefined;});}),
     label:"Real metrics entered for published destinations"}
  ];
}

/* ---------------- views ---------------- */
var ui={view:"dashboard", campaignId:null, channelFilter:"all", openDest:null, destTab:"dest"};

function pill(st){ return '<span class="pill '+st+'">'+DEST_STATUS[st]+"</span>"; }

function renderDashboard(){
  var attn=attentionItems();
  var camps=ui.channelFilter==="all"?db.campaigns:db.campaigns.filter(function(c){return c.channelId===ui.channelFilter;});
  var counts=STAGES.map(function(s){
    return {s:s,n:camps.filter(function(c){return c.stage===s.id;}).length};
  });
  var total=camps.length;
  var publishedDests=0;
  db.campaigns.forEach(function(c){(c.destinations||[]).forEach(function(d){if(d.status==="published")publishedDests++;});});

  var h="";
  h+='<div class="hero"><div><div class="hero-t">One pipeline for every video.</div>'
    +'<div class="hero-s">Reference → storyboard → approval → scheduling → publishing → measurement. Nothing ships without your explicit approval.</div></div>'
    +'<button class="btn btn-primary" onclick="App.newCampaign()">+ New campaign</button></div>';
  h+='<div class="section-title"><h2>⚡ Attention queue</h2><span class="count">'+attn.length+'</span></div>';
  if(!attn.length){
    h+='<div class="empty"><div class="big">🧘</div>Nothing needs you right now.<br>Every destination is approved, published, or measured — or there\'s nothing in flight yet.</div>';
  }else{
    h+='<div class="attn">'+attn.slice(0,12).map(function(a){
      return '<div class="attn-item sev-'+a.sev+'" data-kb tabindex="0" role="button" onclick="App.openCampaign(\''+a.c+'\',\''+a.tab+'\',\''+(a.did||"")+'\')">'
        +'<div class="attn-dot"></div><div><div class="t">'+esc(a.t)+'</div><div class="s">'+esc(a.s)+'</div></div>'
        +'<div class="go">›</div></div>';
    }).join("")+'</div>';
  }

  h+='<div class="section-title"><h2>Pipeline</h2><span class="count">'+total+' campaigns</span><div class="spacer"></div>'
    +'<div class="filter-pills">'
    +'<button class="fpill'+(ui.channelFilter==="all"?" active":"")+'" onclick="App.setFilter(\'all\')">All channels</button>'
    +db.channels.filter(function(c){return c.status==="active";}).map(function(c){
      return '<button class="fpill'+(ui.channelFilter===c.id?" active":"")+'" onclick="App.setFilter(\''+c.id+'\')">'+esc(c.emoji+" "+c.name)+'</button>';
    }).join("")+'</div></div>';
  h+='<div class="pipeline">'+counts.map(function(x){
    return '<div class="stage-cell'+(x.n>0?" done":"")+'" data-kb tabindex="0" role="button" aria-label="'+x.s.label+' — '+x.n+' campaigns" onclick="App.gotoCampaigns(\''+x.s.id+'\')">'
      +'<div class="n">'+x.n+'</div><div class="l">'+x.s.label+'</div></div>';
  }).join("")+'</div>';

  h+='<div class="section-title"><h2>Channels</h2></div><div class="grid grid-2">';
  db.channels.forEach(function(c){
    var n=db.campaigns.filter(function(x){return x.channelId===c.id;}).length;
    h+='<div class="card channel-card'+(c.status==="coming_soon"?" soon":"")+'">'
      +'<div class="channel-ava" style="background:'+c.color+'22;border:1px solid '+c.color+'55">'+c.emoji+'</div>'
      +'<div><div class="nm">'+esc(c.name)+'</div><div class="hd">'+esc(c.handle)+' · '+esc(c.desc)+'</div>'
      +'<div class="hd">'+n+' campaign'+(n===1?"":"s")+'</div></div>'
      +'<div style="margin-left:auto">'+(c.status==="active"?'<span class="live-badge">Live</span>':'<span class="soon-badge">Coming soon</span>')+'</div></div>';
  });
  h+='</div>';

  h+='<div class="section-title"><h2>Shipped</h2></div><div class="grid grid-3">'
    +'<div class="card"><div class="stat-num">'+publishedDests+'</div><div class="stat-lbl">Destinations published</div></div>'
    +'<div class="card"><div class="stat-num">'+db.campaigns.filter(function(c){return c.stage==="measurement";}).length+'</div><div class="stat-lbl">Campaigns in measurement</div></div>'
    +'<div class="card"><div class="stat-num">'+attn.filter(function(a){return a.sev==="high";}).length+'</div><div class="stat-lbl">High-priority items</div></div></div>';

  h+='<div class="section-title"><h2>Recent activity</h2></div>';
  if(!db.activity.length){ h+='<div class="empty">No activity yet. Create your first campaign to get the pipeline moving.</div>'; }
  else{
    h+='<div class="card"><div class="activity">'+db.activity.slice(0,10).map(function(a){
      return '<div class="activity-item"><div>'+esc(a.text)+'</div><div class="tm">'+timeAgo(a.ts)+'</div></div>';
    }).join("")+'</div></div>';
  }
  return h;
}

function renderCampaigns(filterStage){
  var list=db.campaigns.slice().sort(function(a,b){return b.createdAt-a.createdAt;});
  if(ui.channelFilter!=="all") list=list.filter(function(c){return c.channelId===ui.channelFilter;});
  if(filterStage) list=list.filter(function(c){return c.stage===filterStage;});
  var h='<div class="section-title"><h2>Campaigns</h2><span class="count">'+list.length+'</span><div class="spacer"></div>'
    +'<div class="toolbar"><div class="filter-pills">'
    +'<button class="fpill'+(ui.channelFilter==="all"?" active":"")+'" onclick="App.setFilter(\'all\')">All</button>'
    +db.channels.filter(function(c){return c.status==="active";}).map(function(c){
      return '<button class="fpill'+(ui.channelFilter===c.id?" active":"")+'" onclick="App.setFilter(\''+c.id+'\')">'+esc(c.name)+'</button>';
    }).join("")+'</div>'
    +'<button class="btn btn-primary" onclick="App.newCampaign()">+ New campaign</button></div></div>';
  if(filterStage){
    var st=STAGES[stageIdx(filterStage)];
    h+='<div class="toolbar" style="margin-bottom:12px"><span style="color:var(--muted);font-size:13px">Filtered: <b style="color:var(--text)">'+st.label+'</b></span>'
      +'<button class="btn btn-sm btn-ghost" onclick="App.gotoCampaigns()">Clear</button></div>';
  }
  if(!list.length){
    h+='<div class="empty"><div class="big">🎬</div>No campaigns here yet.<br>Each video is a campaign: reference → storyboard → approval → scheduling → publishing → measurement.'
      +'<div class="cta"><button class="btn btn-primary" onclick="App.newCampaign()">+ Create campaign</button></div></div>';
  }else{
    h+=list.map(function(c){
      var ch=channel(c.channelId);
      var si=stageIdx(c.stage);
      var pct=Math.round(si/(STAGES.length-1)*100);
      var dests=c.destinations||[];
      var pub=dests.filter(function(d){return d.status==="published";}).length;
      return '<div class="camp-row" data-kb tabindex="0" role="button" onclick="App.openCampaign(\''+c.id+'\')">'
        +'<span class="camp-kind '+(c.kind||"short")+'">'+(c.kind==="longform"?"Long":"Short")+'</span>'
        +'<div><div class="camp-title">'+esc(c.title)+'</div>'
        +'<div class="camp-sub">'+esc(ch?ch.name:"")+' · '+dests.length+' destination'+(dests.length===1?"":"s")+' · '+pub+' published · updated '+timeAgo(c.updatedAt||c.createdAt)+'</div></div>'
        +'<div class="camp-stage"><div class="camp-sub" style="color:var(--text);font-weight:650">'+STAGES[si].label+'</div>'
        +'<div class="mini-bar"><i style="width:'+pct+'%"></i></div></div>'
        +'<div class="go" style="color:var(--faint);font-size:20px">›</div></div>';
    }).join("");
  }
  return h;
}

function destHtml(c,d){
  var open=ui.openDest===d.id;
  var m=d.metrics||{};
  var metricDefs=[["views","Views"],["watchHours","Watch hrs"],["subs","New subs"],["likes","Likes"],["comments","Comments"]];
  var h='<div class="dest'+(open?" open":"")+'">'
    +'<div class="dest-head" data-kb tabindex="0" role="button" aria-expanded="'+open+'" onclick="App.toggleDest(\''+d.id+'\')">'
    +'<div style="flex:1"><div class="dest-name">'+esc(d.type)+'</div>'
    +'<div class="dest-meta">'
    +(d.scheduledFor?("🗓 "+fmtDateTime(d.scheduledFor)+" · "):"")
    +(d.url?('<a href="'+esc(d.url)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">public link ↗</a> · '):"")
    +(d.approvedAt?("approved "+timeAgo(d.approvedAt)):(d.status==="draft"?"not sent for approval yet":DEST_STATUS[d.status]))
    +'</div></div>'+pill(d.status)+'</div>'
    +'<div class="dest-body"><div class="dest-inner">'
    +'<div class="kv">'
    +'<div class="k">Title</div><div class="v'+(d.title?"":" missing")+'">'+(d.title?esc(d.title):"not set")+'</div>'
    +'<div class="k">Description</div><div class="v'+(d.description?"":" missing")+'">'+(d.description?esc(d.description):"not set")+'</div>'
    +'<div class="k">Thumbnail</div><div class="v'+(d.thumbnailNote?"":" missing")+'">'+(d.thumbnailNote?esc(d.thumbnailNote):"not set")+'</div>'
    +'</div>'
    +'<div class="dest-actions">';
  if(d.status==="draft") h+='<button class="btn btn-sm" onclick="App.sendForApproval(\''+c.id+'\',\''+d.id+'\')">Send for approval</button>';
  if(d.status==="awaiting_approval") h+='<button class="btn btn-sm btn-primary" onclick="App.reviewApproval(\''+c.id+'\',\''+d.id+'\')">Review &amp; approve</button>';
  if(d.status==="approved") h+='<button class="btn btn-sm btn-teal" onclick="App.markPublished(\''+c.id+'\',\''+d.id+'\')">Mark as published</button>';
  h+='<button class="btn btn-sm btn-ghost" onclick="App.editDestination(\''+c.id+'\',\''+d.id+'\')">Edit content</button>'
    +'<button class="btn btn-sm btn-ghost" onclick="App.editMetrics(\''+c.id+'\',\''+d.id+'\')">Enter metrics</button>'
    +'<button class="btn btn-sm btn-ghost" onclick="App.scheduleDest(\''+c.id+'\',\''+d.id+'\')">Schedule</button>'
    +'<button class="btn btn-sm btn-danger" onclick="App.deleteDestination(\''+c.id+'\',\''+d.id+'\')">Remove</button>'
    +'</div>'
    +'<div class="metric-grid">'+metricDefs.map(function(md){
      var v=fmtNum(m[md[0]]);
      return '<div class="metric"><div class="mv'+(v===null?" nodata":"")+'">'+(v===null?"no data yet":v)+'</div><div class="ml">'+md[1]+'</div></div>';
    }).join("")+'</div>'
    +(m.updatedAt?'<div style="font-size:11.5px;color:var(--faint);margin-top:8px">Metrics last updated '+timeAgo(m.updatedAt)+'</div>':"")
    +'</div></div></div>';
  return h;
}

function renderDetail(){
  var c=campaign(ui.campaignId);
  if(!c){ ui.view="campaigns"; return renderCampaigns(); }
  var ch=channel(c.channelId);
  var si=stageIdx(c.stage);
  var checks=stageChecklist(c);
  var dests=c.destinations||[];
  var h='<div class="backlink" data-kb tabindex="0" role="button" onclick="App.gotoCampaigns()">‹ All campaigns</div>'
    +'<div class="detail-head"><span class="camp-kind '+(c.kind||"short")+'">'+(c.kind==="longform"?"Long-form":"Short")+'</span>'
    +'<h1>'+esc(c.title)+'</h1><div class="spacer"></div>'
    +'<button class="btn btn-sm" onclick="App.editCampaign(\''+c.id+'\')">Edit</button>'
    +'<button class="btn btn-sm btn-danger" onclick="App.deleteCampaign(\''+c.id+'\')">Delete</button></div>'
    +'<div style="color:var(--muted);font-size:13.5px;margin-bottom:6px">'+esc(ch?ch.emoji+" "+ch.name:"")+' · created '+fmtDate(c.createdAt)+'</div>'
    +'<div class="stepper">'+STAGES.map(function(s,i){
      var cls=i<si?"done":(i===si?"current":"");
      return '<div class="step '+cls+'" data-kb tabindex="0" role="button" aria-label="Go to '+s.label+'" onclick="App.setStage(\''+c.id+'\',\''+s.id+'\')">'
        +'<div class="bubble">'+(i<si?"✓":(i+1))+'</div><div class="lbl">'+s.label+'</div></div>';
    }).join("")+'</div>'
    +'<div class="card" style="margin-bottom:16px"><h3>'+STAGES[si].label+' <span style="color:var(--faint);font-weight:500;font-size:13px">— '+esc(STAGES[si].hint)+'</span></h3>'
    +'<ul class="checklist">'+checks.map(function(k){
      return '<li class="'+(k.ok?"ok":"")+'"><span class="box">✓</span><span>'+esc(k.label)+'</span></li>';
    }).join("")+'</ul>'
    +'<div class="toolbar" style="margin-top:6px">'
    +(si<STAGES.length-1?'<button class="btn btn-primary btn-sm" onclick="App.advanceStage(\''+c.id+'\')">Advance to '+STAGES[si+1].label+' →</button>':"")
    +(si>0?'<button class="btn btn-sm btn-ghost" onclick="App.setStage(\''+c.id+'\',\''+STAGES[si-1].id+'\')">‹ Back to '+STAGES[si-1].label+'</button>':"")
    +'</div></div>';

  h+='<div class="section-title"><h2>🔗 References</h2><span class="count">'+(c.references||[]).length+'</span><div class="spacer"></div>'
    +'<button class="btn btn-sm" onclick="App.addReference(\''+c.id+'\')">+ Add</button></div>';
  if(!(c.references||[]).length){ h+='<div class="empty" style="padding:18px">No references saved. Paste 1–2 reference links to lock the style match.</div>'; }
  else{
    h+='<div class="card">'+c.references.map(function(r){
      return '<div class="activity-item"><div><b>'+esc(r.label||"Reference")+'</b><br><a href="'+esc(r.url)+'" target="_blank" rel="noopener" style="font-size:12.5px">'+esc(r.url)+'</a></div>'
        +'<button class="btn btn-sm btn-ghost" style="margin-left:auto" onclick="App.delReference(\''+c.id+'\',\''+r.id+'\')">Remove</button></div>';
    }).join("")+'</div>';
  }

  h+='<div class="section-title"><h2>🎞 Storyboard</h2><div class="spacer"></div>'
    +'<button class="btn btn-sm'+(c.storyboardLocked?" btn-ghost":" btn-teal")+'" onclick="App.toggleStoryboard(\''+c.id+'\')">'+(c.storyboardLocked?"Unlock":"Lock direction")+'</button></div>';
  h+='<div class="card"><div style="font-size:13.5px;color:var(--muted)">'+(c.storyboardLocked
    ?'✅ <span style="color:var(--ok);font-weight:650">Direction locked</span> — stills approved, ready to animate.'
    :'Not locked. Produce 3 variants, pick a direction, lock one still per scene — then lock it here.')+'</div>'
    +'<div class="field" style="margin:12px 0 0"><label>Storyboard notes</label>'
    +'<textarea class="input" id="sb-notes" placeholder="Variant picked, scene list, camera notes…">'+esc(c.storyboardNotes||"")+'</textarea></div>'
    +'<button class="btn btn-sm" style="margin-top:10px" onclick="App.saveStoryboardNotes(\''+c.id+'\')">Save notes</button></div>';

  var tab=ui.destTab;
  h+='<div class="section-title"><h2>Destinations</h2><span class="count">'+dests.length+'</span><div class="spacer"></div>'
    +'<div class="filter-pills"><button class="fpill'+(tab==="dest"?" active":"")+'" onclick="App.setDestTab(\'dest\')">Content &amp; approvals</button>'
    +'<button class="fpill'+(tab==="metrics"?" active":"")+'" onclick="App.setDestTab(\'metrics\')">Metrics</button></div>'
    +'<button class="btn btn-sm" onclick="App.addDestination(\''+c.id+'\')">+ Add destination</button></div>';
  if(!dests.length){
    h+='<div class="empty"><div class="big">📡</div>No destinations yet.<br>Add where this video ships — YouTube Shorts, long-form, Instagram, X, WhatsApp.'
      +'<div class="cta"><button class="btn btn-primary" onclick="App.addDestination(\''+c.id+'\')">+ Add destination</button></div></div>';
  }else{
    h+=dests.map(function(d){ return destHtml(c,d); }).join("");
  }

  h+='<div class="section-title"><h2>📝 Notes</h2></div>'
    +'<div class="card"><textarea class="input" id="camp-notes" placeholder="Anything worth remembering about this campaign…">'+esc(c.notes||"")+'</textarea>'
    +'<button class="btn btn-sm" style="margin-top:10px" onclick="App.saveNotes(\''+c.id+'\')">Save notes</button></div>';
  return h;
}

/* ---------------- modal ---------------- */
function openModal(html,wide){
  closeModal();
  var back=document.createElement("div");
  back.className="modal-back"; back.id="modal-back";
  back.innerHTML='<div class="modal'+(wide?" wide":"")+'" role="dialog" aria-modal="true">'+html+'</div>';
  back.addEventListener("click",function(e){ if(e.target===back) closeModal(); });
  back.addEventListener("keydown",function(e){ /* simple focus trap */
    if(e.key!=="Tab") return;
    var els=Array.prototype.filter.call(
      back.querySelectorAll("button,input,select,textarea,a[href]"),
      function(el){ return !el.disabled && el.offsetParent!==null; });
    if(!els.length) return;
    var first=els[0], last=els[els.length-1];
    if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  });
  document.body.appendChild(back);
  setTimeout(function(){
    var f=back.querySelector("input:not([type=checkbox]),select,textarea")||back.querySelector(".btn-primary");
    if(f) f.focus();
  },30);
}
function closeModal(){ var m=document.getElementById("modal-back"); if(m) m.remove(); }
document.addEventListener("keydown",function(e){ if(e.key==="Escape") closeModal(); });
/* keyboard activation for div-based controls carrying data-kb */
document.addEventListener("keydown",function(e){
  if((e.key==="Enter"||e.key===" ") && e.target && e.target.matches && e.target.matches("[data-kb]")){
    e.preventDefault();
    e.target.click();
  }
});

function fieldVal(id){ var el=document.getElementById(id); return el?el.value.trim():""; }

/* ---------------- actions ---------------- */
var App={
  go:function(v){ ui.view=v; ui.campaignId=null; render(); window.scrollTo(0,0); },
  setFilter:function(f){ ui.channelFilter=f; render(); },
  gotoCampaigns:function(stage){ ui.view="campaigns"; ui.stageFilter=stage||null; ui.campaignId=null; render(); window.scrollTo(0,0); },
  openCampaign:function(id,tab,did){ ui.view="detail"; ui.campaignId=id; ui.openDest=did||null; if(tab) ui.destTab=tab; render(); window.scrollTo(0,0); },
  toggleDest:function(id){ ui.openDest=(ui.openDest===id?null:id); render(); },
  setDestTab:function(t){ ui.destTab=t; render(); },

  /* ----- campaigns ----- */
  newCampaign:function(){
    var opts=db.channels.filter(function(c){return c.status==="active";}).map(function(c){
      return '<option value="'+c.id+'">'+esc(c.emoji+" "+c.name)+'</option>';
    }).join("");
    openModal('<h2>New campaign</h2><div class="msub">One video, end to end: reference → storyboard → approval → scheduling → publishing → measurement.</div>'
      +'<div class="form-err"></div>'
      +'<div class="field"><label>Title</label><input class="input" id="f-title" placeholder="e.g. SH-021 — Om Gam Ganapataye Namah"></div>'
      +'<div class="row2"><div class="field"><label>Channel</label><select class="select" id="f-channel">'+opts+'</select></div>'
      +'<div class="field"><label>Format</label><select class="select" id="f-kind"><option value="short">Short</option><option value="longform">Long-form</option></select></div></div>'
      +'<div class="modal-foot"><button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>'
      +'<button class="btn btn-primary" onclick="App.saveCampaignForm()">Create campaign</button></div>');
  },
  saveCampaignForm:function(){
    var title=fieldVal("f-title");
    if(!title){ formErr("Give the campaign a title."); return; }
    var c={id:uid(),title:title,channelId:fieldVal("f-channel"),kind:fieldVal("f-kind"),
      stage:"reference",stageChangedAt:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),
      references:[],storyboardLocked:false,storyboardNotes:"",destinations:[],notes:""};
    db.campaigns.unshift(c); log("Created campaign “"+title+"”"); save(); closeModal();
    toast("Campaign created","ok");
    ui.view="detail"; ui.campaignId=c.id; render(); window.scrollTo(0,0);
  },
  editCampaign:function(id){
    var c=campaign(id); if(!c) return;
    openModal('<h2>Edit campaign</h2><div class="msub">Rename or move formats — history and destinations are kept.</div>'
      +'<div class="field"><label>Title</label><input class="input" id="f-title" value="'+esc(c.title)+'"></div>'
      +'<div class="field"><label>Format</label><select class="select" id="f-kind">'
      +'<option value="short"'+(c.kind==="short"?" selected":"")+'>Short</option>'
      +'<option value="longform"'+(c.kind==="longform"?" selected":"")+'>Long-form</option></select></div>'
      +'<div class="modal-foot"><button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>'
      +'<button class="btn btn-primary" onclick="App.saveCampaignEdit(\''+id+'\')">Save</button></div>');
  },
  saveCampaignEdit:function(id){
    var c=campaign(id); if(!c) return;
    c.title=fieldVal("f-title")||c.title; c.kind=fieldVal("f-kind");
    c.updatedAt=Date.now(); log("Edited campaign “"+c.title+"”"); save(); closeModal(); render();
  },
  deleteCampaign:function(id){
    var c=campaign(id); if(!c) return;
    if(!confirm("Delete campaign “"+c.title+"” and all its destinations? This cannot be undone.")) return;
    db.campaigns=db.campaigns.filter(function(x){return x.id!==id;});
    log("Deleted campaign “"+c.title+"”"); save();
    ui.view="campaigns"; ui.campaignId=null; render();
  },
  setStage:function(id,stage){
    var c=campaign(id); if(!c||c.stage===stage) return;
    c.stage=stage; c.stageChangedAt=Date.now(); c.updatedAt=Date.now();
    log("“"+c.title+"” → "+STAGES[stageIdx(stage)].label); save(); render();
  },
  advanceStage:function(id){
    var c=campaign(id); if(!c) return;
    var si=stageIdx(c.stage);
    if(si<STAGES.length-1) App.setStage(id,STAGES[si+1].id);
  },

  /* ----- references ----- */
  addReference:function(cid){
    openModal('<h2>Add reference</h2><div class="msub">The 1–2 videos whose style this campaign matches.</div>'
      +'<div class="form-err"></div>'
      +'<div class="field"><label>Label</label><input class="input" id="f-label" placeholder="e.g. whatships.com launch cut"></div>'
      +'<div class="field"><label>URL</label><input class="input" id="f-url" placeholder="https://…"></div>'
      +'<div class="modal-foot"><button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>'
      +'<button class="btn btn-primary" onclick="App.saveReference(\''+cid+'\')">Add reference</button></div>');
  },
  saveReference:function(cid){
    var c=campaign(cid); if(!c) return;
    var url=fieldVal("f-url");
    if(!url){ formErr("Paste the reference URL."); return; }
    c.references.push({id:uid(),label:fieldVal("f-label")||"Reference",url:url});
    c.updatedAt=Date.now(); log("Added reference to “"+c.title+"”"); save(); closeModal();
    toast("Reference added","ok"); render();
  },
  delReference:function(cid,rid){
    var c=campaign(cid); if(!c) return;
    c.references=c.references.filter(function(r){return r.id!==rid;});
    c.updatedAt=Date.now(); save(); render();
  },

  /* ----- storyboard / notes ----- */
  toggleStoryboard:function(cid){
    var c=campaign(cid); if(!c) return;
    c.storyboardLocked=!c.storyboardLocked; c.updatedAt=Date.now();
    log("“"+c.title+"” storyboard "+(c.storyboardLocked?"locked":"unlocked")); save(); render();
  },
  saveStoryboardNotes:function(cid){
    var c=campaign(cid); if(!c) return;
    c.storyboardNotes=fieldVal("sb-notes"); c.updatedAt=Date.now(); save();
    log("Saved storyboard notes on “"+c.title+"”"); toast("Notes saved","ok"); render();
  },
  saveNotes:function(cid){
    var c=campaign(cid); if(!c) return;
    c.notes=fieldVal("camp-notes"); c.updatedAt=Date.now(); log("Saved notes on “"+c.title+"”");
    toast("Notes saved","ok"); save(); render();
  },

  /* ----- destinations ----- */
  addDestination:function(cid){
    var c=campaign(cid); if(!c) return;
    var used=(c.destinations||[]).map(function(d){return d.type;});
    var opts=DEST_TYPES.filter(function(t){return used.indexOf(t)<0;})
      .map(function(t){return '<option>'+t+'</option>';}).join("");
    if(!opts){ toast("All destination types are already added.","err"); return; }
    openModal('<h2>Add destination</h2><div class="msub">Where this video ships. Content can be edited any time before approval.</div>'
      +'<div class="form-err"></div>'
      +'<div class="field"><label>Destination</label><select class="select" id="f-dtype">'+opts+'</select></div>'
      +'<div class="field"><label>Title (exact outgoing)</label><input class="input" id="f-dtitle" placeholder="Exact title as it will appear"></div>'
      +'<div class="field"><label>Description (exact outgoing)</label><textarea class="input" id="f-ddesc" placeholder="Exact description, hashtags included"></textarea></div>'
      +'<div class="field"><label>Thumbnail note</label><input class="input" id="f-dthumb" placeholder="What the thumbnail shows / file name"></div>'
      +'<div class="modal-foot"><button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>'
      +'<button class="btn btn-primary" onclick="App.saveDestForm(\''+cid+'\')">Add destination</button></div>');
  },
  saveDestForm:function(cid){
    var c=campaign(cid); if(!c) return;
    c.destinations.push({id:uid(),type:fieldVal("f-dtype"),status:"draft",
      title:fieldVal("f-dtitle"),description:fieldVal("f-ddesc"),thumbnailNote:fieldVal("f-dthumb"),
      scheduledFor:null,approvedAt:null,publishedAt:null,url:"",metrics:{}});
    c.updatedAt=Date.now(); log("Added "+fieldVal("f-dtype")+" to “"+c.title+"”"); save(); closeModal();
    toast("Destination added","ok");
    ui.openDest=c.destinations[c.destinations.length-1].id; render();
  },
  editDestination:function(cid,did){
    var c=campaign(cid); if(!c) return;
    var d=c.destinations.find(function(x){return x.id===did;}); if(!d) return;
    if(d.status==="published" && !confirm("This destination is already published. Edit the recorded content anyway?")) return;
    openModal('<h2>Edit — '+esc(d.type)+'</h2><div class="msub">Editing resets nothing, but re-approval is required if it was already approved.</div>'
      +'<div class="form-err"></div>'
      +'<div class="field"><label>Title (exact outgoing)</label><input class="input" id="f-dtitle" value="'+esc(d.title)+'"></div>'
      +'<div class="field"><label>Description (exact outgoing)</label><textarea class="input" id="f-ddesc">'+esc(d.description)+'</textarea></div>'
      +'<div class="field"><label>Thumbnail note</label><input class="input" id="f-dthumb" value="'+esc(d.thumbnailNote)+'"></div>'
      +'<div class="modal-foot"><button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>'
      +'<button class="btn btn-primary" onclick="App.saveDestEdit(\''+cid+'\',\''+did+'\')">Save</button></div>');
  },
  saveDestEdit:function(cid,did){
    var c=campaign(cid); if(!c) return;
    var d=c.destinations.find(function(x){return x.id===did;}); if(!d) return;
    var changed=(d.title!==fieldVal("f-dtitle")||d.description!==fieldVal("f-ddesc")||d.thumbnailNote!==fieldVal("f-dthumb"));
    d.title=fieldVal("f-dtitle"); d.description=fieldVal("f-ddesc"); d.thumbnailNote=fieldVal("f-dthumb");
    if(changed && d.status==="approved"){ d.status="awaiting_approval"; d.approvedAt=null; log("Content changed on "+d.type+" — sent back for approval"); }
    c.updatedAt=Date.now(); save(); closeModal(); toast("Destination updated","ok"); render();
  },
  deleteDestination:function(cid,did){
    var c=campaign(cid); if(!c) return;
    var d=c.destinations.find(function(x){return x.id===did;}); if(!d) return;
    if(!confirm("Remove "+d.type+" from “"+c.title+"”?")) return;
    c.destinations=c.destinations.filter(function(x){return x.id!==did;});
    c.updatedAt=Date.now(); log("Removed "+d.type+" from “"+c.title+"”"); save(); render();
  },
  sendForApproval:function(cid,did){
    var c=campaign(cid); if(!c) return;
    var d=c.destinations.find(function(x){return x.id===did;}); if(!d) return;
    if(!d.title){ toast("Set the exact outgoing title before sending for approval.","err"); return; }
    d.status="awaiting_approval"; c.updatedAt=Date.now();
    log(d.type+" sent for approval — “"+c.title+"”"); save();
    toast("Sent for approval","ok");
    ui.openDest=did; render();
  },

  /* ----- the approval gate ----- */
  reviewApproval:function(cid,did){
    var c=campaign(cid); if(!c) return;
    var d=c.destinations.find(function(x){return x.id===did;}); if(!d) return;
    openModal('<h2>Approve — '+esc(d.type)+'</h2>'
      +'<div class="msub">Standing rule: <b style="color:var(--text)">nothing ships without explicit per-item approval.</b> Review the exact outgoing content below, then tap approve.</div>'
      +'<div class="approval-box"><div class="fl">Title</div><div class="fv">'+(d.title?esc(d.title):'<span style="color:var(--faint)">not set</span>')+'</div></div>'
      +'<div class="approval-box"><div class="fl">Description</div><div class="fv">'+(d.description?esc(d.description):'<span style="color:var(--faint)">not set</span>')+'</div></div>'
      +'<div class="approval-box"><div class="fl">Thumbnail</div><div class="thumb-note"><div class="thumb-swatch">'+(d.thumbnailNote?esc(d.thumbnailNote):"no note")+'</div>'
      +'<div class="fv" style="font-size:13px;color:var(--muted)">'+(d.thumbnailNote?esc(d.thumbnailNote):"No thumbnail note recorded.")+'</div></div></div>'
      +(d.scheduledFor?'<div style="font-size:13px;color:var(--muted);margin-top:8px">🗓 Scheduled: <b style="color:var(--text)">'+fmtDateTime(d.scheduledFor)+'</b></div>':"")
      +'<label class="checkline"><input type="checkbox" id="f-review" onchange="document.getElementById(\'btn-approve\').disabled=!this.checked">'
      +'<span class="t">I have reviewed the exact outgoing title, description and thumbnail above. Approve this specific publish.</span></label>'
      +'<div class="modal-foot"><button class="btn btn-ghost" onclick="App.closeModal()">Not yet</button>'
      +'<button class="btn btn-primary" id="btn-approve" disabled onclick="App.confirmApproval(\''+cid+'\',\''+did+'\')">Approve this publish</button></div>',true);
  },
  confirmApproval:function(cid,did){
    var c=campaign(cid); if(!c) return;
    var d=c.destinations.find(function(x){return x.id===did;}); if(!d) return;
    d.status="approved"; d.approvedAt=Date.now(); c.updatedAt=Date.now();
    log("Approved "+d.type+" — “"+c.title+"”"); save(); closeModal();
    toast("Approved — ready to schedule & publish","ok");
    ui.openDest=did; render();
  },
  markPublished:function(cid,did){
    var c=campaign(cid); if(!c) return;
    var d=c.destinations.find(function(x){return x.id===did;}); if(!d) return;
    openModal('<h2>Mark as published — '+esc(d.type)+'</h2>'
      +'<div class="msub">Only approved destinations can be marked published. Paste the live public URL.</div>'
      +'<div class="form-err"></div>'
      +'<div class="field"><label>Public URL</label><input class="input" id="f-url" placeholder="https://…" value="'+esc(d.url||"")+'"></div>'
      +'<div class="modal-foot"><button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>'
      +'<button class="btn btn-teal" onclick="App.confirmPublished(\''+cid+'\',\''+did+'\')">Mark published</button></div>');
  },
  confirmPublished:function(cid,did){
    var c=campaign(cid); if(!c) return;
    var d=c.destinations.find(function(x){return x.id===did;}); if(!d) return;
    var url=fieldVal("f-url");
    if(!url){ formErr("Paste the public URL so the publish is verifiable."); return; }
    d.status="published"; d.publishedAt=Date.now(); d.url=url; c.updatedAt=Date.now();
    log("Published "+d.type+" — “"+c.title+"”"); save(); closeModal();
    toast("Marked as published","ok");
    ui.openDest=did; render();
  },
  scheduleDest:function(cid,did){
    var c=campaign(cid); if(!c) return;
    var d=c.destinations.find(function(x){return x.id===did;}); if(!d) return;
    var cur=d.scheduledFor?new Date(d.scheduledFor).toISOString().slice(0,16):"";
    openModal('<h2>Schedule — '+esc(d.type)+'</h2><div class="msub">Pick the publish slot. The attention queue will flag it when due.</div>'
      +'<div class="form-err"></div>'
      +'<div class="field"><label>Publish date &amp; time</label><input class="input" type="datetime-local" id="f-when" value="'+cur+'"></div>'
      +'<div class="modal-foot"><button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>'
      +'<button class="btn btn-primary" onclick="App.confirmSchedule(\''+cid+'\',\''+did+'\')">Save slot</button></div>');
  },
  confirmSchedule:function(cid,did){
    var c=campaign(cid); if(!c) return;
    var d=c.destinations.find(function(x){return x.id===did;}); if(!d) return;
    var v=fieldVal("f-when");
    if(!v){ formErr("Pick a date and time."); return; }
    d.scheduledFor=new Date(v).getTime(); c.updatedAt=Date.now();
    log("Scheduled "+d.type+" for "+fmtDateTime(d.scheduledFor)); save(); closeModal();
    toast("Publish slot saved","ok");
    ui.openDest=did; render();
  },

  /* ----- metrics (real numbers only) ----- */
  editMetrics:function(cid,did){
    var c=campaign(cid); if(!c) return;
    var d=c.destinations.find(function(x){return x.id===did;}); if(!d) return;
    var m=d.metrics||{};
    function inp(k,l){ return '<div class="field"><label>'+l+'</label><input class="input" type="number" min="0" id="m-'+k+'" value="'+(m[k]===null||m[k]===undefined?"":m[k])+'" placeholder="—"></div>'; }
    openModal('<h2>Metrics — '+esc(d.type)+'</h2>'
      +'<div class="msub">Enter <b style="color:var(--text)">real, observed numbers only</b>. Leave blank what you don\'t know — it shows as “no data yet”, never as zero.</div>'
      +'<div class="row3">'+inp("views","Views")+inp("watchHours","Watch hours")+inp("subs","New subscribers")+'</div>'
      +'<div class="row2">'+inp("likes","Likes")+inp("comments","Comments")+'</div>'
      +'<div class="modal-foot"><button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>'
      +'<button class="btn btn-primary" onclick="App.saveMetrics(\''+cid+'\',\''+did+'\')">Save metrics</button></div>');
  },
  saveMetrics:function(cid,did){
    var c=campaign(cid); if(!c) return;
    var d=c.destinations.find(function(x){return x.id===did;}); if(!d) return;
    ["views","watchHours","subs","likes","comments"].forEach(function(k){
      var v=fieldVal("m-"+k);
      d.metrics[k]=(v===""?null:Math.max(0,Number(v)));
    });
    var any=["views","watchHours","subs","likes","comments"].some(function(k){return d.metrics[k]!==null;});
    d.metrics.updatedAt=any?Date.now():null;
    c.updatedAt=Date.now(); log("Updated metrics for "+d.type+" — “"+c.title+"”"); save(); closeModal();
    toast("Metrics saved","ok");
    ui.openDest=did; render();
  },

  /* ----- backup ----- */
  exportData:function(){
    var blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"});
    var a=document.createElement("a");
    a.href=URL.createObjectURL(blob); a.download="publishos-backup-"+new Date().toISOString().slice(0,10)+".json";
    a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);},5000);
    toast("Backup downloaded","ok");
  },
  importData:function(){
    var inp=document.createElement("input"); inp.type="file"; inp.accept=".json,application/json";
    inp.onchange=function(){
      var f=inp.files[0]; if(!f) return;
      var r=new FileReader();
      r.onload=function(){
        try{
          var data=JSON.parse(r.result);
          if(!data.channels||!data.campaigns) throw new Error("bad file");
          if(!confirm("Replace all PublishOS data with this backup? Current data will be overwritten.")) return;
          db=data; save(); log("Restored data from backup"); toast("Backup restored","ok"); render();
        }catch(e){ toast("That file doesn't look like a PublishOS backup.","err"); }
      };
      r.readAsText(f);
    };
    inp.click();
  },
  closeModal:function(){ closeModal(); }
};

/* ---------------- shell render ---------------- */
function render(){
  var main=document.getElementById("view");
  var tabs=document.querySelectorAll(".tab");
  tabs.forEach(function(t){ t.classList.toggle("active", t.dataset.view===ui.view || (ui.view==="detail"&&t.dataset.view==="campaigns")); });
  if(ui.view==="dashboard") main.innerHTML=renderDashboard();
  else if(ui.view==="campaigns") main.innerHTML=renderCampaigns(ui.stageFilter);
  else if(ui.view==="detail") main.innerHTML=renderDetail();
  var dc=document.getElementById("date-chip");
  if(dc) dc.textContent=new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"});
}
window.App=App;
document.addEventListener("DOMContentLoaded",render);
render();
})();
