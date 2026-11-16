// Original vector illustrations rendered locally; no remote services or copyrighted photos.
const sharp = require('sharp');
const { mkdir } = require('node:fs/promises');
const { resolve } = require('node:path');
const circle = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const cards = [
  ['GEOGRAFÍA', '#6366f1', '<path d="M390 385L475 145L560 385M420 305H530M445 235H505M360 385H590" fill="none" stroke="#fff" stroke-width="15" stroke-linejoin="round"/><path d="M250 390V320H320V390M630 390V290H700V390" fill="#c7d2fe"/>'],
  ['SISTEMA SOLAR', '#4338ca', circle(475,275,110,'#fbbf24') + '<path d="M375 245Q475 210 575 245M370 285Q475 250 580 285M390 330Q475 295 565 325" fill="none" stroke="#f59e0b" stroke-width="15"/>' + circle(265,200,28,'#93c5fd') + circle(705,335,40,'#c4b5fd')],
  ['CULTURAS DEL MUNDO', '#e11d48', '<path d="M320 220H640M350 250H610M380 220V385M580 220V385" stroke="white" stroke-width="18" stroke-linecap="round"/><path d="M300 190Q480 240 660 190" fill="none" stroke="#fecdd3" stroke-width="20"/>' + circle(480,150,50,'#fda4af')],
  ['LITERATURA', '#9333ea', '<path d="M480 230Q380 170 270 220V385Q380 340 480 390Q580 340 690 385V220Q580 170 480 230Z" fill="#faf5ff"/><path d="M480 230V385M310 250L425 260M310 290L425 300M535 260L650 250M535 300L650 290" stroke="#c084fc" stroke-width="9" stroke-linecap="round"/>'],
  ['CIENCIA', '#0891b2', circle(480,285,100,'#67e8f9') + circle(350,210,55,'#e0f2fe') + circle(610,210,55,'#e0f2fe') + '<path d="M395 235L435 260M525 260L565 235" stroke="white" stroke-width="20"/>' + circle(450,255,22,'#a5f3fc')],
  ['EXPLORACIÓN ESPACIAL', '#be123c', circle(490,280,112,'#fb7185') + circle(450,240,23,'#e11d48') + circle(535,315,36,'#e11d48') + circle(525,215,17,'#fecdd3') + '<path d="M260 370L320 240L350 360Z" fill="#fff1f2"/><path d="M298 360L310 405L330 360" fill="#fbbf24"/>'],
  ['RELIEVE Y NATURALEZA', '#0284c7', '<path d="M230 395L410 175L590 395M410 395L600 210L760 395" fill="#bae6fd"/><path d="M340 260L410 175L480 260L435 245L410 275L385 245Z" fill="white"/><path d="M545 280L600 210L655 280L620 270L600 295L575 270Z" fill="white"/>'],
  ['PAISAJES DEL MUNDO', '#b45309', circle(650,175,57,'#fde68a') + '<path d="M180 360Q370 240 570 370Q720 300 810 360V420H180Z" fill="#fbbf24"/><path d="M180 395Q390 330 600 400Q730 365 810 400V445H180Z" fill="#f59e0b"/><path d="M350 330V260M350 285L320 260M350 290L380 265" stroke="#fff7ed" stroke-width="13" stroke-linecap="round"/>'],
  ['FÍSICA', '#7c3aed', '<path d="M210 280H365L425 205L480 350L540 235L590 280H750" stroke="#fde047" stroke-width="17" fill="none" stroke-linejoin="round" stroke-linecap="round"/>' + circle(255,180,10,'white') + circle(700,360,14,'#c4b5fd')],
  ['CUERPO HUMANO', '#0f766e', circle(480,180,47,'#ccfbf1') + '<path d="M480 245V325M390 260L480 245L570 260M480 325L420 405M480 325L540 405" stroke="#ccfbf1" stroke-width="26" fill="none" stroke-linecap="round"/>' + circle(675,200,34,'#5eead4') + '<path d="M675 180V220M655 200H695" stroke="white" stroke-width="9"/>'],
];
async function main() {
  const dir = resolve(__dirname, '../public/seeds');
  await mkdir(dir, { recursive: true });
  for (const [index, [label, color, illustration]] of cards.entries()) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" rx="32" fill="${color}"/><circle cx="880" cy="60" r="200" fill="white" opacity=".07"/><circle cx="60" cy="490" r="160" fill="white" opacity=".07"/><text x="55" y="75" fill="white" font-family="sans-serif" font-size="23" font-weight="bold" letter-spacing="3">PROFELINK · CULTURA GENERAL</text>${illustration}<text x="55" y="492" fill="white" font-family="sans-serif" font-size="25" font-weight="bold" letter-spacing="2">${String(index+1).padStart(2,'0')} / ${label}</text></svg>`;
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(resolve(dir, `q${index + 1}.png`));
  }
  console.log('Generadas 10 ilustraciones PNG originales en public/seeds.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
