(function(){
/* ===================== CONFIG ===================== */
const PALETTE = {
  maisons:  {hex:'7CB780', name:'Vert institutionnel O64'},
  appartements: {hex:'F18A00', name:'Orange O64'},
  tab: {hex:'457556', name:'Vert O64 foncé'},
  vefa: {hex:'9888C0', name:'Violet O64'},
  social: {hex:'A51916', name:'Rouge O64'},
  volumesTab:{hex:'0062AD', name:'Bleu O64'},
  secondaire:{hex:'708090', name:'Gris ardoise'},
  tertiaire:{hex:'7FCDE6', name:'Bleu ciel O64'}
};
const SEGMENT_LABELS = {
  maisons:'Maisons', appartements:'Appartements', tab:'Terrains TAB',
  vefa:'VEFA', social:'Logements sociaux'
};

let RAW_ROWS = [];
let COL_IDX = {};
let ANALYSIS = null; // computed result
let CHARTS = {};
let currentSegment = null;

/* ===================== UPLOAD / PARSE ===================== */
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const uploadStatus = document.getElementById('uploadStatus');
const communeSelectWrap = document.getElementById('communeSelectWrap');
const communeNameInput = document.getElementById('communeNameInput');

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });

function handleFile(file){
  uploadStatus.textContent = 'Lecture du fichier…';
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array', cellDates:false});
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, {header:1, defval:null});
      const headers = json[0].map(h => (h||'').toString().trim());
      RAW_ROWS = json.slice(1).filter(r => r && r.length && r[0] !== null);

      COL_IDX = {};
      headers.forEach((h,i) => COL_IDX[h] = i);

      const required = ['libtypbien','anneemut','valeurfonc','sbati','sterr','libniv2','typo_vendeur','typo_acquereur'];
      const missing = required.filter(c => !(c in COL_IDX));
      if (missing.length){
        uploadStatus.innerHTML = '<span style="color:var(--color-error);">Colonnes manquantes : '+missing.join(', ')+'. Vérifiez que le fichier est bien un export urbanSimul standard.</span>';
        return;
      }

      // Détection commune : le champ "adresse" est un JSON [{"adresse":"... CP Commune"}]
      let communes = new Set();
      RAW_ROWS.forEach(r => {
        let adr = r[COL_IDX['adresse']];
        if (!adr) return;
        let adrText = '';
        try {
          const parsed = JSON.parse(adr);
          if (Array.isArray(parsed) && parsed[0] && parsed[0].adresse) adrText = parsed[0].adresse;
          else adrText = ''+adr;
        } catch(e){ adrText = ''+adr; }
        const m = adrText.match(/\d{5}\s+([A-Za-zÀ-ÿ\-'\s]+?)\s*$/);
        if (m){
          const clean = m[1].trim().replace(/-/g,' ').replace(/\s+/g,' ')
            .replace(/\bSur\b/gi,'sur').replace(/\bDe\b/gi,'de').replace(/\bLa\b/gi,'la').replace(/\bLe\b/gi,'le').replace(/\bLes\b/gi,'les').replace(/\bDu\b/gi,'du')
            .split(' ').map(w => w.length ? (['sur','de','la','le','les','du'].includes(w.toLowerCase()) ? w.toLowerCase() : w[0].toUpperCase()+w.slice(1).toLowerCase()) : w).join('-');
          communes.add(clean);
        }
      });
      if (communes.size){
        communeNameInput.value = [...communes].sort()[0];
      } else {
        communeNameInput.value = 'Commune';
      }

      uploadStatus.innerHTML = '<span style="color:var(--color-success);">'+RAW_ROWS.length+' transactions chargées avec succès.</span>';
      communeSelectWrap.classList.remove('hidden');
    } catch(err){
      uploadStatus.innerHTML = '<span style="color:var(--color-error);">Erreur de lecture : '+err.message+'</span>';
    }
  };
  reader.readAsArrayBuffer(file);
}

document.getElementById('analyseBtn').addEventListener('click', () => {
  const communeName = communeNameInput.value.trim() || 'Commune';
  ANALYSIS = runAnalysis(RAW_ROWS, COL_IDX, communeName);
  renderResults(ANALYSIS);
  fetchCommuneGeoInfo(communeName);
  document.getElementById('resultsSection').classList.remove('hidden');
  document.getElementById('resultsSection').scrollIntoView({behavior:'smooth'});
});

document.getElementById('view-etude-marche').addEventListener('click', (e) => {
  const btn = e.target.closest('.dl-btn');
  if (!btn) return;
  const chartKey = btn.dataset.chart.startsWith('seg_') ? btn.dataset.chart : btn.dataset.chart;
  const name = btn.dataset.name;
  const chart = CHARTS[chartKey];
  downloadChartPNG(chart, (ANALYSIS ? ANALYSIS.communeName.replace(/[^a-zA-Z0-9]+/g,'_')+'_' : '')+name+'.png');
});

/* ===================== INFOS COMMUNE (API Géo) ===================== */
async function fetchCommuneGeoInfo(communeName){
  const wrap = document.getElementById('communeInfoWrap');
  wrap.innerHTML = '<p style="font-size:13px;color:var(--color-text-faint);">Recherche des données INSEE via l\'API Géo…</p>';
  try{
    const resp = await fetch('https://geo.api.gouv.fr/communes?nom='+encodeURIComponent(communeName)+'&fields=nom,code,codesPostaux,population,departement,region,codeEpci&boost=population&limit=1');
    const data = await resp.json();
    if (!data.length){
      wrap.innerHTML = '<p style="font-size:13px;color:var(--color-error);">Commune non trouvée automatiquement. Vérifiez l\'orthographe ou complétez manuellement.</p>';
      return;
    }
    const c = data[0];
    wrap.innerHTML = '<div class="commune-info-grid">'+
      '<div class="commune-info-card"><div class="label">Commune</div><div class="value" style="font-size:16px;">'+c.nom+'</div></div>'+
      '<div class="commune-info-card"><div class="label">Code INSEE</div><div class="value" style="font-size:16px;">'+c.code+'</div></div>'+
      '<div class="commune-info-card"><div class="label">Code postal</div><div class="value" style="font-size:16px;">'+(c.codesPostaux?c.codesPostaux[0]:'—')+'</div></div>'+
      '<div class="commune-info-card"><div class="label">Population</div><div class="value">'+(c.population?c.population.toLocaleString('fr-FR'):'—')+'</div></div>'+
      '<div class="commune-info-card"><div class="label">Département</div><div class="value" style="font-size:16px;">'+(c.departement?c.departement.nom:'—')+'</div></div>'+
      '<div class="commune-info-card"><div class="label">Région</div><div class="value" style="font-size:16px;">'+(c.region?c.region.nom:'—')+'</div></div>'+
      '</div><p style="font-size:11px;color:var(--color-text-faint);margin-top:10px;">Source : API Découpage administratif (geo.api.gouv.fr) — données INSEE.</p>';
    renderListingLinks(c);
  } catch(err){
    wrap.innerHTML = '<p style="font-size:13px;color:var(--color-error);">Erreur de connexion à l\'API Géo : '+err.message+'</p>';
    renderListingLinks(null);
  }
}

function renderListingLinks(c){
  const box = document.getElementById('listingLinksWrap');
  if (!box) return;
  const nomVille = c ? c.nom : (ANALYSIS ? ANALYSIS.communeName : '');
  const cp = c && c.codesPostaux ? c.codesPostaux[0] : '';
  const slug = nomVille.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const links = [
    {name:'SeLoger', url:'https://www.seloger.com/immobilier/achat/immo-'+slug+'-'+cp.slice(0,2)+'/'},
    {name:'LeBonCoin', url:'https://www.leboncoin.fr/recherche?category=9&locations='+encodeURIComponent(nomVille+'_'+cp)},
    {name:"Bien'ici", url:'https://www.bienici.com/recherche/achat/'+slug},
    {name:'Logic-Immo', url:'https://www.logic-immo.com/vente-immobilier-'+slug+'/'}
  ];
  box.innerHTML = links.map(l => '<a class="btn-link" href="'+l.url+'" target="_blank" rel="noopener">🔎 '+l.name+'</a>').join('');
}

/* ===================== CLASSIFICATION & STATS ===================== */
function classifyRow(r, idx){
  const libtyp = (r[idx['libtypbien']]||'').toString().toUpperCase();
  const libniv2 = (r[idx['libniv2']]||'').toString().toUpperCase();
  const vendeur = (r[idx['typo_vendeur']]||'').toString();
  const acquereur = (r[idx['typo_acquereur']]||'').toString();

  const isVefa = /VEFA|NEUF|NEUVE/.test(libtyp);
  const isSocial = /organisme.*logement.*social/i.test(vendeur) || /organisme.*logement.*social/i.test(acquereur);

  if (isSocial) return 'social';
  if (isVefa) return 'vefa';
  if (libniv2 === 'MAISON') return 'maisons';
  if (libniv2 === 'APPARTEMENT') return 'appartements';
  if (libtyp === 'TERRAIN DE TYPE TAB') return 'tab';
  return null;
}

function median(arr){
  if (!arr.length) return null;
  const s = [...arr].sort((a,b)=>a-b);
  const mid = Math.floor(s.length/2);
  return s.length % 2 ? s[mid] : (s[mid-1]+s[mid])/2;
}
function mean(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null; }

function quartiles(arr){
  if (!arr.length) return {q1:null,q2:null,q3:null,min:null,max:null};
  const s = [...arr].sort((a,b)=>a-b);
  const q = p => {
    const pos = (s.length-1)*p, base = Math.floor(pos), rest = pos-base;
    return s[base+1] !== undefined ? s[base] + rest*(s[base+1]-s[base]) : s[base];
  };
  return {q1:q(0.25), q2:q(0.5), q3:q(0.75), min:s[0], max:s[s.length-1]};
}

function runAnalysis(rows, idx, communeName){
  const segments = {maisons:[], appartements:[], tab:[], vefa:[], social:[]};
  rows.forEach(r => {
    const seg = classifyRow(r, idx);
    if (seg) segments[seg].push(r);
  });

  const years = [...new Set(rows.map(r => parseInt(r[idx['anneemut']])).filter(y=>y))].sort();

  const yearlyStats = {};
  Object.keys(segments).forEach(seg => {
    yearlyStats[seg] = years.map(yr => {
      const yrRows = segments[seg].filter(r => parseInt(r[idx['anneemut']]) === yr);
      const prices = yrRows.map(r => parseFloat(r[idx['valeurfonc']])).filter(v=>!isNaN(v) && v>0);
      const surfaces = yrRows.map(r => parseFloat(r[idx['sbati']])).filter(v=>!isNaN(v) && v>0);
      const terrains = yrRows.map(r => parseFloat(r[idx['sterr']])).filter(v=>!isNaN(v) && v>0);
      const medPrice = median(prices);
      const medSurface = median(surfaces);
      const q = quartiles(prices);
      return {
        annee: yr,
        nbVentes: yrRows.length,
        prixMin: prices.length?Math.min(...prices):null,
        prixMedian: medPrice,
        prixMoyen: mean(prices),
        prixMax: prices.length?Math.max(...prices):null,
        eurM2: (medPrice && medSurface) ? Math.round(medPrice/medSurface) : null,
        surfaceMoy: Math.round(mean(surfaces)||0),
        terrainMoy: Math.round(mean(terrains)||0),
        quartiles: q
      };
    });
  });

  const totalTransactions = rows.length;
  const repartition = Object.keys(segments).map(seg => ({
    segment: seg, label: SEGMENT_LABELS[seg], count: segments[seg].length,
    pct: segments[seg].length/totalTransactions
  }));
  const autres = totalTransactions - repartition.reduce((a,b)=>a+b.count,0);
  repartition.push({segment:'autres', label:'Autres (terrains agri., activité, bâti mixte…)', count:autres, pct:autres/totalTransactions});

  return { communeName, years, segments, yearlyStats, repartition, totalTransactions };
}

function currentTextColor(){
  const v = getComputedStyle(document.getElementById('view-etude-marche')).getPropertyValue('--color-text').trim();
  return v || '#2A6B2C';
}
Chart.defaults.font.family = "'Barlow', 'Segoe UI', Arial, sans-serif";
Chart.defaults.color = currentTextColor();

/* ===================== RENDER ===================== */
function downloadChartPNG(chart, filename){
  if (!chart) return;
  const link = document.createElement('a');
  link.href = chart.toBase64Image('image/png', 1);
  link.download = filename;
  link.click();
}

function fmtEur(v){ return v==null ? '—' : Math.round(v).toLocaleString('fr-FR')+' €'; }
function fmtNum(v){ return v==null ? '—' : Math.round(v).toLocaleString('fr-FR'); }
function fmtPct(v){ return v==null ? '—' : (v*100).toFixed(1)+'%'; }

function renderResults(a){
  renderKPIs(a);
  renderTabs(a);
  renderCharts(a);
}

function renderKPIs(a){
  const grid = document.getElementById('kpiGrid');
  grid.innerHTML = '';
  const segs = ['maisons','appartements','tab'];
  segs.forEach(seg => {
    const stats = a.yearlyStats[seg];
    if (!stats.length) return;
    const first = stats.find(s=>s.prixMedian!=null);
    const lastArr = [...stats].reverse();
    const last = lastArr.find(s=>s.prixMedian!=null);
    if (!first || !last) return;
    const evol = (last.prixMedian - first.prixMedian)/first.prixMedian;
    addKPI(grid, SEGMENT_LABELS[seg]+' — prix médian '+last.annee, fmtEur(last.prixMedian));
    addKPI(grid, SEGMENT_LABELS[seg]+' — évolution '+first.annee+'→'+last.annee, fmtPct(evol));
  });
  addKPI(grid, 'Total transactions', fmtNum(a.totalTransactions));
}
function addKPI(grid, label, value){
  const div = document.createElement('div'); div.className='kpi';
  div.innerHTML = '<div class="label">'+label+'</div><div class="value">'+value+'</div>';
  grid.appendChild(div);
}

function renderTabs(a){
  const tabsWrap = document.getElementById('typeTabs');
  const content = document.getElementById('typeContent');
  tabsWrap.innerHTML = ''; content.innerHTML = '';
  const segList = Object.keys(SEGMENT_LABELS);
  segList.forEach((seg,i) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn'+(i===0?' active':'');
    btn.textContent = SEGMENT_LABELS[seg];
    btn.addEventListener('click', () => {
      tabsWrap.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderSegmentPanel(a, seg);
    });
    tabsWrap.appendChild(btn);
  });
  renderSegmentPanel(a, segList[0]);
}

function renderSegmentPanel(a, seg){
  currentSegment = seg;
  const content = document.getElementById('typeContent');
  const stats = a.yearlyStats[seg];
  let html = '<div class="chart-wrap"><canvas id="chartSeg_'+seg+'"></canvas></div>';
  html += '<div style="text-align:right;margin-bottom:16px;"><button class="dl-btn" data-chart="seg_'+seg+'" data-name="'+seg+'_evolution">⬇ Télécharger le graphique</button></div>';
  html += '<table><thead><tr><th>Année</th><th>Nb ventes</th><th>Prix min</th><th>Prix médian</th><th>Prix moyen</th><th>Prix max</th><th>€/m² médian</th><th>Surface moy.</th><th>Terrain moy.</th></tr></thead><tbody>';
  stats.forEach(s => {
    html += '<tr><td>'+s.annee+'</td><td>'+fmtNum(s.nbVentes)+'</td><td>'+fmtEur(s.prixMin)+'</td><td>'+fmtEur(s.prixMedian)+'</td><td>'+fmtEur(s.prixMoyen)+'</td><td>'+fmtEur(s.prixMax)+'</td><td>'+fmtEur(s.eurM2)+'</td><td>'+fmtNum(s.surfaceMoy)+' m²</td><td>'+fmtNum(s.terrainMoy)+' m²</td></tr>';
  });
  html += '</tbody></table>';
  content.innerHTML = html;

  if (CHARTS['seg_'+seg]) CHARTS['seg_'+seg].destroy();
  const ctx = document.getElementById('chartSeg_'+seg).getContext('2d');
  CHARTS['seg_'+seg] = new Chart(ctx, {
    type:'line',
    data:{
      labels: stats.map(s=>s.annee),
      datasets:[
        {label:'Prix médian (€)', data:stats.map(s=>s.prixMedian), borderColor:'#'+PALETTE[seg].hex, backgroundColor:'#'+PALETTE[seg].hex+'33', fill:true, tension:.3, yAxisID:'y'},
        {label:'Nb ventes', data:stats.map(s=>s.nbVentes), borderColor:'#'+PALETTE.volumesTab.hex, backgroundColor:'#'+PALETTE.volumesTab.hex, type:'bar', yAxisID:'y1'}
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{title:{display:true, text:SEGMENT_LABELS[seg]+' — '+a.communeName}},
      scales:{
        y:{position:'left', title:{display:true,text:'Prix médian (€)'}},
        y1:{position:'right', title:{display:true,text:'Nb ventes'}, grid:{drawOnChartArea:false}}
      }
    }
  });
}

function renderCharts(a){
  if (CHARTS.comparatif) CHARTS.comparatif.destroy();
  const ctx1 = document.getElementById('chartComparatif').getContext('2d');
  CHARTS.comparatif = new Chart(ctx1, {
    type:'line',
    data:{
      labels: a.years,
      datasets: ['maisons','appartements','vefa'].map(seg => ({
        label: SEGMENT_LABELS[seg]+' (€/m²)',
        data: a.yearlyStats[seg].map(s=>s.eurM2),
        borderColor:'#'+PALETTE[seg].hex, backgroundColor:'#'+PALETTE[seg].hex+'22', tension:.3, fill:false
      }))
    },
    options:{responsive:true, maintainAspectRatio:false, plugins:{title:{display:true,text:'Comparatif €/m² médian — '+a.communeName}}}
  });

  if (CHARTS.volumes) CHARTS.volumes.destroy();
  const ctx2 = document.getElementById('chartVolumes').getContext('2d');
  CHARTS.volumes = new Chart(ctx2, {
    type:'bar',
    data:{
      labels: a.years,
      datasets: Object.keys(SEGMENT_LABELS).map(seg => ({
        label: SEGMENT_LABELS[seg],
        data: a.yearlyStats[seg].map(s=>s.nbVentes),
        backgroundColor:'#'+PALETTE[seg].hex
      }))
    },
    options:{responsive:true, maintainAspectRatio:false, plugins:{title:{display:true,text:'Volumes annuels par segment — '+a.communeName}}, scales:{x:{stacked:false}}}
  });

  if (CHARTS.repartition) CHARTS.repartition.destroy();
  const ctx3 = document.getElementById('chartRepartition').getContext('2d');
  const colors = [PALETTE.maisons.hex, PALETTE.appartements.hex, PALETTE.tab.hex, PALETTE.vefa.hex, PALETTE.social.hex, PALETTE.secondaire.hex];
  CHARTS.repartition = new Chart(ctx3, {
    type:'pie',
    data:{
      labels: a.repartition.map(r=>r.label),
      datasets:[{data: a.repartition.map(r=>r.count), backgroundColor: colors.map(c=>'#'+c)}]
    },
    options:{responsive:true, maintainAspectRatio:false, plugins:{title:{display:true,text:'Répartition des transactions — '+a.communeName}, legend:{position:'right'}}}
  });
}

// Recolore/re-rend les graphiques quand le thème global du portail change
new MutationObserver(()=>{
  if (!ANALYSIS) return;
  Chart.defaults.color = currentTextColor();
  renderCharts(ANALYSIS);
  if (currentSegment) renderSegmentPanel(ANALYSIS, currentSegment);
}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

/* ===================== EXPORT EXCEL ===================== */
document.getElementById('exportExcelBtn').addEventListener('click', () => {
  if (!ANALYSIS) return;
  exportExcel(ANALYSIS);
});

/* ===================== STYLES O64 (xlsx-js-style) ===================== */
const O64 = {
  green:'7CB780', greenDark:'457556', orange:'F18A00', blue:'0062AD',
  purple:'9888C0', red:'A51916', yellow:'FED100', white:'FFFFFF', rowAlt:'EAF3EA'
};
const FONT_NAME = 'Barlow';

function sTitle(){ return {font:{name:FONT_NAME, sz:16, bold:true, color:{rgb:O64.greenDark}}}; }
function sSubtitle(){ return {font:{name:FONT_NAME, sz:10, italic:true, color:{rgb:'595959'}}}; }
function sSection(){ return {font:{name:FONT_NAME, sz:11, bold:true, color:{rgb:O64.greenDark}}}; }
function sHeader(){
  return {
    font:{name:FONT_NAME, sz:11, bold:true, color:{rgb:O64.white}},
    fill:{patternType:'solid', fgColor:{rgb:O64.greenDark}},
    alignment:{horizontal:'center', vertical:'center'},
    border: sBorder()
  };
}
function sBorder(){
  const thin = {style:'thin', color:{rgb:'D9D9D9'}};
  return {top:thin, bottom:thin, left:thin, right:thin};
}
function sBody(bold, alt, align){
  return {
    font:{name:FONT_NAME, sz:10, bold:!!bold},
    fill: alt ? {patternType:'solid', fgColor:{rgb:O64.rowAlt}} : undefined,
    alignment:{horizontal: align || 'center', vertical:'center'},
    border: sBorder()
  };
}

function applyCellStyle(ws, addr, style){
  if (!ws[addr]) ws[addr] = {t:'s', v:''};
  ws[addr].s = style;
}

function styledSheetFromRows(rows, opts){
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const range = XLSX.utils.decode_range(ws['!ref']);
  if (opts.titleRow !== undefined){
    const addr = XLSX.utils.encode_cell({r:opts.titleRow, c:0});
    applyCellStyle(ws, addr, sTitle());
  }
  if (opts.subtitleRow !== undefined){
    const addr = XLSX.utils.encode_cell({r:opts.subtitleRow, c:0});
    applyCellStyle(ws, addr, sSubtitle());
  }
  if (opts.sectionRow !== undefined){
    const addr = XLSX.utils.encode_cell({r:opts.sectionRow, c:0});
    applyCellStyle(ws, addr, sSection());
  }
  if (opts.headerRow !== undefined){
    for (let c = range.s.c; c <= range.e.c; c++){
      const addr = XLSX.utils.encode_cell({r:opts.headerRow, c});
      applyCellStyle(ws, addr, sHeader());
    }
  }
  if (opts.dataStartRow !== undefined){
    let rIdx = 0;
    for (let r = opts.dataStartRow; r <= range.e.r; r++, rIdx++){
      const alt = rIdx % 2 === 1;
      for (let c = range.s.c; c <= range.e.c; c++){
        const addr = XLSX.utils.encode_cell({r, c});
        const cell = ws[addr];
        if (!cell) continue;
        const isFirstCol = (c === 0);
        applyCellStyle(ws, addr, sBody(isFirstCol, alt, isFirstCol ? 'left' : 'center'));
        if (opts.numFormats && opts.numFormats[c] && typeof cell.v === 'number'){
          cell.z = opts.numFormats[c];
        }
      }
    }
  }
  ws['!cols'] = (opts.colWidths||[]).map(w => ({wch:w}));
  if (opts.freeze) ws['!freeze'] = opts.freeze;
  if (opts.autofilter && opts.headerRow !== undefined){
    const filterRange = {s:{r:opts.headerRow, c:range.s.c}, e:{r:range.e.r, c:range.e.c}};
    ws['!autofilter'] = {ref: XLSX.utils.encode_range(filterRange)};
  }
  return ws;
}

const FMT = {EUR:'#,##0" €"', NUM:'#,##0', PCT:'0.0%'};

function segSheetData(a, seg){
  const label = SEGMENT_LABELS[seg];
  const rows = [
    [a.communeName+' — '+label],
    ['Généré le '+new Date().toLocaleDateString('fr-FR')+' — Source : urbanSimul / DVF Cerema'],
    [],
    ['Année','Nb ventes','Prix min (€)','Prix médian (€)','Prix moyen (€)','Prix max (€)','€/m² médian','Surface moy (m²)','Terrain moy (m²)']
  ];
  a.yearlyStats[seg].forEach(s => {
    rows.push([s.annee, s.nbVentes, s.prixMin, s.prixMedian, s.prixMoyen, s.prixMax, s.eurM2, s.surfaceMoy, s.terrainMoy]);
  });
  return rows;
}

function exportExcel(a){
  const wb = XLSX.utils.book_new();

  const synthRows = [
    ['Synthèse marché immobilier — '+a.communeName],
    ['Source : DVF Cerema / urbanSimul — Généré le '+new Date().toLocaleDateString('fr-FR')],
    [],
    ['Type de bien','Indicateur','Valeur']
  ];
  const synthPctRows = [];
  const synthCountRows = [];
  ['maisons','appartements','tab'].forEach(seg => {
    const stats = a.yearlyStats[seg].filter(s=>s.prixMedian!=null);
    if (!stats.length) return;
    const first = stats[0], last = stats[stats.length-1];
    synthRows.push([SEGMENT_LABELS[seg], 'Prix médian '+last.annee, last.prixMedian]);
    synthRows.push([SEGMENT_LABELS[seg], 'Évolution '+first.annee+' → '+last.annee, ((last.prixMedian-first.prixMedian)/first.prixMedian)]);
    synthPctRows.push(synthRows.length-1);
  });
  synthRows.push(['Ensemble', 'Total transactions', a.totalTransactions]);
  synthCountRows.push(synthRows.length-1);
  const repHeaderIdx = synthRows.length + 1;
  synthRows.push([]);
  synthRows.push(['Type de bien','Nb transactions','Part (%)']);
  a.repartition.forEach(r => synthRows.push([r.label, r.count, r.pct]));

  const wsSynth = styledSheetFromRows(synthRows, {
    titleRow:0, subtitleRow:1, headerRow:3, dataStartRow:4,
    colWidths:[22,32,16]
  });
  applyCellStyle(wsSynth, XLSX.utils.encode_cell({r:repHeaderIdx, c:0}), sHeader());
  applyCellStyle(wsSynth, XLSX.utils.encode_cell({r:repHeaderIdx, c:1}), sHeader());
  applyCellStyle(wsSynth, XLSX.utils.encode_cell({r:repHeaderIdx, c:2}), sHeader());
  for (let r = repHeaderIdx+1; r < synthRows.length; r++){
    const alt = (r - repHeaderIdx - 1) % 2 === 1;
    for (let c=0;c<3;c++){
      const addr = XLSX.utils.encode_cell({r,c});
      applyCellStyle(wsSynth, addr, sBody(c===0, alt, c===0?'left':'center'));
      if (c===1 && wsSynth[addr]) wsSynth[addr].z = FMT.NUM;
      if (c===2 && wsSynth[addr]) wsSynth[addr].z = FMT.PCT;
    }
  }
  for (let r = 4; r < repHeaderIdx-1; r++){
    const addrA = XLSX.utils.encode_cell({r, c:0});
    const addrB = XLSX.utils.encode_cell({r, c:1});
    const addrC = XLSX.utils.encode_cell({r, c:2});
    const alt = (r - 4) % 2 === 1;
    applyCellStyle(wsSynth, addrA, sBody(true, alt, 'left'));
    applyCellStyle(wsSynth, addrB, sBody(false, alt, 'left'));
    applyCellStyle(wsSynth, addrC, sBody(true, alt, 'right'));
    if (!wsSynth[addrC]) continue;
    if (synthPctRows.includes(r)) wsSynth[addrC].z = FMT.PCT;
    else if (synthCountRows.includes(r)) wsSynth[addrC].z = FMT.NUM;
    else wsSynth[addrC].z = FMT.EUR;
  }
  XLSX.utils.book_append_sheet(wb, wsSynth, 'Synthèse');

  Object.keys(SEGMENT_LABELS).forEach(seg => {
    const rows = segSheetData(a, seg);
    const ws = styledSheetFromRows(rows, {
      titleRow:0, subtitleRow:1, headerRow:3, dataStartRow:4,
      numFormats:{2:FMT.EUR,3:FMT.EUR,4:FMT.EUR,5:FMT.EUR,6:FMT.EUR,1:FMT.NUM,7:FMT.NUM,8:FMT.NUM},
      colWidths:[10,12,14,14,14,14,13,16,14],
      freeze:{xSplit:0, ySplit:4},
      autofilter:true
    });
    XLSX.utils.book_append_sheet(wb, ws, seg.charAt(0).toUpperCase()+seg.slice(1));
  });

  const comparatifRows = [
    [a.communeName+' — Comparatif €/m² (Maisons / Appartements / VEFA)'],
    [],
    ['Année','Maisons €/m²','Appartements €/m²','VEFA €/m²']
  ];
  a.years.forEach((yr,i) => {
    comparatifRows.push([yr, a.yearlyStats.maisons[i]?.eurM2, a.yearlyStats.appartements[i]?.eurM2, a.yearlyStats.vefa[i]?.eurM2]);
  });
  const wsComp = styledSheetFromRows(comparatifRows, {
    titleRow:0, headerRow:2, dataStartRow:3,
    numFormats:{1:FMT.EUR,2:FMT.EUR,3:FMT.EUR},
    colWidths:[10,16,18,14]
  });
  XLSX.utils.book_append_sheet(wb, wsComp, 'EuM2 comparatif');

  const volRows = [
    [a.communeName+' — Volumes annuels par type de bien'],
    [],
    ['Année', ...Object.values(SEGMENT_LABELS)]
  ];
  a.years.forEach((yr,i) => {
    volRows.push([yr, ...Object.keys(SEGMENT_LABELS).map(seg => a.yearlyStats[seg][i]?.nbVentes||0)]);
  });
  const wsVol = styledSheetFromRows(volRows, {
    titleRow:0, headerRow:2, dataStartRow:3,
    colWidths:[10,12,14,14,12,16]
  });
  XLSX.utils.book_append_sheet(wb, wsVol, 'Volumes');

  const repRows = [
    [a.communeName+' — Répartition des transactions par type'],
    [],
    ['Type de bien','Nb transactions','Part (%)']
  ];
  a.repartition.forEach(r => repRows.push([r.label, r.count, r.pct]));
  const wsRep = styledSheetFromRows(repRows, {
    titleRow:0, headerRow:2, dataStartRow:3,
    numFormats:{1:FMT.NUM,2:FMT.PCT},
    colWidths:[36,16,12]
  });
  XLSX.utils.book_append_sheet(wb, wsRep, 'Repartition');

  const filename = 'analyse_immo_'+a.communeName.replace(/[^a-zA-Z0-9]+/g,'_')+'.xlsx';
  XLSX.writeFile(wb, filename);
}

/* ===================== EXPORT SYNTHESE TEXTE ===================== */
document.getElementById('exportReportBtn').addEventListener('click', () => {
  if (!ANALYSIS) return;
  const a = ANALYSIS;
  let txt = 'ANALYSE DU MARCHÉ IMMOBILIER — '+a.communeName.toUpperCase()+'\n';
  txt += 'Généré le '+new Date().toLocaleDateString('fr-FR')+' — Source : DVF Cerema / urbanSimul\n';
  txt += 'Total transactions analysées : '+a.totalTransactions+'\n\n';

  ['maisons','appartements','tab','vefa','social'].forEach(seg => {
    const stats = a.yearlyStats[seg].filter(s=>s.prixMedian!=null);
    txt += '--- '+SEGMENT_LABELS[seg].toUpperCase()+' ---\n';
    if (!stats.length){ txt += 'Aucune donnée exploitable.\n\n'; return; }
    const first = stats[0], last = stats[stats.length-1];
    const evol = ((last.prixMedian-first.prixMedian)/first.prixMedian*100).toFixed(1);
    txt += 'Prix médian '+first.annee+' : '+fmtEur(first.prixMedian)+'\n';
    txt += 'Prix médian '+last.annee+' : '+fmtEur(last.prixMedian)+'\n';
    txt += 'Évolution sur la période : '+evol+'%\n';
    txt += 'Nombre total de ventes : '+stats.reduce((sum,s)=>sum+s.nbVentes,0)+'\n\n';
  });

  const blob = new Blob([txt], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a_link = document.createElement('a');
  a_link.href = url; a_link.download = 'synthese_immo_'+a.communeName.replace(/[^a-zA-Z0-9]+/g,'_')+'.txt';
  a_link.click();
  URL.revokeObjectURL(url);
});

})();
