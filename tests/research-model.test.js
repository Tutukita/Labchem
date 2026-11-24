const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `No se encontró la sección ${start}`);
  return source.slice(from, to);
}

const modelSource = [
  section('function buildResearchTarget', 'function drawResearchOptions'),
  section('function bondVector', 'function atomAt'),
  section('function bondOrder', 'function atomValence'),
  section('function researchTarget', 'function showResearch'),
  `
    assert.equal(RESEARCH_DECK.length, 30, 'el mazo debe conservar 30 cartas');
    assert.equal(new Set(RESEARCH_DECK.map(card => card.name)).size, 20, 'el mazo debe conservar 20 tipos');

    const hcn = RESEARCH_DECK.find(card => card.name === 'Cianuro de hidrógeno');
    const hcnMolecule = {
      atoms: [
        {element:'H',row:5,col:1},
        {element:'C',row:5,col:3},
        {element:'N',row:5,col:5}
      ],
      bonds: [
        {type:'—',row:5,col:2,angle:0},
        {type:'≡',row:5,col:4,angle:0}
      ]
    };
    assert.equal(researchMatchesMolecule(hcn, hcnMolecule), true, 'HCN válido debe coincidir');

    const propanone = RESEARCH_DECK.find(card => card.name === 'Propanona');
    const propanal = RESEARCH_DECK.find(card => card.name === 'Propanal');
    assert.equal(graphsMatch(propanone.target, propanal.target), false, 'los isómeros no deben confundirse');
    assert.equal(graphsMatch(propanone.target, propanone.target), true, 'una estructura debe coincidir consigo misma');
  `
].join('\n');

Function('assert', modelSource)(assert);
console.log('research-model: 5 comprobaciones correctas');
