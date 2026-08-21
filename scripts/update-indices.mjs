// Met à jour data/indices.json à partir des séries publiques INSEE (IRL et ICC).
//
// Source : service SDMX public de l'INSEE (bdm.insee.fr) — gratuit, sans clé d'API,
// vérifié manuellement le 21/08/2026 (réponses HTTP 200, XML SDMX standard, aucune
// authentification requise). Documentation : https://www.insee.fr/fr/information/2868055
//
// Exécuté par le workflow .github/workflows/update-indices.yml, une fois par mois et
// à la demande (bouton « Run workflow » dans l'onglet Actions du dépôt GitHub).
//
// Ce script ne dépend d'aucun paquet externe (fetch et fs sont fournis nativement par
// Node 18+, la version utilisée par les runners GitHub Actions).

const SERIES = {
  irl: '001515333', // Indice de référence des loyers
  icc: '000008630', // Indice du coût de la construction
};

const OUTPUT_PATH = new URL('../data/indices.json', import.meta.url);

async function fetchSeries(idbank) {
  const url = `https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/${idbank}`;
  console.log(`→ Appel INSEE pour la série ${idbank}...`);
  // Un User-Agent explicite est ajouté par précaution : certains services publics
  // rejettent (403/406) les requêtes dont l'en-tête User-Agent est absent ou trop
  // générique (ce qui peut être le cas du client HTTP par défaut d'un runner CI).
  let res;
  try {
    res = await fetch(url, {
      headers: {
        Accept: 'application/xml',
        'User-Agent': 'OFFICE64-PortailAccession/1.0 (+https://titoucore.github.io/siteaccession/ ; contact : Office 64 de l\'Habitat)',
      },
    });
  } catch (networkErr) {
    throw new Error(`Échec réseau en appelant l'INSEE pour la série ${idbank} (${url}) : ${networkErr.message}`);
  }
  if (!res.ok) {
    let corps = '';
    try { corps = (await res.text()).slice(0, 300); } catch (e) { /* ignore */ }
    throw new Error(`INSEE a répondu ${res.status} ${res.statusText} pour la série ${idbank} (${url}). Début de la réponse : ${JSON.stringify(corps)}`);
  }
  const xml = await res.text();
  const data = parseObservations(xml);
  if (!data.length) {
    throw new Error(`Aucune observation exploitable trouvée pour la série ${idbank} — le format de réponse INSEE a peut-être changé. Début de la réponse : ${JSON.stringify(xml.slice(0, 300))}`);
  }
  console.log(`✓ Série ${idbank} : ${data.length} observation(s) récupérée(s).`);
  return data;
}

// Le format est du SDMX-ML « structure specific » : chaque observation est une balise
// <Obs .../> à plat, avec les attributs TIME_PERIOD, OBS_VALUE et DATE_JO (date de
// parution au Journal Officiel — c'est cette date, pas la période, qui détermine à partir
// de quand une valeur est opposable).
function parseObservations(xml) {
  const obsTagRegex = /<Obs\b([^>]*)\/>/g;
  const attrRegex = /(\w+)="([^"]*)"/g;
  const out = [];
  let obsMatch;
  while ((obsMatch = obsTagRegex.exec(xml))) {
    const attrs = {};
    let attrMatch;
    attrRegex.lastIndex = 0;
    while ((attrMatch = attrRegex.exec(obsMatch[1]))) {
      attrs[attrMatch[1]] = attrMatch[2];
    }
    const periode = attrs.TIME_PERIOD;
    const valeur = parseFloat(attrs.OBS_VALUE);
    const date = normalizeDate(attrs.DATE_JO);
    if (!periode || Number.isNaN(valeur) || !date) continue;
    out.push({ date, periode, valeur });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

function normalizeDate(raw) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw; // déjà au format ISO
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

async function main() {
  const [irl, icc] = await Promise.all([
    fetchSeries(SERIES.irl),
    fetchSeries(SERIES.icc),
  ]);

  const payload = {
    irl,
    icc,
    updatedAt: new Date().toISOString(),
    source: 'INSEE — service SDMX public (bdm.insee.fr), séries 001515333 (IRL) et 000008630 (ICC)',
  };

  const fs = await import('node:fs');
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
  console.log(`OK — IRL : ${irl.length} valeur(s), ICC : ${icc.length} valeur(s).`);
  console.log(`Dernière valeur IRL : ${irl[irl.length - 1].periode} = ${irl[irl.length - 1].valeur}`);
  console.log(`Dernière valeur ICC : ${icc[icc.length - 1].periode} = ${icc[icc.length - 1].valeur}`);
}

main().catch((err) => {
  console.error('Échec de la mise à jour des indices :', err.message);
  process.exit(1);
});
