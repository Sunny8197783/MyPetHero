import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { audio } from '../audio/audio';
import { director } from '../core/director';
import { input } from '../core/input';
import { useGame, type CutLine } from '../core/store';
import { actionBlock, hoursLeft, TIER_NAMES } from '../day/dayLogic';
import { actions, balance, qualities, STAT_IDS, STAT_NAMES, suspicionTier, type QualityId } from '../data';
import { Bar, fmtHour, fmtTime, Icon, OwnerFace } from './widgets';

const ENDING_NAMES = { secret: '비밀 유지 엔딩', caught: '들킨 엔딩', true: '진엔딩' } as const;

function Btn(props: { onClick: () => void; children: React.ReactNode; kind?: 'main' | 'ghost' | 'night'; disabled?: boolean; id?: string }) {
  return (
    <button id={props.id} className={`btn ${props.kind ?? 'main'}`} disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

// ---------- 로딩 ----------
function Loading() {
  const loading = useGame((s) => s.loading);
  if (loading.done) return null;
  return (
    <div className="loading">
      <div className="loading-dog">
        <Icon name="dog" size={84} />
        <div className="loading-shadow" />
      </div>
      <h1 className="logo small">
        우리 집 개는 <em>영웅</em>
      </h1>
      <Bar value={loading.progress} max={1} className="loading-bar" />
      <p className="tip">TIP · {loading.tip}</p>
    </div>
  );
}

// ---------- 설정 ----------
function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useGame((g) => g.settings);
  const showFps = useGame((g) => g.showFps);
  const set = director().setSettings.bind(director());
  const slider = (label: string, key: 'master' | 'music' | 'sfx') => (
    <label className="row">
      <span>{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={s[key]} onChange={(e) => set({ [key]: Number(e.target.value) })} />
      <b>{Math.round(s[key] * 100)}</b>
    </label>
  );
  return (
    <div className="panel settings" role="dialog" aria-label="설정">
      <h2>설정</h2>
      {slider('전체 음량', 'master')}
      {slider('배경 음악', 'music')}
      {slider('효과음', 'sfx')}
      <div className="row">
        <span>그래픽 품질</span>
        <div className="seg">
          {(Object.keys(qualities) as QualityId[]).map((q) => (
            <button key={q} className={s.quality === q ? 'on' : ''} onClick={() => set({ quality: q })}>
              {qualities[q].label}
            </button>
          ))}
        </div>
      </div>
      <label className="row check">
        <span>화면 흔들림</span>
        <input type="checkbox" checked={s.shake} onChange={(e) => set({ shake: e.target.checked })} />
      </label>
      <label className="row check">
        <span>데미지 숫자</span>
        <input type="checkbox" checked={s.damageNumbers} onChange={(e) => set({ damageNumbers: e.target.checked })} />
      </label>
      <label className="row check">
        <span>성능 표시 (F3)</span>
        <input type="checkbox" checked={showFps} onChange={(e) => useGame.setState({ showFps: e.target.checked })} />
      </label>
      <p className="hint">품질을 바꾸면 다음 장면부터 그림자·파티클 양이 달라집니다.</p>
      <Btn onClick={onClose}>닫기</Btn>
    </div>
  );
}

// ---------- 타이틀 ----------
function Title() {
  const hasSave = useGame((s) => s.hasSave);
  const [settings, setSettings] = useState(false);
  return (
    <div className="title">
      <div className="title-tag day">낮 · 평범한 개</div>
      <div className="title-tag night">밤 · 동네의 영웅</div>
      <h1 className="logo">
        <span>우리 집 개는</span>
        <em>영웅</em>
      </h1>
      <p className="subtitle">주인만 모르는 비밀</p>
      {settings ? (
        <SettingsPanel onClose={() => setSettings(false)} />
      ) : (
        <div className="menu">
          <Btn id="btn-new" onClick={() => void director().newGame()}>
            새 게임
          </Btn>
          <Btn id="btn-continue" disabled={!hasSave} onClick={() => void director().continueGame()}>
            이어하기
          </Btn>
          <Btn kind="ghost" onClick={() => director().showRanking(true)}>
            랭킹
          </Btn>
          <Btn kind="ghost" onClick={() => setSettings(true)}>
            설정
          </Btn>
        </div>
      )}
      <p className="credit-line">이동: WASD · 방향키 · 게임패드 · 터치 / 공격은 자동</p>
    </div>
  );
}

function Ranking() {
  const ranking = useGame((s) => s.ranking);
  return (
    <div className="center-wrap">
      <div className="panel ranking">
        <h2>랭킹</h2>
        {ranking.length === 0 ? <p className="hint">아직 기록이 없습니다. 7밤을 끝까지 버텨 보세요.</p> : null}
        <ol>
          {ranking.map((r, i) => (
            <li key={i}>
              <b>{r.score.toLocaleString()}점</b>
              <span>처치 {r.kills}</span>
              <span>{ENDING_NAMES[r.ending]}</span>
              <i>{r.date}</i>
            </li>
          ))}
        </ol>
        <Btn onClick={() => director().showRanking(false)}>돌아가기</Btn>
      </div>
    </div>
  );
}

// ---------- 의심도 ----------
function Suspicion({ value, compact }: { value: number; compact?: boolean }) {
  const tier = suspicionTier(value);
  return (
    <div className={`suspicion tier-${tier} ${compact ? 'compact' : ''}`}>
      <OwnerFace tier={tier} size={compact ? 40 : 54} />
      <div>
        <div className="sus-head">
          <span>의심도</span>
          <b>{TIER_NAMES[tier]}</b>
        </div>
        <Bar value={value} max={100} className="sus-bar">
          {Math.round(value)}
        </Bar>
      </div>
    </div>
  );
}

// ---------- 낮 ----------
function DayHud() {
  const c = useGame((s) => s.campaign);
  const day = useGame((s) => s.day);
  const paused = useGame((s) => s.paused);
  if (!c) return null;
  const left = hoursLeft(c);
  const hours = balance.campaign.dayEndHour - balance.campaign.dayStartHour;
  const idle = !day.busy && !day.popup && !day.event;
  return (
    <div className={`day-hud ${paused ? 'dim' : ''}`}>
      <div className="top-left chip-row">
        <div className="chip day-chip">
          <b>{c.day}</b>일째 <i>/ {balance.campaign.nights}</i>
        </div>
        <div className="chip clock">
          <Icon name="clock" size={18} /> {fmtHour(c.hour)}
          <Bar value={hours - left} max={hours} className="clock-bar" />
        </div>
      </div>
      <div className="top-right">
        <Suspicion value={c.suspicion} />
      </div>
      <div className="stats panel">
        {STAT_IDS.map((id) => (
          <div className="stat" key={id}>
            <Icon name={id === 'strength' ? 'strength' : id} size={18} />
            <span>{STAT_NAMES[id]}</span>
            <Bar value={c.stats[id]} max={100} className={`stat-bar s-${id}`}>
              {c.stats[id]}
            </Bar>
          </div>
        ))}
        <div className={`stat fatigue ${c.stats.fatigue >= 60 ? 'warn' : ''}`}>
          <Icon name="zz" size={18} />
          <span>{STAT_NAMES.fatigue}</span>
          <Bar value={c.stats.fatigue} max={100} className="stat-bar s-fatigue">
            {c.stats.fatigue}
          </Bar>
        </div>
      </div>

      {day.ownerLine ? <div className="bubble owner">{day.ownerLine}</div> : null}
      {day.thought ? <div className="bubble thought">{day.thought}</div> : null}

      {day.popup ? (
        <div className="panel popup" role="dialog">
          <h3>{day.popup.title}</h3>
          {day.popup.note ? <p className="note">{day.popup.note}</p> : null}
          <ul>
            {day.popup.lines.map((l) => (
              <li key={l.label} className={(l.label === '의심도' || l.label === '피로도' ? l.delta < 0 : l.delta > 0) ? 'up' : 'down'}>
                {l.label} <b>{l.delta > 0 ? `+${l.delta}` : l.delta}</b>
              </li>
            ))}
            {day.popup.lines.length === 0 ? <li>변화 없음</li> : null}
          </ul>
          <Btn id="btn-popup" onClick={() => void director().dismissPopup()}>
            확인
          </Btn>
        </div>
      ) : null}

      {day.event && !day.eventResult ? (
        <div className="panel event" role="dialog">
          <h3>{day.event.title}</h3>
          <p>{day.event.text}</p>
          <div className="choices">
            {day.event.choices.map((ch, i) => (
              <Btn key={i} onClick={() => director().chooseEvent(i)}>
                {ch.label}
              </Btn>
            ))}
          </div>
        </div>
      ) : null}

      {idle ? (
        <div className="actions">
          <div className="action-list">
            {actions.map((a) => {
              const block = actionBlock(c, a);
              return (
                <button key={a.id} className={`action ${block ? 'blocked' : ''}`} data-action={a.id} onClick={() => void director().doAction(a.id)} title={a.desc}>
                  <Icon name={a.icon} size={30} />
                  <strong>{a.name}</strong>
                  <span className="cost">
                    {a.hours}시간 · 피로 {a.fatigue > 0 ? `+${a.fatigue}` : a.fatigue}
                  </span>
                  <span className="gain">
                    {Object.entries(a.gains)
                      .map(([k, v]) => `${STAT_NAMES[k as keyof typeof STAT_NAMES]}+${v}`)
                      .join(' ')}
                  </span>
                  {block ? <em>{block}</em> : null}
                </button>
              );
            })}
          </div>
          <Btn id="btn-sleep" kind="night" onClick={() => void director().endDay()}>
            <Icon name="moon" size={20} /> {left <= 0 ? '밤이 왔다 — 잠자리에 들기' : '일찍 잠자리에 들기'}
          </Btn>
        </div>
      ) : null}
    </div>
  );
}

// ---------- 밤 ----------
function NightHud() {
  const h = useGame((s) => s.hud);
  const boss = h.boss;
  const hpRatio = h.hp / h.maxHp;
  return (
    <div className="night-hud">
      <Bar value={h.xp} max={h.xpNeed} className="xp-bar" />
      <div className="level-badge">Lv.{h.level}</div>
      <div className="top-left night-left">
        <div className={`hp ${hpRatio < 0.3 ? 'low' : ''}`}>
          <Icon name="dog" size={34} />
          <Bar value={h.hp} max={h.maxHp} className="hp-bar">
            {h.hp} / {h.maxHp}
          </Bar>
        </div>
        {h.awaken > 0 ? (
          <Bar value={h.awaken} max={1} className="awaken-bar">
            각성
          </Bar>
        ) : (
          <div className="awaken-pips" title="각성 가능 횟수">
            {Array.from({ length: h.awakenLeft }, (_, i) => (
              <Icon key={i} name="heart" size={14} />
            ))}
          </div>
        )}
        {h.fatigueLabel ? <div className="chip debuff">{h.fatigueLabel}</div> : null}
      </div>
      <div className="timer">
        <div className="chip night-chip">{h.night}번째 밤</div>
        <strong>{h.phase === 'dawn' ? '새벽' : fmtTime(h.timeLeft)}</strong>
        <Bar value={h.duration - h.timeLeft} max={h.duration} className="time-bar" />
      </div>
      <div className="top-right kills">
        <Icon name="skull" size={22} />
        <b>{h.kills}</b>
      </div>
      {boss ? (
        <div className="boss-bar">
          <span>{boss.name}</span>
          <Bar value={boss.hp} max={boss.maxHp} className="boss-hp" />
        </div>
      ) : null}
      <div className="loadout">
        <div className="slots">
          {h.weapons.map((w) => (
            <div key={w.id} className={`slot ${w.evolved ? 'evolved' : ''}`} style={{ '--c': w.color } as CSSProperties} title={w.name}>
              <Icon name={w.icon} size={26} />
              <i>{w.evolved ? '★' : w.level}</i>
            </div>
          ))}
        </div>
        <div className="slots small">
          {h.passives.map((p) => (
            <div key={p.id} className="slot passive" title={p.name}>
              <Icon name={p.icon} size={18} />
              <i>{p.level}</i>
            </div>
          ))}
        </div>
      </div>
      {h.phase === 'dawn' ? (
        <div className="home-guide">
          <div className="arrow" style={{ transform: `rotate(${h.homeAngle}rad)` }}>
            <Icon name="run" size={46} />
          </div>
          <div className="home-text">
            <Icon name="home" size={22} /> 집으로! <b>{Math.round(h.homeDist)}m</b>
            {h.late > 0 ? <em>늦었다 +{h.late.toFixed(0)}초</em> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LevelUp() {
  const choices = useGame((s) => s.levelUp);
  const focus = useGame((s) => s.levelUpFocus);
  useEffect(() => {
    if (!choices) return;
    const onKey = (e: KeyboardEvent) => {
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (i >= 0) director().chooseLevelUp(i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choices]);
  if (!choices) return null;
  return (
    <div className="levelup">
      <h2>레벨 업!</h2>
      <div className="cards">
        {choices.map((c, i) => (
          <button key={c.id + i} className={`card kind-${c.kind} ${i === focus ? 'focus' : ''}`} style={{ '--c': c.color, '--i': i } as CSSProperties} onClick={() => director().chooseLevelUp(i)}>
            <span className="key">{i + 1}</span>
            <div className="card-icon">
              <Icon name={c.icon} size={44} />
            </div>
            <strong>{c.name}</strong>
            <span className="tag">{c.kind === 'evolve' ? '진화' : c.kind === 'heal' ? '회복' : c.isNew ? '새로 획득' : `Lv.${c.level}`}</span>
            <p>{c.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function BossIntro() {
  const b = useGame((s) => s.bossIntro);
  if (!b) return null;
  return (
    <div className="boss-intro">
      <div className="bar-top" />
      <div className="boss-card">
        <span>{b.title}</span>
        <strong>{b.name}</strong>
      </div>
      <div className="bar-bottom" />
    </div>
  );
}

function Result() {
  const r = useGame((s) => s.result);
  const c = useGame((s) => s.campaign);
  if (!r || !c) return null;
  return (
    <div className="center-wrap result-wrap">
      <div className="panel result">
        <h2>{r.night}번째 밤 {r.knockedOut ? '— 기절' : '— 귀가'}</h2>
        <div className="result-grid">
          <div>
            <Icon name="skull" size={26} />
            <b>{r.kills}</b>
            <span>처치</span>
          </div>
          <div>
            <Icon name="star" size={26} />
            <b>Lv.{r.level}</b>
            <span>도달 레벨</span>
          </div>
          <div className={r.bossKilled ? 'good' : 'bad'}>
            <Icon name="fur" size={26} />
            <b>{r.bossKilled ? '처치' : '놓침'}</b>
            <span>{r.bossName}</span>
          </div>
          <div>
            <Icon name="heart" size={26} />
            <b>{r.damageTaken}</b>
            <span>받은 피해</span>
          </div>
        </div>
        <h3>아침에 주인이 눈치챌 것들</h3>
        <ul className="sus-list">
          {r.suspicionParts.map((p) => (
            <li key={p.label} className={p.value > 0 ? 'down' : 'up'}>
              {p.label} <b>{p.value > 0 ? `+${p.value}` : p.value}</b>
            </li>
          ))}
        </ul>
        <Suspicion value={c.suspicion} compact />
        <p className="score">
          점수 +{r.scoreGain} <i>(누적 {c.score})</i>
        </p>
        <Btn id="btn-result" onClick={() => void director().confirmResult()}>
          아침 맞이하기
        </Btn>
      </div>
    </div>
  );
}

// ---------- 컷씬 ----------
function Dialogue({ line }: { line: CutLine }) {
  const [shown, setShown] = useState(0);
  const full = line.text.length;
  useEffect(() => {
    setShown(0);
    let n = 0;
    const id = window.setInterval(() => {
      n = Math.min(full, n + 1);
      setShown(n);
      if (n % 2 === 1 && line.who !== 'narr') audio.blip(line.who);
      if (n >= full) window.clearInterval(id);
    }, 28);
    return () => window.clearInterval(id);
  }, [line.seq, full, line.who]);
  const next = () => {
    if (shown < full) setShown(full);
    else director().cut.advance();
  };
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') nextRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <button className={`dialogue who-${line.who} ${line.thought ? 'thought' : ''}`} onClick={next} id="dialogue">
      {line.name ? <span className="speaker">{line.thought ? `${line.name}의 속마음` : line.name}</span> : null}
      <span className="text">
        {line.text.slice(0, shown)}
        <span className="ghost">{line.text.slice(shown)}</span>
      </span>
      <span className={`more ${shown >= full ? 'on' : ''}`}>▼</span>
    </button>
  );
}

function Cutscene() {
  const cut = useGame((s) => s.cut);
  const screen = useGame((s) => s.screen);
  const show = cut.active || cut.letterbox;
  return (
    <>
      <div className={`letterbox ${show ? 'on' : ''}`}>
        <div className="lb top" />
        <div className="lb bottom" />
      </div>
      {cut.card ? (
        <div className="title-card">
          <strong>{cut.card.title}</strong>
          {cut.card.subtitle ? <span>{cut.card.subtitle}</span> : null}
        </div>
      ) : null}
      {cut.active && cut.line ? <Dialogue line={cut.line} /> : null}
      {cut.active && cut.skippable && screen === 'cutscene' ? (
        <button className="skip" id="btn-skip" onClick={() => director().cut.skip()}>
          건너뛰기 ▶▶
        </button>
      ) : null}
    </>
  );
}

function CloseCall() {
  const cc = useGame((s) => s.closeCall);
  if (!cc) return null;
  return (
    <div className="closecall">
      <div className="cc-head">
        <span>시치미 떼기</span>
        <div className="pips">
          {Array.from({ length: cc.total }, (_, i) => (
            <i key={i} className={i < cc.round ? 'done' : i === cc.round ? 'now' : ''} />
          ))}
        </div>
      </div>
      <p className="cc-prompt">{cc.prompt}</p>
      <Bar value={cc.time} max={1} className="cc-timer" />
      {cc.feedback ? (
        <p className="cc-feedback">{cc.feedback}</p>
      ) : (
        <div className="cc-options">
          {cc.options.map((o, i) => (
            <Btn key={o.label} onClick={() => director().closeCallPick(i)}>
              {o.label}
            </Btn>
          ))}
        </div>
      )}
      <p className="hint">가장 "평범한 개"다운 행동을 고르세요.</p>
    </div>
  );
}

function Ending() {
  const id = useGame((s) => s.ending);
  const c = useGame((s) => s.campaign);
  const ranking = useGame((s) => s.ranking);
  if (!id || !c) return null;
  const rank = ranking.findIndex((r) => r.score === c.score) + 1;
  return (
    <div className="center-wrap">
      <div className="panel ending">
        <span className="tag">{ENDING_NAMES[id]}</span>
        <h2>우리 집 개는 영웅</h2>
        <div className="result-grid">
          <div>
            <Icon name="star" size={26} />
            <b>{c.score.toLocaleString()}</b>
            <span>최종 점수</span>
          </div>
          <div>
            <Icon name="skull" size={26} />
            <b>{c.totalKills.toLocaleString()}</b>
            <span>총 처치</span>
          </div>
          <div>
            <Icon name="fur" size={26} />
            <b>{c.bossKills} / {balance.campaign.nights}</b>
            <span>보스 처치</span>
          </div>
          <div>
            <Icon name="paw" size={26} />
            <b>{c.stats.bond}</b>
            <span>유대감</span>
          </div>
        </div>
        {rank > 0 ? <p className="score">로컬 랭킹 {rank}위</p> : null}
        <p className="hint">
          {id === 'true' ? '모든 조건을 채웠습니다.' : id === 'secret' ? '진엔딩 조건: 유대감 90 이상, 의심도 30 이하, 마지막 보스 처치.' : '시치미 떼기에 두 번 실패하면 들킵니다. 다른 결말도 있습니다.'}
        </p>
        <Btn id="btn-title" onClick={() => void director().toTitle()}>
          타이틀로
        </Btn>
      </div>
    </div>
  );
}

function Pause() {
  const paused = useGame((s) => s.paused);
  const [settings, setSettings] = useState(false);
  useEffect(() => {
    if (!paused) setSettings(false);
  }, [paused]);
  if (!paused) return null;
  return (
    <div className="center-wrap pause-wrap">
      {settings ? (
        <SettingsPanel onClose={() => setSettings(false)} />
      ) : (
        <div className="panel pause">
          <h2>일시정지</h2>
          <Btn onClick={() => director().togglePause()}>계속하기</Btn>
          <Btn kind="ghost" onClick={() => setSettings(true)}>
            설정
          </Btn>
          <Btn kind="ghost" onClick={() => void director().toTitle()}>
            타이틀로
          </Btn>
        </div>
      )}
    </div>
  );
}

function Toast() {
  const t = useGame((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!t) return;
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), 2600);
    return () => window.clearTimeout(id);
  }, [t]);
  if (!t || !visible) return null;
  return (
    <div className="toast" key={t.seq}>
      {t.text}
    </div>
  );
}

/** 모바일 가상 조이스틱: 화면 왼쪽 절반을 누르면 그 자리에 생긴다. */
function Joystick() {
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const origin = useRef<{ id: number; x: number; y: number } | null>(null);
  const R = 56;
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    origin.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 캡처를 못 해도 조이스틱은 동작한다. */
    }
    setStick({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const o = origin.current;
    if (!o || o.id !== e.pointerId) return;
    let dx = e.clientX - o.x;
    let dy = e.clientY - o.y;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    input.stickX = dx / R;
    input.stickY = dy / R;
    setStick({ x: o.x, y: o.y, dx, dy });
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (origin.current?.id !== e.pointerId) return;
    origin.current = null;
    input.stickX = 0;
    input.stickY = 0;
    setStick(null);
  };
  return (
    <div className="joy-zone" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {stick ? (
        <div className="joy-base" style={{ left: stick.x, top: stick.y }}>
          <div className="joy-knob" style={{ transform: `translate(${stick.dx}px, ${stick.dy}px)` }} />
        </div>
      ) : null}
    </div>
  );
}

export function App() {
  const screen = useGame((s) => s.screen);
  const fade = useGame((s) => s.cut.fade);
  const fadeColor = useGame((s) => s.cut.fadeColor);
  const hurt = useGame((s) => (s.screen === 'night' ? s.hud.hurt : 0));
  const composer = useGame((s) => qualities[s.settings.quality].composer);
  const showFps = useGame((s) => s.showFps);
  const fpsText = useGame((s) => s.fpsText);
  const paused = useGame((s) => s.paused);
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
  return (
    <div className={`ui screen-${screen} ${composer ? '' : 'no-composer'}`}>
      {!composer ? <div className="css-vignette" /> : null}
      {hurt > 0.02 && !composer ? <div className="css-hurt" style={{ opacity: hurt }} /> : null}
      {screen === 'night' ? <Joystick /> : null}
      {screen === 'title' ? <Title /> : null}
      {screen === 'ranking' ? <Ranking /> : null}
      {screen === 'day' ? <DayHud /> : null}
      {screen === 'night' || screen === 'result' ? <NightHud /> : null}
      {screen === 'night' ? <LevelUp /> : null}
      {screen === 'night' ? <BossIntro /> : null}
      {screen === 'result' ? <Result /> : null}
      <div className="fade" style={{ opacity: fade, background: fadeColor }} />
      <Cutscene />
      {screen === 'closecall' ? <CloseCall /> : null}
      {screen === 'ending' ? <Ending /> : null}
      <Pause />
      {(screen === 'day' || screen === 'night') && !paused ? (
        <button className="pause-btn" aria-label="일시정지" onClick={() => director().togglePause()}>
          <span />
          <span />
        </button>
      ) : null}
      {screen !== 'result' && screen !== 'ending' ? <Toast /> : null}
      <div id="flash" />
      {showFps ? <div className="fps">{fpsText}</div> : null}
      <Loading />
    </div>
  );
}
