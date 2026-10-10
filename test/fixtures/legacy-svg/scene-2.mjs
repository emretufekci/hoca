const ease = x => x * x * (3 - 2 * x);
const clamp = x => Math.max(0, Math.min(1, x));
export function render({ progress: p }) {
  const highlight = ease(clamp((p - .25) / .35));
  const fade = ease(clamp((p - .55) / .3));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#101a2d"/><text x="100" y="110" font-size="28" fill="#72dbd1" font-family="sans-serif">BAĞLAM ANLAMI DEĞİŞTİRİR</text><text x="100" y="205" font-size="52" fill="white" font-family="sans-serif">Denizde yüz.</text><path d="M290 310 Q540 ${370 - highlight * 160} 850 310" fill="none" stroke="#73e6d3" stroke-width="${4 + highlight * 18}" opacity="${.25 + .75 * highlight}"/><rect x="190" y="305" width="205" height="95" rx="18" fill="#126f79"/><text x="292" y="366" text-anchor="middle" font-size="38" fill="white" font-family="sans-serif">Denizde</text><rect x="770" y="305" width="205" height="95" rx="18" fill="#1e3450" stroke="#8ad9d2" stroke-width="2"/><text x="872" y="366" text-anchor="middle" font-size="38" fill="white" font-family="sans-serif">yüz</text><text x="100" y="530" font-size="33" fill="#fed782" opacity="${fade}" font-family="sans-serif">Bağlam → yüzmek eylemi</text><text x="100" y="635" font-size="26" fill="#b7c9d5" font-family="sans-serif">Aynı sözcük, farklı bağlamda farklı bağlantılar kurar.</text></svg>`;
}
