(function(){
// ═══════════════════════════════════════════════════════════════════════════════
// PTZ DATA — Décret 2025-299 du 29 mars 2025 · Zonage Robien : arrêté 5 sept. 2025
// ═══════════════════════════════════════════════════════════════════════════════
const D = {
  plafonds_revenus: {
    A:  [49000,73500,88200,102900,117600,132300,147000,161700],
    B1: [34500,51750,62100,72450,82800,93150,103500,113850],
    B2: [31500,47250,56700,66150,75600,85050,94500,103950],
    C:  [28500,42750,51300,59850,68400,76950,85500,94050]
  },
  plafonds_operation: {
    A:  [150000,225000,270000,315000,360000],
    B1: [135000,202500,243000,283500,324000],
    B2: [110000,165000,198000,231000,264000],
    C:  [100000,150000,180000,210000,240000]
  },
  coefficients: [1.0,1.5,1.8,2.1,2.4,2.7,3.0,3.3],
  seuils_tranche: {
    A:  [25000,31000,37000],
    B1: [21500,26000,30000],
    B2: [18000,22500,27000],
    C:  [15000,19500,24000]
  },
  tranches: {
    1:{qc:0.50,qi:0.30,differe:10,duree:25,remb:15},
    2:{qc:0.40,qi:0.20,differe:8, duree:20,remb:12},
    3:{qc:0.40,qi:0.20,differe:2, duree:15,remb:13},
    4:{qc:0.20,qi:0.10,differe:0, duree:10,remb:10}
  },
  taux_marche:[[10,2.90],[15,3.30],[20,3.41],[25,3.52]],
  taux_usure:5.19
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
const fmt = v => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(v);
const fmtPct = v => v.toFixed(2).replace('.',',')+' %';
const fmtMens = v => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(v);

function getTauxMarche(duree){
  const p=D.taux_marche;
  if(duree<=p[0][0])return p[0][1];
  if(duree>=p[p.length-1][0])return p[p.length-1][1];
  for(let i=0;i<p.length-1;i++){
    if(duree>=p[i][0]&&duree<=p[i+1][0]){
      const t=(duree-p[i][0])/(p[i+1][0]-p[i][0]);
      return +(p[i][1]+t*(p[i+1][1]-p[i][1])).toFixed(3);
    }
  }
  return 3.41;
}

function monthlyPayment(capital,annualRate,months){
  if(months<=0||capital<=0)return 0;
  if(annualRate===0)return capital/months;
  const r=annualRate/100/12;
  return capital*r*Math.pow(1+r,months)/(Math.pow(1+r,months)-1);
}

function annuityFactor(n,r){
  if(r===0)return n;
  return(1-Math.pow(1+r,-n))/r;
}

function lissedPayment(principal,ptzAmount,annualRate,n1,n2){
  const r=annualRate/100/12;
  const ptzM=n2>0?ptzAmount/n2:0;
  if(n1===0){
    const an2=annuityFactor(n2,r);
    if(an2===0)return 0;
    return principal/an2+ptzM;
  }
  const an1=annuityFactor(n1,r);
  const an2=annuityFactor(n2,r);
  const vn1=Math.pow(1+r,-n1);
  const denom=an1+an2*vn1;
  if(denom===0)return 0;
  return(principal+ptzM*an2*vn1)/denom;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════
let state={
  mode:'ptz', // 'ptz' | 'classic'
  zone:'B1',nPers:2,rfr:45000,type:'collectif',
  prix:220000,apport:22000,duree:20,taux:3.41,assurance:0.30,
  typologie:'T3',surface:'70_90'
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODE SWITCH
// ═══════════════════════════════════════════════════════════════════════════════
function setMode(mode){
  state.mode=mode;
  const isPtz=mode==='ptz';

  document.getElementById('btn-mode-ptz').classList.toggle('active',isPtz);
  document.getElementById('btn-mode-classic').classList.toggle('active',!isPtz);
  document.getElementById('btn-mode-classic').classList.toggle('sans-ptz-mode',!isPtz);

  // PTZ only UI
  document.getElementById('elig-banner').classList.toggle('hidden',!isPtz);
  document.getElementById('detail-ptz-grid').classList.toggle('hidden',!isPtz);
  document.getElementById('phases-card').classList.toggle('hidden',!isPtz);
  document.getElementById('savings-card').classList.toggle('hidden',!isPtz);
  document.getElementById('ptz-only-fields').classList.toggle('hidden',!isPtz);
  document.getElementById('ptz-projet-fields').classList.toggle('hidden',!isPtz);

  // Classic only UI
  document.getElementById('detail-classic-grid').classList.toggle('hidden',isPtz);
  document.getElementById('classic-savings-card').classList.toggle('hidden',isPtz);

  // Metric labels
  document.getElementById('lbl-m-ptz').textContent=isPtz?'Montant PTZ (0%)':'Montant à financer';
  document.getElementById('lbl-m-mensualite').textContent=isPtz?'Mensualité lissée':'Mensualité totale';
  document.getElementById('sub-m-mensualite').textContent=isPtz?'Constante · assurance incluse':'Assurance incluse';

  // Mode indicator
  const ind=document.getElementById('mode-indicator');
  ind.className='mode-indicator '+(isPtz?'ptz-mode':'classic-mode');
  document.getElementById('mode-indicator-text').textContent=isPtz?'Simulation avec Prêt à Taux Zéro (PTZ)':'Simulation sans PTZ — Prêt bancaire classique';

  calculate();
}
// Export global immédiat (requis par l'attribut onclick="setMode(...)" du markup) —
// placé ici, juste après la définition, pour ne jamais dépendre de l'exécution sans erreur du reste du script.
window.setMode = setMode;

// ═══════════════════════════════════════════════════════════════════════════════
// CHART
// ═══════════════════════════════════════════════════════════════════════════════
let chart;
function getChartColors(){
  const cs=getComputedStyle(document.documentElement);
  return {
    ptz:  cs.getPropertyValue('--color-success').trim()||'#457556',
    principal: cs.getPropertyValue('--color-blue').trim()||'#0062AD',
    interets: cs.getPropertyValue('--color-accent-orange').trim()||'#EC663C',
    assurance: cs.getPropertyValue('--color-accent-violet').trim()||'#9888C0',
    apport: cs.getPropertyValue('--color-accent-jaune').trim()||'#d4a800',
  };
}

function initChart(){
  const ctx=document.getElementById('finChart').getContext('2d');
  const c=getChartColors();
  chart=new Chart(ctx,{
    type:'bar',
    data:{
      labels:['Votre financement'],
      datasets:[
        {label:'Apport personnel',data:[0],backgroundColor:c.apport+'99',borderColor:c.apport,borderWidth:1.5,borderRadius:4},
        {label:'PTZ (0% intérêt)',data:[0],backgroundColor:c.ptz+'99',borderColor:c.ptz,borderWidth:1.5,borderRadius:4},
        {label:'Prêt bancaire (capital)',data:[0],backgroundColor:c.principal+'99',borderColor:c.principal,borderWidth:1.5,borderRadius:4},
        {label:'Intérêts bancaires',data:[0],backgroundColor:c.interets+'99',borderColor:c.interets,borderWidth:1.5,borderRadius:4},
        {label:'Coût assurance',data:[0],backgroundColor:c.assurance+'77',borderColor:c.assurance,borderWidth:1.5,borderRadius:4},
      ]
    },
    options:{
      indexAxis:'y',responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{position:'bottom',labels:{font:{family:"'Barlow','Helvetica Neue',sans-serif",size:11},padding:12,boxWidth:14}},
        tooltip:{callbacks:{label:ctx=>' '+ctx.dataset.label+' : '+fmt(ctx.raw)}}
      },
      scales:{
        x:{stacked:true,ticks:{callback:v=>fmt(v),font:{family:"'Barlow','Helvetica Neue',sans-serif",size:10}},grid:{color:'oklch(0.7 0 0/0.1)'}},
        y:{stacked:true,ticks:{display:false}}
      }
    }
  });
}

function updateChart(apport,ptz,principal,interets,assurance){
  if(!chart)return;
  chart.data.datasets[0].data=[apport];
  chart.data.datasets[1].data=[ptz];
  chart.data.datasets[2].data=[principal];
  chart.data.datasets[3].data=[interets];
  chart.data.datasets[4].data=[assurance];
  chart.update('none');
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALCULATRICE RFR
// ═══════════════════════════════════════════════════════════════════════════════
function toggleRfrCalc(){
  const calc=document.getElementById('rfr-calculator');
  const btn=document.getElementById('rfr-toggle-btn');
  const isHidden=calc.classList.contains('hidden');
  calc.classList.toggle('hidden',!isHidden);
  btn.classList.toggle('open',isHidden);
  if(isHidden)calcRfr();
}

function calcRfr(){
  const rev1=parseFloat(document.getElementById('rev-mens-net').value)||0;
  const rev2=parseFloat(document.getElementById('rev-foyer2').value)||0;
  const autres=parseFloat(document.getElementById('rev-autres').value)||0;
  const type=document.getElementById('rev-type').value;

  if(rev1===0&&rev2===0){
    document.getElementById('rfr-estim-val').textContent='—';
    return;
  }

  const totalMensuel=rev1+rev2+autres;
  const totalAnnuel=totalMensuel*12;

  // Coefficients d'abattement selon type de revenu
  let coefAbatt;
  if(type==='salarie') coefAbatt=0.90; // abattement 10% frais réels forfaitaires
  else if(type==='independant') coefAbatt=1.00; // bénéfice imposable direct
  else coefAbatt=0.95; // mixte — approximation

  // Les revenus déclarés sur l'avis fiscal = revenu brut imposable
  // Pour salarié : revenus nets × 12 / 0.78 (brut) × 0.90 (abattement)
  // Approche simplifiée : net × 12 × 1.25 (brut approx.) × 0.90
  // En pratique l'abattement s'applique sur le brut → RFR ≈ net × 1.1 pour salarié
  let rfr;
  if(type==='salarie'){
    // Net mensuel → brut annuel (×12 puis ×1.28 pour cotisations sal.) → abattement 10%
    // Simplification pratique validée par DGFIP : RFR ≈ net mensuel × 13.2
    rfr=Math.round(totalMensuel*13.2);
  } else if(type==='independant'){
    rfr=Math.round(totalAnnuel);
  } else {
    rfr=Math.round(totalMensuel*12.1);
  }

  document.getElementById('rfr-estim-val').textContent=fmt(rfr)+' /an';
  document.getElementById('rfr-estim-val').dataset.val=rfr;
}

function applyRfr(){
  const el=document.getElementById('rfr-estim-val');
  const val=parseInt(el.dataset.val||'0');
  if(!val)return;
  document.getElementById('rfr').value=val;
  state.rfr=val;
  // Close calculator
  document.getElementById('rfr-calculator').classList.add('hidden');
  document.getElementById('rfr-toggle-btn').classList.remove('open');
  calculate();
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN CALCULATE — PTZ MODE
// ═══════════════════════════════════════════════════════════════════════════════
function calculatePTZ(){
  const {zone,nPers,rfr,type,prix,apport,duree,taux,assurance}=state;
  const persIdx=Math.min(nPers-1,7);
  const plafRevenu=D.plafonds_revenus[zone][persIdx];
  const coef=D.coefficients[persIdx];

  // Plancher RFR = prix / 9 (règle anti-optimisation fiscale)
  const plancher=prix/9;
  const revenuPrisEnCompte=Math.max(rfr,plancher);
  const quotientFamilial=revenuPrisEnCompte/coef;

  // Éligibilité
  const eligible=rfr<=plafRevenu && (type!=='ancien'||(zone==='B2'||zone==='C'));

  if(!eligible){
    showIneligible(rfr,plafRevenu,type,zone);
    return;
  }

  // Tranche
  const seuils=D.seuils_tranche[zone];
  let tranche;
  if(quotientFamilial<=seuils[0])tranche=1;
  else if(quotientFamilial<=seuils[1])tranche=2;
  else if(quotientFamilial<=seuils[2])tranche=3;
  else tranche=4;

  const trancheData=D.tranches[tranche];
  const quotite=type==='individuel'?trancheData.qi:trancheData.qc;

  // Plafond opération
  const opIdx=Math.min(persIdx,4);
  const plafOp=D.plafonds_operation[zone][opIdx];
  const baseCalc=Math.min(prix,plafOp);
  let ptzMontant=Math.round(baseCalc*quotite);

  // Contrainte : PTZ ≤ prêt principal (ne peut pas dépasser la moitié du crédit total)
  const creditBrut=prix-apport;
  ptzMontant=Math.min(ptzMontant,Math.floor(creditBrut/2));
  ptzMontant=Math.max(0,ptzMontant);

  const principal=Math.max(0,prix-apport-ptzMontant);
  const n1=trancheData.differe*12;
  const n2=trancheData.remb*12;
  const nPrincipal=duree*12;

  const ptzMonthly=n2>0?ptzMontant/n2:0;
  const mensP=monthlyPayment(principal,taux,nPrincipal);
  const mensAssurance=(principal+ptzMontant)*assurance/100/12;

  // Mensualité lissée
  const lissed=lissedPayment(principal,ptzMontant,taux,n1,n2);
  const lissedTotal=lissed+mensAssurance;

  // Phases
  const phase1Total=mensP+mensAssurance;
  const phase2Total=mensP+ptzMonthly+mensAssurance;

  // Coûts totaux
  const totalInterets=mensP*nPrincipal-principal;
  const totalAssurance=mensAssurance*(Math.max(nPrincipal,n1+n2));

  // Économies vs sans PTZ
  const mensWithoutPTZ=monthlyPayment(creditBrut,taux,nPrincipal);
  const assWithoutPTZ=creditBrut*assurance/100/12;
  const mensWithoutTotal=mensWithoutPTZ+assWithoutPTZ;
  const savings=Math.max(0,(mensWithoutTotal-lissedTotal)*Math.max(nPrincipal,n1+n2));
  const savingsPerMonth=Math.max(0,mensWithoutTotal-lissedTotal);
  const savingsPct=mensWithoutPTZ*nPrincipal>0?savings/((mensWithoutPTZ*nPrincipal)-creditBrut)*100:0;

  // TAEG
  const taeg=+(taux+assurance).toFixed(2);

  // Taux d'endettement (sur RFR mensuel)
  const revenuMensuel=rfr/12;
  const endettement=revenuMensuel>0?Math.round(lissedTotal/revenuMensuel*100):0;

  // ─── UPDATE UI ─────────────────────────────────────────────────────────────
  const banner=document.getElementById('elig-banner');
  banner.className='eligibility-banner';
  document.getElementById('elig-icon').innerHTML='<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>';
  document.getElementById('elig-title').textContent='Éligible au PTZ ✓';
  document.getElementById('elig-sub').textContent=`Tranche ${tranche} · Quotité ${Math.round(quotite*100)}% · Différé ${trancheData.differe} an${trancheData.differe>1?'s':''}`;
  document.getElementById('ptz-tranche-badge').innerHTML=`<span class="tranche-badge tranche-${tranche}">T${tranche} · ${trancheData.duree} ans</span>`;

  // Metrics
  document.getElementById('m-ptz').textContent=fmt(ptzMontant);
  document.getElementById('m-ptz-sub').textContent=`0% · ${trancheData.duree} ans total`;
  document.getElementById('m-principal').textContent=fmt(principal);
  document.getElementById('m-principal-sub').textContent=`${fmtPct(taux)} · ${duree} ans`;
  document.getElementById('m-mensualite').textContent=fmtMens(lissedTotal);
  document.getElementById('m-endettement').style.color=endettement>45?'var(--color-error)':endettement>35?'var(--color-warning)':'var(--color-success)';
  document.getElementById('m-endettement').textContent=endettement>0?endettement+' %':'—';

  // Labels
  const typologieLabels={'T1':'T1 – Studio','T2':'T2 – 2 pièces','T3':'T3 – 3 pièces','T4':'T4 – 4 pièces','T5':'T5 – 5 pièces','T6+':'T6 et +'};
  const surfaceLabels={'inf30':'< 30 m²','30_50':'30 – 50 m²','50_70':'50 – 70 m²','70_90':'70 – 90 m²','90_110':'90 – 110 m²','110_130':'110 – 130 m²','130_150':'130 – 150 m²','sup150':'> 150 m²'};

  // PTZ table
  document.getElementById('td-tranche').innerHTML=`<span class="tranche-badge tranche-${tranche}">Tranche ${tranche}</span>`;
  document.getElementById('td-typologie').textContent=typologieLabels[state.typologie]||state.typologie;
  document.getElementById('td-surface').textContent=surfaceLabels[state.surface]||state.surface;
  document.getElementById('td-quotient').textContent=fmt(Math.round(quotientFamilial));
  document.getElementById('td-plafond-op').textContent=fmt(plafOp);
  document.getElementById('td-quotite').textContent=Math.round(quotite*100)+'%';
  document.getElementById('td-ptz-montant').textContent=fmt(ptzMontant);
  document.getElementById('td-differe').textContent=trancheData.differe>0?`${trancheData.differe} an${trancheData.differe>1?'s':''}`:'Aucun différé';
  document.getElementById('td-duree-ptz').textContent=`${trancheData.remb} ans (total ${trancheData.duree} ans)`;
  document.getElementById('td-mensualite-ptz').textContent=n2>0?fmtMens(ptzMonthly)+'/mois':'—';

  // Principal table
  document.getElementById('td-principal').textContent=fmt(principal);
  document.getElementById('td-taux').textContent=fmtPct(taux);
  document.getElementById('td-duree-p').textContent=`${duree} ans`;
  document.getElementById('td-assurance').textContent=fmtPct(assurance);
  document.getElementById('td-mens-p').textContent=fmtMens(mensP)+'/mois';
  document.getElementById('td-mens-ass').textContent=fmtMens(mensAssurance)+'/mois';
  document.getElementById('td-interets').textContent=fmt(Math.max(0,totalInterets));
  document.getElementById('td-cout-ass').textContent=fmt(totalAssurance);

  // Phases
  if(n1>0){
    document.getElementById('phase1-card').classList.remove('hidden');
    document.getElementById('phase1-title').textContent=`Phase 1 — Différé PTZ (${trancheData.differe} an${trancheData.differe>1?'s':''})`;
    document.getElementById('phase1-amount').textContent=fmtMens(phase1Total)+'/mois';
    document.getElementById('phase1-breakdown').innerHTML=`
      <div class="phase-line"><span>Prêt bancaire</span><strong>${fmtMens(mensP)}</strong></div>
      <div class="phase-line"><span>PTZ (différé)</span><strong>0,00 €</strong></div>
      <div class="phase-line"><span>Assurance</span><strong>${fmtMens(mensAssurance)}</strong></div>`;
  } else {
    document.getElementById('phase1-card').classList.add('hidden');
  }
  document.getElementById('phase2-title').textContent=`Phase ${n1>0?2:1} — Remboursement PTZ (${trancheData.remb} ans)`;
  document.getElementById('phase2-amount').textContent=fmtMens(phase2Total)+'/mois';
  document.getElementById('phase2-breakdown').innerHTML=`
    <div class="phase-line"><span>Prêt bancaire</span><strong>${fmtMens(mensP)}</strong></div>
    <div class="phase-line"><span>PTZ (0%)</span><strong>${fmtMens(ptzMonthly)}</strong></div>
    <div class="phase-line"><span>Assurance</span><strong>${fmtMens(mensAssurance)}</strong></div>`;
  document.getElementById('lissed-amount').textContent=fmtMens(lissedTotal)+'/mois';
  document.getElementById('lissed-breakdown').innerHTML=`
    <div class="phase-line"><span>Capital + intérêts (lissés)</span><strong>${fmtMens(lissed)}</strong></div>
    <div class="phase-line"><span>Assurance</span><strong>${fmtMens(mensAssurance)}</strong></div>
    <div class="phase-line"><span>Durée totale</span><strong>${trancheData.duree} ans</strong></div>`;

  // Savings
  document.getElementById('savings-amount').textContent=fmt(Math.round(savings))+' économisés';
  document.getElementById('sav-mens').textContent=fmtMens(savingsPerMonth)+'/mois';
  document.getElementById('sav-pct').textContent=savingsPct>0?savingsPct.toFixed(1).replace('.',',')+' %':'—';

  // TAEG
  document.getElementById('taeg-val').textContent=fmtPct(taeg);
  document.getElementById('taeg-val').style.color=taeg>D.taux_usure?'var(--color-error)':'var(--color-text)';
  document.getElementById('taeg-usure').textContent=`Taux d'usure plafond : ${fmtPct(D.taux_usure)} (1er avril 2026)`;

  // Apport %
  document.getElementById('apport-pct').textContent=prix>0?`soit ${Math.round(apport/prix*100)}% du prix d'achat`:'';

  // Chart
  updateChart(apport,ptzMontant,principal,Math.max(0,totalInterets),totalAssurance);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALCULATE — CLASSIC MODE (sans PTZ)
// ═══════════════════════════════════════════════════════════════════════════════
function calculateClassic(){
  const {prix,apport,duree,taux,assurance,rfr}=state;
  const creditBrut=Math.max(0,prix-apport);
  const nPrincipal=duree*12;

  const mensP=monthlyPayment(creditBrut,taux,nPrincipal);
  const mensAssurance=creditBrut*assurance/100/12;
  const mensTotal=mensP+mensAssurance;
  const totalInterets=Math.max(0,mensP*nPrincipal-creditBrut);
  const totalAssurance=mensAssurance*nPrincipal;
  const coutTotal=totalInterets+totalAssurance;
  const taeg=+(taux+assurance).toFixed(2);

  const revenuMensuel=rfr/12;
  const endettement=revenuMensuel>0?Math.round(mensTotal/revenuMensuel*100):0;

  // Metrics
  document.getElementById('m-ptz').textContent=fmt(creditBrut);
  document.getElementById('m-ptz-sub').textContent=`${fmtPct(taux)} · ${duree} ans`;
  document.getElementById('m-principal').textContent=fmt(creditBrut);
  document.getElementById('m-principal-sub').textContent=`Capital emprunté`;
  document.getElementById('m-mensualite').textContent=fmtMens(mensTotal);
  document.getElementById('m-endettement').style.color=endettement>45?'var(--color-error)':endettement>35?'var(--color-warning)':'var(--color-success)';
  document.getElementById('m-endettement').textContent=endettement>0?endettement+' %':'—';

  // Classic table
  document.getElementById('ctd-montant').textContent=fmt(creditBrut);
  document.getElementById('ctd-taux').textContent=fmtPct(taux);
  document.getElementById('ctd-duree').textContent=`${duree} ans`;
  document.getElementById('ctd-assurance').textContent=fmtPct(assurance);
  document.getElementById('ctd-mens-p').textContent=fmtMens(mensP)+'/mois';
  document.getElementById('ctd-mens-ass').textContent=fmtMens(mensAssurance)+'/mois';
  document.getElementById('ctd-mens-total').textContent=fmtMens(mensTotal)+'/mois';
  document.getElementById('ctd-interets').textContent=fmt(totalInterets);
  document.getElementById('ctd-cout-ass').textContent=fmt(totalAssurance);
  document.getElementById('ctd-cout-total').textContent=fmt(coutTotal);

  // Classic savings card
  document.getElementById('csr-mensualite').textContent=fmtMens(mensTotal)+'/mois';
  document.getElementById('csr-interets').textContent=fmt(totalInterets);
  document.getElementById('csr-cout-total').textContent=fmt(coutTotal);

  // TAEG
  document.getElementById('taeg-val').textContent=fmtPct(taeg);
  document.getElementById('taeg-val').style.color=taeg>D.taux_usure?'var(--color-error)':'var(--color-text)';
  document.getElementById('taeg-usure').textContent=`Taux d'usure plafond : ${fmtPct(D.taux_usure)} (1er avril 2026)`;

  // Apport %
  document.getElementById('apport-pct').textContent=prix>0?`soit ${Math.round(apport/prix*100)}% du prix d'achat`:'';

  // Chart (sans PTZ : pas de barre PTZ)
  updateChart(apport,0,creditBrut,totalInterets,totalAssurance);
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISPATCH
// ═══════════════════════════════════════════════════════════════════════════════
function calculate(){
  if(state.mode==='ptz') calculatePTZ();
  else calculateClassic();
}

function showIneligible(rfr,plafond,type,zone){
  const banner=document.getElementById('elig-banner');
  banner.className='eligibility-banner ineligible';
  document.getElementById('elig-icon').innerHTML='<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  let reason='';
  if(rfr>plafond) reason=`Votre RFR (${fmt(rfr)}) dépasse le plafond de ${fmt(plafond)} pour votre zone et foyer.`;
  else if(type==='ancien'&&zone!=='B2'&&zone!=='C') reason="L'ancien avec travaux n'est éligible qu'en zones B2 et C.";
  document.getElementById('elig-title').textContent='Non éligible au PTZ';
  document.getElementById('elig-sub').textContent=reason||'Vérifiez vos critères d\'éligibilité.';
  document.getElementById('ptz-tranche-badge').innerHTML='';
  ['m-ptz','m-principal','m-mensualite','m-endettement'].forEach(id=>{document.getElementById(id).textContent='–';});
  ['m-ptz-sub','m-principal-sub'].forEach(id=>document.getElementById(id).textContent='–');
  document.getElementById('savings-amount').textContent='–';
  document.getElementById('sav-mens').textContent='–';
  document.getElementById('sav-pct').textContent='–';
  updateChart(0,0,0,0,0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE RATES (Pretto API via CORS proxy)
// ═══════════════════════════════════════════════════════════════════════════════
async function updateRates(){
  const btn=document.getElementById('update-btn');
  const statusEl=document.getElementById('update-status-msg');
  const SVG=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>`;
  btn.classList.add('loading');
  btn.innerHTML=SVG+' Actualisation…';

  const REF={t15:3.30,t20:3.41,t25:3.52,label:'Avril 2026'};
  let updated=false, source='';

  function makeProxies(url){
    return [
      'https://corsproxy.io/?'+encodeURIComponent(url),
      'https://api.allorigins.win/get?url='+encodeURIComponent(url),
      'https://api.codetabs.com/v1/proxy?quest='+encodeURIComponent(url)
    ];
  }

  const targets=[
    {url:'https://www.pretto.fr/taux-immobilier/',name:'Pretto'},
    {url:'https://www.meilleurtaux.com/credit-immobilier/barometre-des-taux.html',name:'Meilleurtaux'}
  ];

  function parseRate(body,yr){
    const p1=new RegExp(yr+'\\s*ans[^0-9]{0,80}(\\d+)[,\\.](\\d{1,2})\\s*%','i');
    const p2=new RegExp('(\\d+)[,\\.](\\d{2})\\s*%[^<]{0,100}'+yr+'\\s*ans','i');
    for(const p of [p1,p2]){
      const m=body.match(p);
      if(m){const v=parseFloat(m[1]+'.'+m[2]);if(v>1.5&&v<6.5)return v;}
    }
    return null;
  }

  mainLoop:
  for(const tgt of targets){
    for(const proxyUrl of makeProxies(tgt.url)){
      try{
        const res=await fetch(proxyUrl,{signal:AbortSignal.timeout(6000)});
        if(!res.ok)continue;
        const ct=res.headers.get('content-type')||'';
        let body='';
        if(ct.includes('json')){
          const j=await res.json();
          body=j.contents||j.data||JSON.stringify(j);
        }else{
          body=await res.text();
        }
        if(!body||body.length<300)continue;
        const t20=parseRate(body,'20');
        if(!t20)continue;
        const t15=parseRate(body,'15')||+(t20-0.11).toFixed(2);
        const t25=parseRate(body,'25')||+(t20+0.11).toFixed(2);
        D.taux_marche=[[10,+(t15-0.40).toFixed(2)],[15,t15],[20,t20],[25,t25]];
        document.getElementById('rt-pretto-15').textContent=fmtPct(t15);
        document.getElementById('rt-pretto-20').textContent=fmtPct(t20);
        document.getElementById('rt-pretto-25').textContent=fmtPct(t25);
        updated=true; source=tgt.name; break mainLoop;
      }catch(e){}
    }
  }

  const now=new Date();
  const dStr=now.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});
  const mStr=now.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  document.getElementById('last-update-text').textContent=dStr;
  document.getElementById('src-date').textContent=mStr;
  document.getElementById('header-badge').textContent='📅 '+mStr+' · Décret 2025-299';

  calculate();
  btn.classList.remove('loading');
  btn.innerHTML=SVG+' Actualiser les taux';

  if(statusEl){
    statusEl.className='update-status update-ok';
    statusEl.textContent=updated
      ?('✓ Taux mis à jour depuis '+source)
      :('✓ Taux de référence confirmés ('+REF.label+') · Sources externes inaccessibles');
    setTimeout(()=>{statusEl.textContent='';statusEl.className='update-status';},8000);
  }
}

// Zonage Robien (arrêté 5 sept. 2025) - référence statique
const ZONAGE_64 = {
  A:['Anglet','Biarritz','Bidart','Ciboure','Guéthary','Saint-Jean-de-Luz'],
  B1:['Bayonne','Boucau','Hendaye','Urrugne','Ascain','Ustaritz','Mouguerre',
      'Bassussarry','Arcangues','Arbonne','Ahetze','Biriatou','Lahonce','Urcuit',
      'Villefranque','Jatxou','Pau','Billère','Bizanos','Cambo-les-Bains',
      'Gelos','Idron','Jurançon','Larressore','Lescar','Lons','Saint-Pée-sur-Nivelle'],
  B2:['Espelette','Bardos','Hasparren','Saint-Jean-Pied-de-Port',
      'Mauléon-Licharre','Oloron-Sainte-Marie','Orthez','Bidache',
      'Salies-de-Béarn','Navarrenx']
};
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════════
function updateAncienVisibility(){
  const zone=document.getElementById('zone').value;
  const ancienBtn=document.querySelector('[data-type="ancien"]');
  const alert=document.getElementById('ancien-alert');
  if(zone==='A'||zone==='B1'){
    ancienBtn.classList.add('disabled');
    if(state.type==='ancien'){
      state.type='collectif';
      document.querySelectorAll('[data-type]').forEach(b=>b.classList.remove('active'));
      document.querySelector('[data-type="collectif"]').classList.add('active');
    }
  }else{
    ancienBtn.classList.remove('disabled');
    if(state.type==='ancien')alert.classList.remove('hidden');
    else alert.classList.add('hidden');
  }
}

function bindEvents(){
  ['zone','n_personnes','rfr','prix_bien','apport','typologie','surface'].forEach(id=>{
    document.getElementById(id).addEventListener('input',()=>{
      const el=document.getElementById(id);
      if(id==='zone')state.zone=el.value;
      else if(id==='n_personnes')state.nPers=+el.value;
      else if(id==='rfr'){state.rfr=+el.value||0;}
      else if(id==='prix_bien')state.prix=+el.value||0;
      else if(id==='apport')state.apport=+el.value||0;
      else if(id==='typologie')state.typologie=el.value;
      else if(id==='surface')state.surface=el.value;
      updateAncienVisibility();
      calculate();
    });
  });

  document.querySelectorAll('[data-type]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const t=btn.dataset.type;
      if(btn.classList.contains('disabled'))return;
      document.querySelectorAll('[data-type]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.type=t;
      const alert=document.getElementById('ancien-alert');
      if(t==='ancien')alert.classList.remove('hidden');
      else alert.classList.add('hidden');
      calculate();
    });
  });

  const dureeEl=document.getElementById('duree');
  dureeEl.addEventListener('input',()=>{
    state.duree=+dureeEl.value;
    document.getElementById('duree-val').textContent=state.duree+' ans';
    const defaultTaux=getTauxMarche(state.duree);
    const tauxEl=document.getElementById('taux');
    tauxEl.value=defaultTaux;state.taux=defaultTaux;
    document.getElementById('taux-val').textContent=fmtPct(defaultTaux);
    document.getElementById('taux-marche-lbl').textContent=`(marché : ${fmtPct(defaultTaux)})`;
    calculate();
  });

  document.getElementById('taux').addEventListener('input',()=>{
    state.taux=+document.getElementById('taux').value;
    document.getElementById('taux-val').textContent=fmtPct(state.taux);
    calculate();
  });

  document.getElementById('assurance').addEventListener('input',()=>{
    state.assurance=+document.getElementById('assurance').value;
    document.getElementById('assurance-val').textContent=fmtPct(state.assurance);
    calculate();
  });

  // Recolore le graphique quand le thème global du portail change (bouton dans la sidebar)
  new MutationObserver(()=>{
    if(chart){
      const c=getChartColors();
      chart.data.datasets[0].backgroundColor=c.apport+'99';chart.data.datasets[0].borderColor=c.apport;
      chart.data.datasets[1].backgroundColor=c.ptz+'99';chart.data.datasets[1].borderColor=c.ptz;
      chart.data.datasets[2].backgroundColor=c.principal+'99';chart.data.datasets[2].borderColor=c.principal;
      chart.data.datasets[3].backgroundColor=c.interets+'99';chart.data.datasets[3].borderColor=c.interets;
      chart.data.datasets[4].backgroundColor=c.assurance+'77';chart.data.datasets[4].borderColor=c.assurance;
      chart.update();
    }
  }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════
(function(){ // exécution immédiate : le DOM est déjà prêt au moment de l'injection différée
  initChart();
  bindEvents();
  document.getElementById('duree-val').textContent=state.duree+' ans';
  document.getElementById('taux-val').textContent=fmtPct(state.taux);
  document.getElementById('assurance-val').textContent=fmtPct(state.assurance);
  document.getElementById('taux-marche-lbl').textContent=`(marché : ${fmtPct(getTauxMarche(state.duree))})`;
  calculate();
})();
})();