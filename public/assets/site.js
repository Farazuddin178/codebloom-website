/* CodeBloomAPP — page behaviour. The 3D background is loaded after the content is interactive. */

// Google Apps Script web app URL that saves bookings to the Google Sheet.
// Setup steps: README.md → "Booking form → Google Sheet".
const BOOKING_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwhyCpr2hkD1uPe5b-7tpRrEkw9z7eUYPBi-2JozRxbyVq6FCd7scE1bNUiyZ6y3r0t/exec';

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

/* ===== Book a free demo ===== */
function initBooking() {
  const dialog = document.getElementById('book');
  const form = document.getElementById('bookForm');
  const step = document.getElementById('bookStep');
  const done = document.getElementById('bookDone');
  const submit = document.getElementById('bookSubmit');
  const error = document.getElementById('bookError');
  const submitLabel = submit.textContent;

  function open(course) {
    if (course) form.course.value = course;
    dialog.showModal();
  }

  function close() {
    dialog.close();
    // A finished booking starts fresh next time
    if (!done.hidden) {
      form.reset();
      form.classList.remove('checked');
      step.hidden = false;
      done.hidden = true;
    }
  }

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-book]');
    if (!trigger) return;
    e.preventDefault();
    open(trigger.dataset.book);
  });
  dialog.addEventListener('click', (e) => {
    // Clicking the dimmed backdrop or a close button
    if (e.target === dialog || e.target.closest('[data-close]')) close();
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    if (!form.checkValidity()) {
      form.classList.add('checked');
      form.querySelector(':invalid').focus();
      return;
    }

    const fields = new FormData(form);
    const data = new URLSearchParams({
      parentName: fields.get('parentName').trim(),
      studentName: fields.get('studentName').trim(),
      phone: `${fields.get('countryCode')} ${fields.get('phone').trim()}`,
      email: fields.get('email').trim(),
      studentAge: fields.get('studentAge'),
      course: fields.get('course'),
      preferredTime: fields.get('preferredTime'),
      hasLaptop: fields.get('hasLaptop'),
      message: fields.get('message').trim(),
      website: fields.get('website'),
      page: location.href
    });

    submit.disabled = true;
    submit.textContent = 'Sending…';
    try {
      if (!BOOKING_ENDPOINT) throw new Error('BOOKING_ENDPOINT is not set in site.js');
      // A plain form-encoded POST: Apps Script accepts it without a CORS preflight
      const res = await fetch(BOOKING_ENDPOINT, { method: 'POST', body: data });
      const reply = await res.json();
      if (reply.result !== 'success') throw new Error(reply.error || 'Booking was not saved');

      document.getElementById('doneName').textContent = data.get('parentName').split(' ')[0];
      step.hidden = true;
      done.hidden = false;
      done.focus();
      if (window.gtag) gtag('event', 'generate_lead', { course: data.get('course') });
      if (window.fbq) fbq('track', 'Lead', { content_name: data.get('course') });
    } catch (err) {
      console.error('Booking failed', err);
      error.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = submitLabel;
    }
  });
}

/* ===== 3D background ===== */
function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (e) {
    return false;
  }
}

function initScene() {
  const canvas = document.getElementById('scene');
  const toggle = document.getElementById('sceneToggle');
  if (!canvas || !webglAvailable()) return;

  const start = async () => {
    try {
      const { startNetwork } = await import('./scene/network.js');
      const network = startNetwork(canvas, {
        reducedMotion: reduceMotion,
        onFirstFrame: () => {
          document.documentElement.classList.add('scene-ready');
          toggle.hidden = false;
        }
      });

      const setLabel = () => {
        toggle.textContent = network.paused ? 'Play animation' : 'Pause animation';
        toggle.setAttribute('aria-pressed', String(network.paused));
      };
      toggle.addEventListener('click', () => { network.setPaused(!network.paused); setLabel(); });
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
initBooking();
initScene();
