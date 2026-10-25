'use strict';
// Replays the EXACT recorded command stream of one seat from a public replay,
// with unit/building IDs remapped onto the live match, so a different agent can
// be tested against the real frozen opponent's macro skeleton.
const fs=require('fs'),zlib=require('zlib'),path=require('path');
function num(id){const m=String(id).match(/(\d+)/);return m?+m[1]:0;}
function loadReplay(file){return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));}
function replayEntityIndex(j){
  const units=new Map(),buildings=new Map();
  for(const fr of j.frames){
    for(const u of fr.units)if(!units.has(u.id))units.set(u.id,{id:u.id,owner:u.owner,type:u.type,first:fr.now});
    for(const b of fr.buildings)if(!buildings.has(b.id))buildings.set(b.id,{id:b.id,owner:b.owner,type:b.type,first:fr.now});
  }
  const byKO=m=>{const out=new Map();for(const v of m.values()){const k=v.owner+'|'+v.type;if(!out.has(k))out.set(k,[]);out.get(k).push(v);}for(const a of out.values())a.sort((x,y)=>num(x.id)-num(y.id));return out;};
  return {units:byKO(units),buildings:byKO(buildings)};
}
function posOf(j,tick,id){
  const fr=j.frames[Math.min(j.frames.length-1,Math.max(0,Math.round(tick/5)))];
  return fr.units.find(u=>u.id===id)||fr.buildings.find(b=>b.id===id)||null;
}
class ReplayOpponent{
  constructor(replay,solSeat,opts={}){
    this.j=replay;this.seat=solSeat;this.opts=Object.assign({},opts);
    this.idx=replayEntityIndex(replay);
    this.map=new Map();            // replay id -> local id
    this.usedReplay=new Set();
    this.assignedLocal=new Set();
    this.tick=0;
  }
  _register(st){
    const reg=(list,idxMap)=>{
      const groups=new Map();
      for(const v of list)if(v.owner===this.seat){
        const k=v.owner+'|'+v.type;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(v);
      }
      for(const [k,arr] of groups){
        arr.sort((a,b)=>num(a.id)-num(b.id));
        const pool=idxMap.get(k)||[];
        for(const v of arr){
          if(this.assignedLocal.has(v.id))continue;
          let pick=null;
          for(const p of pool)if(!this.usedReplay.has(p.id)){pick=p;break;}
          if(pick){this.map.set(pick.id,v.id);this.usedReplay.add(pick.id);this.assignedLocal.add(v.id);}
        }
      }
    };
    reg(st.units,this.idx.units);
    reg(st.buildings,this.idx.buildings);
  }
  _posReplay(id){return posOf(this.j,this.tick,id);}
  _rewrite(st,c,mySeat){
    const out=JSON.parse(JSON.stringify(c));
    const own=id=>this.map.has(id)?this.map.get(id):id;
    if(Array.isArray(out.units))out.units=out.units.map(own);
    if(out.type==='build'){ /* building = type name, do not remap */ }
    else if(out.building)out.building=own(out.building);
    if(out.type==='cast'&&out.unit)out.unit=own(out.unit);
    if(out.target!==undefined){
      const t=out.target;
      if(this.map.has(t))out.target=this.map.get(t);
      else if(st.resources.some(r=>r.id===t)||st.nodes.some(n=>n.id===t)){/* stable resource/node ids */}
      else{
        let info=null;
        for(const fr of this.j.frames){const u=fr.units.find(u=>u.id===t);if(u){info={owner:u.owner,type:u.type};break;}const b=fr.buildings.find(b=>b.id===t);if(b){info={owner:b.owner,type:b.type};break;}}
        if(!info){delete out.target;}
        else if(info.owner<0){ if(!st.units.some(u=>u.id===t))delete out.target; }
        else{
          const rec=this._posReplay(t);
          const pool=st.units.filter(u=>u.owner===mySeat&&u.type===info.type&&u.hp>0);
          const pbp=st.buildings.filter(b=>b.owner===mySeat&&b.type===info.type&&b.hp>0);
          if(pool.length){
            let best=pool[0];
            if(rec){let bd=1e18;for(const u of pool){const d=Math.hypot(u.x-rec.x,u.y-rec.y);if(d<bd){bd=d;best=u;}}}
            out.target=best.id;
          }else if(pbp.length)out.target=pbp[0].id;
          else delete out.target;
        }
      }
    }
    return out;
  }
  decide(st,mySeat){
    const dNow=st.now;
    let d=null;
    for(const cand of this.j.decisions){if(Math.abs(cand.now-dNow)<0.13){d=cand;break;}}
    if(!d)return [];
    this.tick=d.tick;
    this._register(st);
    const myUnits=new Set(st.units.filter(u=>u.owner===this.seat).map(u=>u.id));
    const myBlds=new Set(st.buildings.filter(b=>b.owner===this.seat).map(b=>b.id));
    const cmds=[];
    for(const c of (d.commands[this.seat]||[])){
      const r=this._rewrite(st,c,mySeat);
      if(Array.isArray(r.units)&&r.type!=='build'&&r.units.some(id=>!myUnits.has(id)))continue;
      if(r.type==='build'&&Array.isArray(r.units)&&r.units.some(id=>!myUnits.has(id)))continue;
      if(r.building&&typeof r.building==='string'&&r.type!=='build'&&!myBlds.has(r.building))continue;
      if(r.type==='cast'&&r.unit&&!myUnits.has(r.unit))continue;
      cmds.push(r);
    }
    // optional adaptive defence: when enemies close in on its hall, a real
    // defender drops its scripted movement and throws every unit at them.
    if(this.opts.defenseOverlay){
      const th=st.buildings.find(b=>b.owner===this.seat&&b.type==='townhall');
      if(th){
        const intruders=st.units.filter(u=>u.owner===mySeat&&u.hp>0&&Math.hypot(u.x-th.x,u.y-th.y)<this.opts.defenseOverlay);
        if(intruders.length){
          const keep=['build','train','research','summon','revive','gather','rally'];
          const macro=cmds.filter(c=>keep.includes(c.type));
          const fighters=st.units.filter(u=>u.owner===this.seat&&u.hp>0&&u.type!=='worker');
          const combat=[];
          for(const u of fighters){
            let best=null,bd=1e18;
            for(const e of intruders){const dd=Math.hypot(e.x-u.x,e.y-u.y);if(dd<bd){bd=dd;best=e;}}
            if(best)combat.push({type:'attackMove',units:[u.id],x:Math.round(best.x),y:Math.round(best.y)});
          }
          return [...macro,...combat].slice(0,20);
        }
      }
    }
    return cmds.slice(0,20);
  }
}
module.exports={ReplayOpponent,loadReplay,replayEntityIndex};
