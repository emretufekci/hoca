const ease = x => x * x * (3 - 2 * x);
const clamp = x => Math.max(0, Math.min(1, x));
export function render({ progress: p }) {
  const tokens = [
    { text: 'Kedi', x: 240 }, { text: 'sütü', x: 500 }, { text: 'içti', x: 760 }
  ];
  const lines = tokens.slice(1).map((token, i) => {
    const opacity = ease(clamp((p - .18 - i * .12) / .3));
    return `<path d="M${token.x + 80} 350 Q600 160 320 350" fill="none" stroke="${i ? '#fed782' : '#73e6d3'}" stroke-width="${i ? 8 : 16}" stroke-linecap="round" opacity="${opacity}"/>`;
  }).join('');
  const cards = tokens.map((token, i) => {
    const y = 370 - 45 * ease(clamp((p - i * .1) / .22));
    return `<g transform="translate(${token.x} ${y})"><rect width="160" height="90" rx="20" fill="${i ? '#1e3450' : '#126f79'}" stroke="#8ad9d2" stroke-width="2"/><text x="80" y="58" text-anchor="middle" font-size="34" fill="white" font-family="sans-serif">${token.text}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#101a2d"/><text x="100" y="110" font-size="28" fill="#72dbd1" font-family="sans-serif">DİKKAT MEKANİZMASI</text><text x="100" y="182" font-size="54" fill="white" font-family="sans-serif">Hangi sözcük önemli?</text>${lines}${cards}<text x="100" y="645" font-size="27" fill="#b7c9d5" font-family="sans-serif">Bağlantı kalınlığı = dikkat ağırlığı</text></svg>`;
}
