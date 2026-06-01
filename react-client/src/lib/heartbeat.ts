// 슬롯 heartbeat — 다른 탭이 새로 열릴 때 "이 슬롯 사용중" 알려줌.
// index.html 의 inline script 가 plainws_live_tabs (localStorage) 를 보고
// 죽은 슬롯을 회수하므로, 살아있는 탭은 5초마다 자기 슬롯에 타임스탬프 박는다.
// 탭 닫힐 때 자기 entry 즉시 제거.

import { getSlot } from './slot';

const KEY = 'plainws_live_tabs';
const TICK_MS = 5_000;
const STALE_MS = 30_000; // 30초 지난 entry 정리

function readLive(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function writeLive(v: Record<string, number>) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {}
}

let timer: number | null = null;
let mySlot: string | null = null;

export function startSlotHeartbeat() {
  mySlot = getSlot();
  tick();
  timer = window.setInterval(tick, TICK_MS);
  window.addEventListener('beforeunload', release);
  window.addEventListener('pagehide', release);
}

function tick() {
  if (!mySlot) return;
  const live = readLive();
  const now = Date.now();
  for (const s of Object.keys(live)) {
    if (now - live[s] > STALE_MS) delete live[s];
  }
  live[mySlot] = now;
  writeLive(live);
}

function release() {
  if (!mySlot) return;
  const live = readLive();
  delete live[mySlot];
  writeLive(live);
  if (timer) { window.clearInterval(timer); timer = null; }
}
