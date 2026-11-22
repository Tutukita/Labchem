const $ = (q) => document.querySelector(q);
const lobby = $('#lobby');
const game = $('#game');
const modal = $('#modal');
const content = $('#modal-content');
const atomPool = ['H','H','H','H','C','C','O','O','N'];
const bondPool = ['—','—','—','—','═','═','≡'];

const state = {
  room: 'LAB-24', round: 1, active: 0, phase: 'choice',
  atoms: ['C','O','H'], bonds: ['—','—','═'],
  selectedAtom: null, selectedBond: null, movingToken: null, nextTokenId: 10,
  structures: {
    A:{atoms:[{id:1,element:'O',row:5,col:5,pending:false}],bonds:[],pending:0},
    B:{atoms:[{id:2,element:'H',row:5,col:5,pending:false}],bonds:[],pending:0},
    C:{atoms:[{id:3,element:'C',row:5,col:5,pending:false}],bonds:[],pending:0},
    D:{atoms:[{id:4,element:'N',row:5,col:5,pending:false}],bonds:[],pending:0}
  },
  players: [
    {name:'Andrea', color:'#315c45', credits:0, pv:0, pollution:0, flasks:[null,null,null]},
    {name:'Martín', color:'#bd6d55', credits:4, pv:5, pollution:1, flasks:['H—C≡N','O=C=O','vacío']},
    {name:'Sofi', color:'#688aa2', credits:2, pv:6, pollution:0, flasks:['H₂C=O','vacío','vacío']},
    {name:'Leo', color:'#a18454', credits:6, pv:3, pollution:2, flasks:['CH₃—C≡N','H₂O','vacío']}
  ],
  research:[
    {name:'Ácido metanoico', formula:'H—C(=O)—OH', pv:6},
    {name:'Acetonitrilo', formula:'CH₃—C≡N', pv:6}
  ]
};
const network = {role:'offline',playerIndex:0,peer:null,connection:null,connected:false,applyingRemote:false};

function starterResearch(){return [{name:'Ácido metanoico',formula:'H—C(=O)—OH',pv:6},{name:'Acetonitrilo',formula:'CH₃—C≡N',pv:6}]}
function createPlayer(name,color,connected=true){return {name,color,connected,credits:0,pv:0,pollution:0,flasks:[null,null,null],atoms:['C','O','H'],bonds:['—','—','═'],research:starterResearch()}}
function localPlayerIndex(){return network.playerIndex}
function me(){return state.players[localPlayerIndex()]||state.players[0]}
function myAtoms(){return me().atoms||(me().atoms=[])}
function myBonds(){return me().bonds||(me().bonds=[])}
function myResearch(){return me().research||(me().research=[])}
function gameReady(){return network.connected&&state.players.filter(p=>p.connected!==false).length===2}
function snapshot(){return JSON.parse(JSON.stringify(state))}
function persist(){localStorage.setItem('labchem-mvp-state',JSON.stringify(state))}
function sendState(){if(network.role==='host'&&network.connection&&network.connection.open)network.connection.send({type:'state',state:snapshot()})}
function applyRemoteState(next){network.applyingRemote=true;Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,JSON.parse(JSON.stringify(next)));persist();lobby.hidden=true;game.hidden=false;render();network.applyingRemote=false}
function peerIdForRoom(code){return 'labchem-'+String(code).toLowerCase().replace(/[^a-z0-9-]/g,'')}
function setLobbyMessage(message,isError=false){const note=$('#connection-note');if(note){note.textContent=message;note.classList.toggle('error',isError)}}
function destroyNetwork(){try{if(network.connection)network.connection.close()}catch(error){}try{if(network.peer)network.peer.destroy()}catch(error){}network.connection=null;network.peer=null;network.connected=false}

function attachConnection(connection){
  network.connection=connection;
  connection.on('open',function(){if(network.role==='guest'){setLobbyMessage('Conectado. Sincronizando la mesa…');connection.send({type:'join',name:$('#player-name').value.trim()||'Jugador 2'})}});
  connection.on('data',function(data){
    if(!data||typeof data!=='object')return;
    if(network.role==='host'&&data.type==='join'){state.players[1]=createPlayer(String(data.name||'Jugador 2').slice(0,18),'#688aa2',true);network.connected=true;render();persist();sendState();toast(state.players[1].name+' se unió a la sala.');return}
    if(network.role==='guest'&&data.type==='state'){network.connected=true;applyRemoteState(data.state);toast('Sala sincronizada. Ya pueden jugar.');return}
    if(network.role==='host'&&data.type==='proposal'&&state.active===1){applyRemoteState(data.state);sendState()}
  });
  connection.on('close',function(){network.connected=false;if(state.players[1])state.players[1].connected=false;render();toast('La otra persona se desconectó.')});
  connection.on('error',function(){toast('Hubo un problema en la conexión.')});
}

function createOnlineRoom(){
  destroyNetwork();network.role='host';network.playerIndex=0;state.room=roomCode();
  state.players=[createPlayer($('#player-name').value.trim()||'Jugador 1','#315c45'),createPlayer('Esperando jugador…','#688aa2',false)];
  state.active=0;state.phase='choice';state.selectedAtom=null;state.selectedBond=null;state.movingToken=null;
  setLobbyMessage('Creando sala…');
  const peer=new Peer(peerIdForRoom(state.room),{debug:1});network.peer=peer;
  peer.on('open',function(){lobby.hidden=true;game.hidden=false;render();persist();toast('Sala creada. Compartí el código '+state.room+'.')});
  peer.on('connection',function(connection){if(network.connection&&network.connection.open){connection.close();return}attachConnection(connection)});
  peer.on('error',function(error){setLobbyMessage(error&&error.type==='unavailable-id'?'Ese código ya está ocupado. Probá crear otra sala.':'No se pudo abrir la sala.',true);toast('No se pudo iniciar la conexión online.')});
}

function joinOnlineRoom(){
  const code=($('#room-input').value||'').trim().toUpperCase();
  if(!/^LAB-\d{4}$/.test(code))return setLobbyMessage('Ingresá un código con el formato LAB-1234.',true);
  destroyNetwork();network.role='guest';network.playerIndex=1;state.room=code;setLobbyMessage('Buscando la sala '+code+'…');
  const peer=new Peer(undefined,{debug:1});network.peer=peer;
  peer.on('open',function(){attachConnection(peer.connect(peerIdForRoom(code),{reliable:true,serialization:'json'}))});
  peer.on('error',function(){setLobbyMessage('No encontramos esa sala o la conexión fue interrumpida.',true)});
}


function save(){persist();if(network.applyingRemote||!network.connected||!network.connection||!network.connection.open)return;if(network.role==='host')sendState();else network.connection.send({type:'proposal',state:snapshot(),playerIndex:network.playerIndex});}
function randomOf(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function roomCode(){return 'LAB-'+Math.floor(1000+Math.random()*9000);}
function toast(message){ const t=$('#toast'); t.textContent=message; t.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.classList.remove('show'),2300); }

function enterRoom(code){if(code)joinOnlineRoom();else createOnlineRoom();}

function render(){
  $('#room-code').textContent=state.room;
  $('#round-number').textContent=String(state.round).padStart(2,'0');
  $('#turn-label').textContent=state.active===localPlayerIndex()?`Tu turno · Ronda ${state.round}/20`:`Turno de ${state.players[state.active].name} · Ronda ${state.round}/20`;
  $('#player-list').innerHTML=state.players.map((p,i)=>`
    <button class="player-item ${i===state.active?'active':''}" data-player="${i}">
      <span class="avatar" style="background:${p.color}">${p.name.slice(0,2).toUpperCase()}</span>
      <span class="player-meta"><b>${p.name}${i===localPlayerIndex()?' (vos)':''}</b><small>${p.credits} ¢ · polución ${p.pollution}</small></span>
      <span class="score"><b>${p.pv} PV</b><small>${p.flasks.filter(x=>x!=='vacío').length}/3 matraces</small></span>
    </button>`).join('');
  $('#atom-hand').innerHTML=myAtoms().map((a,i)=>`<button class="component-card ${i===state.selectedAtom?'selected':''}" draggable="true" title="Arrastrar átomo ${a}" data-atom="${i}">${a}</button>`).join('');
  $('#bond-hand').innerHTML=myBonds().map((b,i)=>`<button class="component-card bond-card ${i===state.selectedBond?'selected':''}" draggable="true" title="Arrastrar enlace" data-bond="${i}">${b}</button>`).join('');
  $('#hand-limit').textContent=`${myAtoms().length} / 6 átomos`;
  $('#research-count').textContent=myResearch().length;
  $('#flask-count').textContent=me().flasks.length;
  renderBoard();
  const choice=state.phase==='choice';
  const canAct=gameReady();
  const status=$('#connection-status');if(status)status.textContent=network.connected?'● 2 conectados':'○ esperando conexión';
  $('#draw-atoms').disabled=!canAct||!choice||state.active!==localPlayerIndex();
  $('#take-research').disabled=!canAct||!choice||state.active!==localPlayerIndex();
  $('#end-turn').disabled=!canAct||choice||state.active!==localPlayerIndex();
  $('#remove-token').disabled=!state.movingToken;
  $('#phase-title').textContent=choice?'Robo o investigación':'Acciones del turno';
  $('#phase-help').textContent=choice?'Elegí una opción para comenzar tu turno.':'Construí, reaccioná, vendé o investigá.';
  document.querySelectorAll('.phase-progress i').forEach((x,i)=>x.classList.toggle('active',choice?i===0:i===1));
  document.querySelectorAll('[data-player]').forEach(btn=>btn.addEventListener('click',()=>showFlasks(+btn.dataset.player)));
  document.querySelectorAll('[data-atom]').forEach(btn=>{btn.addEventListener('click',()=>selectAtom(+btn.dataset.atom));btn.ondragstart=e=>dragFromHand('atom',+btn.dataset.atom,e)});
  document.querySelectorAll('[data-bond]').forEach(btn=>{btn.addEventListener('click',()=>selectBond(+btn.dataset.bond));btn.ondragstart=e=>dragFromHand('bond',+btn.dataset.bond,e)});
  setupHandReturnZone('#atom-hand','atom');
  setupHandReturnZone('#bond-hand','bond');
}

function atomClass(atom){ return atom==='O'?'oxygen':atom==='N'?'nitrogen':atom==='C'?'carbon':'hydrogen'; }

function bondVector(angle){
  const vectors={0:[0,1],45:[1,1],90:[1,0],135:[1,-1],180:[0,-1],225:[-1,-1],270:[-1,0],315:[-1,1]};
  return vectors[((angle%360)+360)%360]||[0,1];
}

function atomAt(structure,row,col){ return structure.atoms.find(a=>a.row===row&&a.col===col); }
function bondAt(structure,row,col){ return structure.bonds.find(b=>b.row===row&&b.col===col); }
function cellOccupied(structure,row,col,ignore=null){
  return structure.atoms.some(a=>(!ignore||ignore.kind!=='atom'||a.id!==ignore.id)&&a.row===row&&a.col===col)
    ||structure.bonds.some(b=>(!ignore||ignore.kind!=='bond'||b.id!==ignore.id)&&b.row===row&&b.col===col);
}

function bondIsConnected(structure,bond){
  const [dr,dc]=bondVector(bond.angle);
  return !!atomAt(structure,bond.row-dr,bond.col-dc)&&!!atomAt(structure,bond.row+dr,bond.col+dc);
}

function atomIsConnected(structure,atom){
  return structure.bonds.some(b=>{
    const [dr,dc]=bondVector(b.angle);
    return (b.row-dr===atom.row&&b.col-dc===atom.col)||(b.row+dr===atom.row&&b.col+dc===atom.col);
  });
}

function structureIncomplete(structure){
  if(!structure.pending) return false;
  return structure.bonds.some(b=>b.pending&&!bondIsConnected(structure,b))
    ||structure.atoms.some(a=>a.pending&&!atomIsConnected(structure,a));
}

function bondOrder(type){return type==='≡'?3:type==='═'?2:1}
function atomValence(element){return {H:1,O:2,N:3,C:4}[element]||0}
function atomBondTotal(structure,atom){return structure.bonds.reduce((sum,bond)=>{const [dr,dc]=bondVector(bond.angle);const touches=(bond.row-dr===atom.row&&bond.col-dc===atom.col)||(bond.row+dr===atom.row&&bond.col+dc===atom.col);return sum+(touches?bondOrder(bond.type):0)},0)}
function structureReady(structure){
  return structure.atoms.length>1&&!structureIncomplete(structure)&&structure.atoms.every(atom=>atomIsConnected(structure,atom)&&atomBondTotal(structure,atom)===atomValence(atom.element))&&structure.bonds.every(bond=>bondIsConnected(structure,bond));
}

function recountPending(structure){
  structure.pending=structure.atoms.filter(a=>a.pending).length+structure.bonds.filter(b=>b.pending).length;
}

function pendingAtomCount(key,excludedId=null){
  return state.structures[key].atoms.filter(a=>a.pending&&a.id!==excludedId).length;
}

function canPlacePendingAtom(targetKey,moving=null){
  const targetExcluded=moving&&moving.fromKey===targetKey?moving.id:null;
  const targetAfter=pendingAtomCount(targetKey,targetExcluded)+1;
  if(targetAfter>2)return {ok:false,message:'Ninguna estructura puede recibir más de dos átomos en el mismo turno.'};
  const anotherDouble=Object.keys(state.structures).some(key=>key!==targetKey&&pendingAtomCount(key,moving&&moving.fromKey===key?moving.id:null)>=2);
  if(targetAfter===2&&anotherDouble)return {ok:false,message:'Ya usaste la colocación doble en otra estructura. En las demás solo podés colocar un átomo.'};
  return {ok:true};
}

function autoOrientBonds(structure){
  const choices=[[0,0,1],[45,1,1],[90,1,0],[135,1,-1]];
  structure.bonds.forEach(bond=>{
    const match=choices.find(([,dr,dc])=>atomAt(structure,bond.row-dr,bond.col-dc)&&atomAt(structure,bond.row+dr,bond.col+dc));
    if(match)bond.angle=match[0];
  });
}

function setupHandReturnZone(selector,kind){
  const zone=$(selector);if(!zone)return;
  zone.ondragover=e=>{e.preventDefault();zone.classList.add('return-target')};
  zone.ondragleave=()=>zone.classList.remove('return-target');
  zone.ondrop=e=>{
    e.preventDefault();zone.classList.remove('return-target');
    let data;try{data=JSON.parse(e.dataTransfer.getData('text/plain'))}catch{return}
    if(data.source!=='board'||data.kind!==kind)return toast('Soltá la ficha en su zona correspondiente.');
    state.movingToken={kind:data.kind,key:data.key,id:data.id};removeSelectedToken();
  };
}

function renderBoard(){
  Object.entries(state.structures).forEach(([key,structure])=>{
    const sector=document.querySelector('.sector[data-sector="'+key+'"]');
    if(!sector) return;
    const molecule=sector.querySelector('.molecule');
    molecule.className='molecule sector-grid';
    molecule.innerHTML=Array.from({length:100},(_,index)=>{
      const row=Math.floor(index/10)+1, col=(index%10)+1;
      const atom=atomAt(structure,row,col);
      const bond=bondAt(structure,row,col);
      const moving=atom&&state.movingToken&&state.movingToken.kind==='atom'&&state.movingToken.key===key&&state.movingToken.id===atom.id;
      const token=atom
        ? '<span draggable="'+atom.pending+'" data-token-kind="atom" data-token-id="'+atom.id+'" class="grid-atom '+atomClass(atom.element)+(atom.pending?' pending-token':'')+(moving?' moving-token':'')+'" title="'+atom.element+' · arrastrar para mover">'+atom.element+'</span>'
        : bond?'<span draggable="'+bond.pending+'" data-token-kind="bond" data-token-id="'+bond.id+'" data-angle="'+bond.angle+'" class="grid-bond '+(bond.type==='═'?'double-bond ':'single-bond ')+(bond.angle===45||bond.angle===135?'diagonal-bond ':'')+(bond.pending?'pending-token':'')+(bondIsConnected(structure,bond)?'':' incomplete-token')+'" style="--bond-angle:'+bond.angle+'deg" title="Arrastrar o hacer clic para mover"><span class="bond-mark" aria-hidden="true"></span></span>':'';
      return '<button class="grid-cell '+(token?'occupied':'')+'" data-sector="'+key+'" data-row="'+row+'" data-col="'+col+'" aria-label="Sector '+key+', fila '+row+', columna '+col+'">'+token+'</button>';
    }).join('');
    molecule.querySelectorAll('.grid-cell').forEach(cell=>{
      cell.onclick=()=>handleGridCell(key,+cell.dataset.row,+cell.dataset.col);
      cell.ondragover=e=>{e.preventDefault();cell.classList.add('drop-target')};
      cell.ondragleave=()=>cell.classList.remove('drop-target');
      cell.ondrop=e=>dropOnCell(key,+cell.dataset.row,+cell.dataset.col,e);
    });
    molecule.querySelectorAll('[data-token-kind]').forEach(token=>{
      token.ondragstart=e=>{e.stopPropagation();dragPlaced(token.dataset.tokenKind,key,+token.dataset.tokenId,e)};
    });
    const status=sector.querySelector('small');
    const incomplete=structureIncomplete(structure);
    status.textContent=structure.atoms.length===1&&!structure.pending?'Disponible':incomplete?'colocación incompleta':structure.atoms.length+' átomos · '+(structure.pending?'lista para revisar':'en progreso');
    sector.classList.toggle('has-pending',structure.pending>0);
    sector.classList.toggle('has-incomplete',incomplete);
    let capture=sector.querySelector('.capture-sector');
    if(!capture){capture=document.createElement('button');capture.className='capture-sector';capture.textContent='Solicitar captura';sector.appendChild(capture)}
    capture.hidden=!structureReady(structure);
    capture.onclick=e=>{e.stopPropagation();requestCapture(key)};
  });
}

function selectAtom(index){
  if(state.phase!=='actions') return toast('Primero elegí robo o investigación.');
  state.movingToken=null;
  state.selectedAtom=state.selectedAtom===index?null:index;
  state.selectedBond=null;
  render();
  if(state.selectedAtom!==null) toast('Elegí una casilla para el átomo, o arrastralo directamente.');
}

function selectBond(index){
  if(state.phase!=='actions') return toast('Primero elegí robo o investigación.');
  state.movingToken=null;
  state.selectedBond=state.selectedBond===index?null:index;
  state.selectedAtom=null;
  render();
  if(state.selectedBond!==null) toast('Elegí una casilla para el enlace, o arrastralo directamente.');
}

function dragFromHand(kind,index,event){
  if(state.phase!=='actions'||state.active!==localPlayerIndex()){event.preventDefault();return}
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('text/plain',JSON.stringify({source:'hand',kind,index}));
}

function dragPlaced(kind,key,id,event){
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('text/plain',JSON.stringify({source:'board',kind,key,id}));
}

function dropOnCell(key,row,col,event){
  event.preventDefault();event.stopPropagation();
  event.currentTarget.classList.remove('drop-target');
  let data;try{data=JSON.parse(event.dataTransfer.getData('text/plain'))}catch{return}
  if(data.source==='hand') placeFromHand(data.kind,data.index,key,row,col);
  else movePlaced(data.kind,data.key,data.id,key,row,col);
}

function placeFromHand(kind,index,key,row,col){
  const structure=state.structures[key];
  if(cellOccupied(structure,row,col)) return toast('Esa casilla ya está ocupada.');
  if(kind==='atom'){
    const allowance=canPlacePendingAtom(key);
    if(!allowance.ok)return toast(allowance.message);
    const element=myAtoms()[index]; if(element===undefined)return;
    structure.atoms.push({id:state.nextTokenId++,element,row,col,pending:true});
    myAtoms().splice(index,1);
  }else{
    const type=myBonds()[index]; if(type===undefined)return;
    structure.bonds.push({id:state.nextTokenId++,type,row,col,angle:0,pending:true,atomId:null});
    myBonds().splice(index,1);
  }
  recountPending(structure);autoOrientBonds(structure);
  state.selectedAtom=null;state.selectedBond=null;state.movingToken=null;
  render();save();
  toast((kind==='atom'?'Átomo':'Enlace')+' colocado en la estructura '+key+', fila '+row+', columna '+col+'.');
}

function movePlaced(kind,fromKey,id,toKey,row,col){
  const from=state.structures[fromKey],to=state.structures[toKey];
  const fromList=kind==='atom'?from.atoms:from.bonds;
  const tokenIndex=fromList.findIndex(item=>item.id===id);
  if(tokenIndex<0||!fromList[tokenIndex].pending)return toast('Solo podés mover fichas colocadas durante este turno.');
  if(cellOccupied(to,row,col,fromKey===toKey?{kind,id}:null))return toast('Esa casilla ya está ocupada.');
  if(kind==='atom'){
    const allowance=canPlacePendingAtom(toKey,{fromKey,id});
    if(!allowance.ok)return toast(allowance.message);
  }
  const [token]=fromList.splice(tokenIndex,1);
  token.row=row;token.col=col;
  const toList=kind==='atom'?to.atoms:to.bonds;
  toList.push(token);
  recountPending(from);if(from!==to)recountPending(to);
  autoOrientBonds(from);if(from!==to)autoOrientBonds(to);
  state.movingToken=null;render();save();
  toast((kind==='atom'?'Átomo':'Enlace')+' movido de '+fromKey+' a '+toKey+', fila '+row+', columna '+col+'.');
}

function rotateBond(key,id){
  const structure=state.structures[key];
  const bond=structure.bonds.find(b=>b.id===id);
  if(!bond||!bond.pending) return toast('Solo podés girar enlaces colocados durante este turno.');
  bond.angle=(bond.angle+45)%180;
  render();save();toast('Enlace girado '+bond.angle+'°.');
}

function handleGridCell(key,row,col){
  if(state.phase!=='actions'||state.active!==localPlayerIndex()) return;
  const structure=state.structures[key];
  const atom=atomAt(structure,row,col), bond=bondAt(structure,row,col);
  if(bond){
    if(!bond.pending)return toast('Ese enlace ya fue aprobado.');
    state.movingToken={kind:'bond',key,id:bond.id};
    render();
    return toast('Enlace seleccionado. Elegí otra casilla o devolvelo a la mano.');
  }
  if(atom){
    if(!atom.pending) return toast('Esa ficha ya fue aprobada.');
    state.movingToken={kind:'atom',key,id:atom.id};
    render();
    return toast('Átomo seleccionado. También podés arrastrarlo a otra casilla.');
  }
  if(state.movingToken) return movePlaced(state.movingToken.kind,state.movingToken.key,state.movingToken.id,key,row,col);
  if(state.selectedBond!==null) return placeFromHand('bond',state.selectedBond,key,row,col);
  if(state.selectedAtom!==null) return placeFromHand('atom',state.selectedAtom,key,row,col);
  toast('Arrastrá primero un enlace o un átomo desde tu mano.');
}

function removeSelectedToken(){
  const selected=state.movingToken;if(!selected)return;
  const structure=state.structures[selected.key];
  const list=selected.kind==='atom'?structure.atoms:structure.bonds;
  const index=list.findIndex(item=>item.id===selected.id);
  if(index<0||!list[index].pending)return toast('Solo podés quitar fichas colocadas durante este turno.');
  const [token]=list.splice(index,1);
  if(selected.kind==='atom')myAtoms().push(token.element);else myBonds().push(token.type);
  recountPending(structure);autoOrientBonds(structure);state.movingToken=null;render();save();toast('Ficha devuelta a tu mano.');
}

function rotateSelectedToken(){
  const selected=state.movingToken;if(!selected||selected.kind!=='bond')return;
  rotateBond(selected.key,selected.id);
}

function refillEmptyStructures(){
  Object.values(state.structures).forEach(structure=>{if(!structure.atoms.length){structure.atoms.push({id:state.nextTokenId++,element:randomOf(atomPool),row:5,col:5,pending:false});structure.bonds=[];structure.pending=0}});
}

function drawAtoms(){
  for(let i=0;i<3;i++) myAtoms().push(randomOf(atomPool));
  while(myBonds().length<myAtoms().length) myBonds().push(randomOf(bondPool));
  state.phase='actions'; render(); save();
  toast(`Robaste 3 átomos. Enlaces repuestos hasta ${myBonds().length}.`);
}

function takeResearch(){
  const options=[
    {name:'Formamida',formula:'H—C(=O)—NH₂',pv:6},
    {name:'Propanona',formula:'CH₃—C(=O)—CH₃',pv:7},
    {name:'Metanimina',formula:'H₂C=NH',pv:5}
  ];
  content.innerHTML=`<div class="modal-body"><p class="eyebrow">ELEGÍ 1 DE 3</p><h2>Nueva investigación</h2><p>Las otras dos volverán al descarte.</p><div class="research-list">${options.map((r,i)=>`<button class="research-card choose-research" data-choice="${i}"><span><b>${r.name}</b><small>${r.formula}</small></span><em>${r.pv} PV</em></button>`).join('')}</div></div>`;
  modal.showModal();
  document.querySelectorAll('.choose-research').forEach(btn=>btn.addEventListener('click',()=>{
    myResearch().push(options[+btn.dataset.choice]); state.phase='actions'; modal.close(); render(); save(); toast('Investigación incorporada. No robás átomos este turno.');
  }));
}

function endTurn(){
  const incomplete=Object.entries(state.structures).filter(([,s])=>structureIncomplete(s)).map(([key])=>key);
  if(incomplete.length)return toast('Completá o corregí las uniones pendientes en: '+incomplete.join(', ')+'.');
  let discarded=0;
  while(myAtoms().length>6){ myAtoms().pop(); discarded++; if(myBonds().length) myBonds().pop(); }
  while(myBonds().length>myAtoms().length) myBonds().pop();
  content.innerHTML=`<div class="approval"><div class="seal">✓</div><p class="eyebrow">CONTROL DE FIN DE TURNO</p><h2>Cambios enviados</h2><p>${discarded?`Se descartaron ${discarded} átomos excedentes y sus enlaces. `:''}En una partida online, los demás jugadores revisarían aquí las uniones antes de aprobar.</p><button id="approve-demo" class="primary">Simular aprobación unánime <span>→</span></button></div>`;
  modal.showModal();
  $('#approve-demo').addEventListener('click',()=>{
    modal.close(); Object.values(state.structures).forEach(s=>{s.atoms.forEach(a=>a.pending=false);s.bonds.forEach(b=>b.pending=false);s.pending=0}); state.movingToken=null; state.active=(state.active+1)%state.players.length;
    if(state.active===localPlayerIndex()) state.round=Math.min(20,state.round+1);
    state.phase='choice'; refillEmptyStructures(); render(); save(); toast('Turno aprobado.');
    if(network.role==='offline'&&state.active!==localPlayerIndex()) setTimeout(simulateOpponents,900);
  });
}

function simulateOpponents(){
  const name=state.players[state.active].name; toast(`${name} completó su turno.`);
  state.active=(state.active+1)%state.players.length;
  if(state.active===localPlayerIndex()) state.round=Math.min(20,state.round+1);
  render(); save();
  if(network.role==='offline'&&state.active!==localPlayerIndex()) setTimeout(simulateOpponents,900); else toast(`Comienza la ronda ${state.round}. Es tu turno.`);
}

function moleculeFormula(molecule){
  if(!molecule||!molecule.atoms)return '';
  const order=['C','H','N','O'];
  const counts={};
  molecule.atoms.forEach(a=>counts[a.element]=(counts[a.element]||0)+1);
  return order.filter(e=>counts[e]).map(e=>e+(counts[e]>1?counts[e]:'')).join('')||'Molécula';
}

function cloneMolecule(structure){
  return {
    atoms:structure.atoms.map(a=>({...a,pending:false})),
    bonds:structure.bonds.map(b=>({...b,pending:false})),
    pending:0
  };
}

function showFlasks(index){
  const p=state.players[index], own=index===localPlayerIndex();
  content.innerHTML='<div class="modal-body"><p class="eyebrow">'+(own?'MI LABORATORIO':'INFORMACIÓN PÚBLICA')+'</p><h2>Matraces de '+p.name+'</h2><p>'+(own?'Desde tus matraces podés seleccionar reactivos y comenzar una reacción.':'Información pública de solo lectura.')+'</p><div class="flask-grid">'+p.flasks.map((f,i)=>{
    const empty=!f||f==='vacío';
    const label=empty?'Vacío':typeof f==='string'?f:moleculeFormula(f);
    return '<div class="flask-card '+(empty?'empty-flask':'occupied-flask')+'"><small>MATRAZ '+(i+1)+'</small><div class="mini-formula">'+label+'</div>'+(own&&!empty?'<button class="flask-react-button" data-flask="'+i+'">Usar en reacción</button>':'')+'</div>';
  }).join('')+'</div>'+(own?'<button id="reaction-from-flasks" class="primary modal-primary">Seleccionar 1 o 2 reactivos <span>→</span></button>':'')+'</div>';
  modal.showModal();
  if(own){
    document.querySelectorAll('.flask-react-button').forEach(button=>button.onclick=()=>openReactionSelector([+button.dataset.flask]));
    const launch=$('#reaction-from-flasks');if(launch)launch.onclick=()=>openReactionSelector();
  }
}

function requestCapture(key){
  const structure=state.structures[key];
  if(!structureReady(structure))return toast('La estructura todavía no está conectada para solicitar captura.');
  const empty=me().flasks.map((f,i)=>(!f||f==='vacío')?i:null).filter(i=>i!==null);
  content.innerHTML='<div class="modal-body"><p class="eyebrow">CAPTURA DE MOLÉCULA</p><h2>Elegí un matraz vacío</h2><p>Los demás jugadores aprobarán la estructura antes de confirmar la captura.</p><div class="flask-grid">'+me().flasks.map((f,i)=>'<button class="flask-card capture-choice" data-flask="'+i+'" '+(empty.includes(i)?'':'disabled')+'><small>MATRAZ '+(i+1)+'</small><b>'+(empty.includes(i)?'Disponible':'Ocupado')+'</b></button>').join('')+'</div></div>';
  modal.showModal();
  document.querySelectorAll('.capture-choice:not([disabled])').forEach(button=>button.onclick=()=>approveCapture(key,+button.dataset.flask));
}

function approveCapture(key,flaskIndex){
  const structure=state.structures[key];
  content.innerHTML='<div class="approval"><div class="seal">⌛</div><p class="eyebrow">APROBACIÓN DE CAPTURA</p><h2>'+moleculeFormula(structure)+'</h2><p>La molécula pasará al matraz '+(flaskIndex+1)+' cuando todos aprueben sus uniones.</p><button id="approve-capture" class="primary">Simular aprobación unánime <span>→</span></button></div>';
  $('#approve-capture').onclick=()=>{
    me().flasks[flaskIndex]=cloneMolecule(structure);
    state.structures[key]={atoms:[],bonds:[],pending:0,captured:true};
    state.movingToken=null;modal.close();render();save();toast('Molécula capturada en el matraz '+(flaskIndex+1)+'.');
  };
}

function openReactionSelector(preselected=[]){
  const occupied=me().flasks.map((f,i)=>(f&&f!=='vacío')?i:null).filter(i=>i!==null);
  if(!occupied.length){
    content.innerHTML='<div class="approval"><div class="seal">⚗</div><h2>No hay reactivos</h2><p>Capturá primero una molécula en uno de tus matraces.</p></div>';modal.showModal();return;
  }
  content.innerHTML='<div class="modal-body"><p class="eyebrow">REACCIÓN GRATUITA</p><h2>Elegí 1 o 2 reactivos</h2><p>Podés usar una molécula o fusionar dos. Sus átomos se conservarán.</p><div class="reaction-options">'+occupied.map(i=>'<label class="reaction-option"><input type="checkbox" value="'+i+'" '+(preselected.includes(i)?'checked':'')+'><span><b>Matraz '+(i+1)+'</b><small>'+moleculeFormula(me().flasks[i])+'</small></span></label>').join('')+'</div><button id="start-reaction" class="primary modal-primary">Abrir editor de reacción <span>→</span></button></div>';
  modal.showModal();
  $('#start-reaction').onclick=()=>{
    const selected=[...document.querySelectorAll('.reaction-option input:checked')].map(i=>+i.value);
    if(selected.length<1||selected.length>2)return toast('Elegí uno o dos matraces.');
    startReaction(selected);
  };
}

function startReaction(indices){
  const atoms=[],bonds=[];let cursorCol=2,cursorRow=2;
  indices.forEach((flaskIndex,moleculeIndex)=>{
    const molecule=me().flasks[flaskIndex];
    const all=[...molecule.atoms,...molecule.bonds];
    const minRow=Math.min(...all.map(t=>t.row)),minCol=Math.min(...all.map(t=>t.col));
    const maxCol=Math.max(...all.map(t=>t.col));
    const width=maxCol-minCol+1;
    if(cursorCol+width>10){cursorCol=2;cursorRow=6}
    const idMap=new Map();
    molecule.atoms.forEach(a=>{const id=state.nextTokenId++;idMap.set(a.id,id);atoms.push({...a,id,row:a.row-minRow+cursorRow,col:a.col-minCol+cursorCol,pending:true})});
    molecule.bonds.forEach(b=>bonds.push({...b,id:state.nextTokenId++,atomId:idMap.get(b.atomId)||null,row:b.row-minRow+cursorRow,col:b.col-minCol+cursorCol,pending:true}));
    cursorCol+=width+2;
  });
  state.reaction={sourceIndices:indices,structure:{atoms,bonds,pending:atoms.length+bonds.length}};
  renderReactionEditor();
}

function renderReactionEditor(){
  const structure=state.reaction.structure;
  content.innerHTML='<div class="modal-body reaction-editor"><p class="eyebrow">EDITOR DE REACCIÓN</p><h2>Reordená el producto</h2><p>Arrastrá átomos y enlaces. Los enlaces se orientan automáticamente cuando quedan entre dos átomos. No se agregan ni eliminan átomos.</p><div id="reaction-grid" class="sector-grid reaction-grid"></div><button id="confirm-reaction" class="primary modal-primary">Solicitar aprobación del producto <span>→</span></button></div>';
  const grid=$('#reaction-grid');
  grid.innerHTML=Array.from({length:100},(_,index)=>{
    const row=Math.floor(index/10)+1,col=index%10+1;
    const atom=atomAt(structure,row,col),bond=bondAt(structure,row,col);
    const token=atom?'<span draggable="true" data-kind="atom" data-id="'+atom.id+'" class="grid-atom '+atomClass(atom.element)+'">'+atom.element+'</span>':bond?'<span draggable="true" data-kind="bond" data-id="'+bond.id+'" data-angle="'+bond.angle+'" class="grid-bond '+(bond.type==='═'?'double-bond ':'single-bond ')+(bond.angle===45||bond.angle===135?'diagonal-bond ':'')+(bondIsConnected(structure,bond)?'':'incomplete-token')+'" style="--bond-angle:'+bond.angle+'deg"><span class="bond-mark" aria-hidden="true"></span></span>':'';
    return '<button class="grid-cell '+(token?'occupied':'')+'" data-row="'+row+'" data-col="'+col+'">'+token+'</button>';
  }).join('');
  grid.querySelectorAll('[data-kind]').forEach(token=>token.ondragstart=e=>{e.stopPropagation();e.dataTransfer.setData('text/plain',JSON.stringify({kind:token.dataset.kind,id:+token.dataset.id}))});
  grid.querySelectorAll('.grid-cell').forEach(cell=>{
    cell.ondragover=e=>{e.preventDefault();cell.classList.add('drop-target')};
    cell.ondragleave=()=>cell.classList.remove('drop-target');
    cell.ondrop=e=>reactionDrop(+cell.dataset.row,+cell.dataset.col,e);
  });
  $('#confirm-reaction').onclick=confirmReaction;
}

function reactionDrop(row,col,event){
  event.preventDefault();let data;try{data=JSON.parse(event.dataTransfer.getData('text/plain'))}catch{return}
  const structure=state.reaction.structure;
  if(cellOccupied(structure,row,col,{kind:data.kind,id:data.id}))return toast('Esa casilla está ocupada.');
  const list=data.kind==='atom'?structure.atoms:structure.bonds;
  const token=list.find(t=>t.id===data.id);if(!token)return;
  token.row=row;token.col=col;autoOrientBonds(structure);renderReactionEditor();
}

function confirmReaction(){
  const structure=state.reaction.structure;
  if(!structureReady(structure))return toast('Todos los átomos y enlaces deben formar un producto conectado.');
  content.innerHTML='<div class="approval"><div class="seal">⌛</div><p class="eyebrow">APROBACIÓN DE REACCIÓN</p><h2>'+moleculeFormula(structure)+'</h2><p>Se conservaron '+structure.atoms.length+' átomos. Los demás jugadores deben aprobar el producto.</p><button id="approve-reaction" class="primary">Simular aprobación unánime <span>→</span></button></div>';
  $('#approve-reaction').onclick=()=>{
    const [target,...consumed]=state.reaction.sourceIndices;
    me().flasks[target]=cloneMolecule(structure);
    consumed.forEach(i=>me().flasks[i]=null);
    state.reaction=null;modal.close();render();save();toast('Reacción aprobada y producto guardado.');
  };
}

function showResearch(){
  content.innerHTML=`<div class="modal-body"><p class="eyebrow">INFORMACIÓN PRIVADA</p><h2>Mis investigaciones</h2><p>Solo vos podés ver estas cartas hasta que solicites completarlas.</p><div class="research-list">${myResearch().map(r=>`<div class="research-card"><span><b>${r.name}</b><small>${r.formula}</small></span><em>${r.pv} PV</em></div>`).join('')}</div></div>`;
  modal.showModal();
}

function requestSale(name){
  content.innerHTML=`<div class="approval"><div class="seal">⌛</div><p class="eyebrow">SOLICITUD DE APROBACIÓN</p><h2>${name}</h2><p>Primero deberás elegir una molécula válida de tus matraces. Luego todos los demás jugadores aprobarán la coincidencia.</p><button id="understood" class="primary">Entendido <span>→</span></button></div>`;
  modal.showModal(); $('#understood').addEventListener('click',()=>modal.close());
}

$('#create-room').addEventListener('click',createOnlineRoom);
$('#show-join').addEventListener('click',()=>{$('#join-fields').hidden=false;$('#room-input').focus();});
$('#join-room').addEventListener('click',joinOnlineRoom);
$('#draw-atoms').addEventListener('click',drawAtoms);
$('#take-research').addEventListener('click',takeResearch);
$('#end-turn').addEventListener('click',endTurn);
$('#open-research').addEventListener('click',showResearch);
$('#open-flasks').addEventListener('click',()=>showFlasks(localPlayerIndex()));
$('#open-flasks-main').addEventListener('click',()=>showFlasks(localPlayerIndex()));
$('#open-reaction').addEventListener('click',()=>openReactionSelector());
$('#remove-token').addEventListener('click',removeSelectedToken);
$('#close-modal').addEventListener('click',()=>modal.close());
$('#copy-code').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(state.room);toast('Código copiado.');}catch{toast(`Código: ${state.room}`)}});
document.querySelectorAll('.sell-button').forEach(b=>b.addEventListener('click',()=>requestSale(b.dataset.demand)));
modal.addEventListener('click',(e)=>{if(e.target===modal)modal.close();});

render();
