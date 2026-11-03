/* CodeBloomAPP — page behaviour. The 3D valley is loaded after the content is interactive. */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ===== Header: glass background once scrolled, mobile menu ===== */
function initHeader() {
  const bar = document.querySelector('.topbar');
  const nav = document.getElementById('siteNav');
  const toggle = document.querySelector('.menu-toggle');

  const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  function setOpen(open) {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
}

/* ===== Reveal on scroll ===== */
function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -80px 0px' });
  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
}

/* ===== Videos: one plays at a time ===== */
const allVideos = () => document.querySelectorAll('video');

function pauseOthers(current) {
  allVideos().forEach((v) => { if (v !== current && !v.paused) v.pause(); });
}

function initIntroVideo() {
  const video = document.getElementById('introVideo');
  const playBtn = document.getElementById('playPauseBtn');
  const soundBtn = document.getElementById('introSoundBtn');
  let userPaused = false;

  const sync = () => { playBtn.textContent = video.paused ? '▶ Play' : '⏸ Pause'; };
  video.addEventListener('play', () => { pauseOthers(video); sync(); });
  video.addEventListener('pause', sync);
  video.addEventListener('ended', sync);

  playBtn.addEventListener('click', () => {
    if (video.paused) { userPaused = false; video.play(); } else { userPaused = true; video.pause(); }
  });
  soundBtn.addEventListener('click', () => {
    video.muted = !video.muted;
    soundBtn.textContent = video.muted ? '🔇 Unmute' : '🔊 Mute';
  });

  // Autoplay (muted) only while the video is on screen
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !userPaused && !reduceMotion && video.muted) {
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    } else if (!entry.isIntersecting && !video.paused) {
      video.pause();
    }
  }, { threshold: 0.35 }).observe(video);
  sync();
}

function initReviews() {
  document.querySelectorAll('.review').forEach((card) => {
    const video = card.querySelector('video');
    const overlay = card.querySelector('.play-overlay');
    overlay.addEventListener('click', () => {
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    });
    video.addEventListener('play', () => { pauseOthers(video); card.classList.add('playing'); });
    video.addEventListener('ended', () => card.classList.remove('playing'));
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseOthers(null); });
}

/* ===== 3D valley ===== */
function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (e) {
    return false;
  }
}

function initScene() {
  const canvas = document.getElementById('valley');
  const hud = document.getElementById('hud');
  if (!canvas || !webglAvailable()) return;

  const start = async () => {
    try {
      const { startValley } = await import('./scene/main.js');
      const phase = document.getElementById('hudPhase');
      const clock = document.getElementById('hudClock');
      const toggle = document.getElementById('sceneToggle');

      const valley = startValley(canvas, {
        reducedMotion: reduceMotion,
        onPhase: ({ label, clock: time }) => {
          phase.textContent = label;
          clock.textContent = time;
        },
        onFirstFrame: () => {
          document.documentElement.classList.add('scene-ready');
          hud.hidden = false;
        }
      });

      const setLabel = () => {
        toggle.textContent = valley.paused ? 'Play' : 'Pause';
        toggle.setAttribute('aria-pressed', String(valley.paused));
      };
      toggle.addEventListener('click', () => { valley.setPaused(!valley.paused); setLabel(); });
      setLabel();
    } catch (err) {
      console.error('3D scene failed to load', err);
    }
  };

  // Let the page content paint first, then build the scene when the main thread is free
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 700 });
  else setTimeout(start, 200);
}

initHeader();
initReveal();
initIntroVideo();
initReviews();
initScene();
