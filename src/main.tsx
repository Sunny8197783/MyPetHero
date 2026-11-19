import { createRoot } from 'react-dom/client';
import { gsap } from 'gsap';
import { assets } from './core/assets';
import { director } from './core/director';
import { input } from './core/input';
import { getGame, setGame } from './core/store';
import { PreviewScene } from './tools/PreviewScene';
import { App } from './ui/App';
import './ui/styles.css';

const params = new URLSearchParams(location.search);
const d = director();

createRoot(document.getElementById('ui') as HTMLElement).render(<App />);

const preview = params.get('preview');
if (preview) {
  // 개발용 에셋 미리보기: ?preview=kaykit-city 등
  setGame({ loading: { progress: 1, tip: '', done: true } });
  d.engine.setScene(new PreviewScene(preview, params));
  d.engine.start();
} else {
  void d.boot().then(() => {
    const q = params.get('q');
    if (q === 'low' || q === 'medium' || q === 'high') d.setSettings({ quality: q });
    // 개발·테스트용 바로가기: ?night=3&stats=40&bot=1 / ?day=2
    const night = Number(params.get('night') ?? 0);
    const day = Number(params.get('day') ?? 0);
    const stats = Number(params.get('stats') ?? 0);
    if (night > 0) void d.debugStart('night', night, stats, params.get('bot') === '1');
    else if (day > 0) void d.debugStart('day', day, stats, false);
  });
}

// 테스트(Playwright)와 콘솔 디버깅에서 쓰는 창구
(window as unknown as Record<string, unknown>).__game = { director: d, engine: d.engine, getGame, setGame, input, assets, gsap };
