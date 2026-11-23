'use strict';

const processVideo = document.querySelector('#process-video');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let processVisible = false;
function updateProcessPlayback() {
  if (!processVisible || document.hidden) processVideo.pause();
  else if (!reducedMotion.matches) processVideo.play().catch(() => {});
}
new IntersectionObserver(entries => {
  processVisible = entries[0].isIntersecting;
  updateProcessPlayback();
}, {threshold: 0.1}).observe(processVideo);
document.addEventListener('visibilitychange', updateProcessPlayback);

function createTurntable(card, scene, name) {
  const viewer = document.createElement('div');
  viewer.className = 'comparison';
  // Keep the previously shared prototype anchor pointing into the grid.
  if (scene.id === 'bedroom_0657') viewer.id = 'prototype';
  viewer.innerHTML = `
    <canvas></canvas>
    <div class="comparison-label left-label">Semantic</div>
    <div class="comparison-label right-label">Textured</div>
    <div class="divider" aria-hidden="true"><span>‹ ›</span></div>
    <input class="wipe" type="range" min="0" max="100" value="50">
    <button class="rotation-toggle" type="button"></button>
    <div class="loading" role="status">Loading turntable…</div>`;
  card.prepend(viewer);
  const canvas = viewer.querySelector('canvas');
  const ctx = canvas.getContext('2d', {alpha: false});
  const slider = viewer.querySelector('.wipe');
  const status = viewer.querySelector('.loading');
  const pauseButton = viewer.querySelector('.rotation-toggle');
  const buttons = card.querySelectorAll('[data-mode]');
  const note = card.querySelector('.mode-note');
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'none';
  video.setAttribute('playsinline', '');
  let mode = 'semantic';
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let loading = false;
  let visible = false;
  let started = false;
  let posterStarted = false;
  let poster = null;

  function updatePause() {
    pauseButton.textContent = playing ? 'Ⅱ' : '▶';
    pauseButton.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${name} rotation`);
  }
  async function playback() {
    if (started && playing && visible && !document.hidden && !loading) {
      try { await video.play(); } catch { playing = false; updatePause(); }
    } else video.pause();
  }
  function draw() {
    const source = video.readyState >= 2 && !loading ? video : poster;
    if (!source) return;
    const sw = source === video ? video.videoWidth / 3 : source.naturalWidth / 3;
    const sh = source === video ? video.videoHeight : source.naturalHeight;
    if (!sw || !sh || !canvas.width || !canvas.height) return;
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, sw, 0, sw, sh, 0, 0, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w * Number(slider.value) / 100, h); ctx.clip();
    ctx.drawImage(source, mode === 'tokens' ? 2 * sw : 0, 0, sw, sh, 0, 0, w, h); ctx.restore();
  }
  new ResizeObserver(() => {
    const width = Math.min(scene.media.view_width, Math.round(viewer.clientWidth * Math.min(devicePixelRatio || 1, 2)));
    canvas.width = canvas.height = width; draw();
  }).observe(viewer);
  function frame() { draw(); video.requestVideoFrameCallback(frame); }
  if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(frame);
  else {
    const tick = () => { if (!video.paused) draw(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  video.addEventListener('seeked', draw);
  video.addEventListener('error', () => {
    loading = false; status.hidden = false;
    status.textContent = 'Video unavailable. Reload to retry.';
    buttons.forEach(b => { b.disabled = false; });
  });
  function split(value) {
    slider.value = String(Math.max(0, Math.min(100, value)));
    viewer.style.setProperty('--split', slider.value + '%');
    slider.setAttribute('aria-valuetext', `${slider.value}% ${mode === 'tokens' ? 'slice preview' : 'semantic'}, ${100 - slider.value}% textured`);
    draw();
  }
  slider.addEventListener('input', () => split(slider.value));
  let dragging = false;
  function move(e) {
    const rect = viewer.getBoundingClientRect();
    split(100 * (e.clientX - rect.left) / rect.width);
  }
  slider.addEventListener('pointerdown', e => {
    dragging = true; slider.setPointerCapture(e.pointerId); slider.focus(); move(e); e.preventDefault();
  });
  slider.addEventListener('pointermove', e => { if (dragging) move(e); });
  slider.addEventListener('pointerup', () => { dragging = false; });
  slider.addEventListener('pointercancel', () => { dragging = false; });
  function setMode(next) {
    // All representations occupy one decoded frame. A view change never loads,
    // pauses, or seeks a video, so it preserves the angle without a network wait.
    mode = next;
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    const label = mode === 'tokens' ? 'Slice preview' : 'Semantic';
    viewer.querySelector('.left-label').textContent = label;
    canvas.setAttribute('aria-label', `${name}, ${label.toLowerCase()} on the left and textured on the right`);
    slider.setAttribute('aria-label', `${name} comparison divider: percentage of ${label.toLowerCase()} view`);
    note.hidden = mode !== 'tokens';
    split(slider.value);
  }
  function loadPoster() {
    if (posterStarted) return;
    posterStarted = true;
    const img = new Image();
    img.onload = () => {
      poster = img; draw();
      buttons.forEach(b => { b.disabled = false; });
      if (!started) status.hidden = true;
      else if (loading) status.textContent = 'Preview ready · Loading animation…';
    };
    img.src = scene.media.poster;
  }
  function load() {
    if (started) return;
    started = true;
    loading = true;
    loadPoster();
    status.hidden = false;
    status.textContent = poster ? 'Preview ready · Loading animation…' : 'Loading turntable…';
    function ready() {
      if (!loading || video.readyState < 2) return;
      // Keep the poster visible while building a small initial buffer. Several
      // cards share the connection; starting at the first frame causes stalls.
      if (!video.buffered.length || video.buffered.end(0) < Math.min(3, video.duration)) return;
      loading = false; status.hidden = true;
      buttons.forEach(b => { b.disabled = false; });
      draw(); playback();
    }
    video.addEventListener('loadeddata', ready);
    video.addEventListener('progress', ready);
    video.addEventListener('canplaythrough', ready);
    video.preload = 'auto';
    video.src = scene.media.video;
  }
  buttons.forEach(b => b.addEventListener('click', () => {
    if (b.dataset.mode !== mode) setMode(b.dataset.mode);
  }));
  pauseButton.addEventListener('click', () => { playing = !playing; updatePause(); playback(); });
  document.addEventListener('visibilitychange', playback);
  // Fetch the small interactive still first, then buffer video one screen ahead.
  // Collapsed cards have no intersection and do not trigger either download.
  new IntersectionObserver((entries, observer) => {
    if (!entries[0].isIntersecting) return;
    loadPoster(); observer.disconnect();
  }, {rootMargin: `${2 * innerHeight}px 0px`, threshold: 0}).observe(viewer);
  new IntersectionObserver((entries, observer) => {
    if (!entries[0].isIntersecting) return;
    load(); observer.disconnect();
  }, {rootMargin: `${innerHeight}px 0px`, threshold: 0}).observe(viewer);
  // Prefetching never starts playback outside the actual viewport.
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) load();
    playback();
  }, {threshold: 0.05}).observe(viewer);
  setMode('semantic'); updatePause();
}

Promise.all(['scenes.json', 'web-scenes.json'].map(url => fetch(url).then(r => {
  if (!r.ok) throw Error(r.status);
  return r.json();
}))).then(([scenes, media]) => {
  scenes.forEach(scene => {
    scene.media = media[scene.id];
    scene.animated = Boolean(scene.animated && scene.media);
  });
  const gallery = document.querySelector('#gallery');
  const ready = scenes.filter(scene => scene.animated).length;
  const progress = document.querySelector('.preview-note');
  progress.hidden = ready === scenes.length;
  progress.textContent = `${ready} of ${scenes.length} turntables ready. Refresh to see newly completed scenes.`;
  const groups = new Map();
  for (const [room, title] of [['bedroom', 'Bedroom'], ['dining_room', 'Dining / Living Room']]) {
    const group = document.createElement('section');
    group.className = 'result-group';
    group.setAttribute('aria-labelledby', `${room}-heading`);
    group.innerHTML = `<h3 id="${room}-heading" class="result-group-title">${title}</h3>
      <div id="${room}-scenes" class="scene-grid"></div>
      <button type="button" class="show-more" aria-expanded="false" aria-controls="${room}-scenes">Show more <span aria-hidden="true">⌄</span></button>`;
    gallery.append(group);
    const grid = group.querySelector('.scene-grid');
    const toggle = group.querySelector('.show-more');
    toggle.setAttribute('aria-label', `Show more ${title.toLowerCase()} scenes`);
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.innerHTML = `${expanded ? 'Show less' : 'Show more'} <span aria-hidden="true">${expanded ? '⌃' : '⌄'}</span>`;
      toggle.setAttribute('aria-label', `${expanded ? 'Show fewer' : 'Show more'} ${title.toLowerCase()} scenes`);
      [...grid.children].forEach((card, index) => { card.hidden = !expanded && index >= 4; });
      if (!expanded) group.scrollIntoView({block: 'start'});
    });
    toggle.hidden = scenes.filter(scene => scene.room === room).length <= 4;
    groups.set(room, grid);
  }
  for (const scene of scenes) {
    const name = scene.room === 'bedroom' ? 'Bedroom' : 'Dining / Living Room';
    const grid = groups.get(scene.room);
    const card = document.createElement('article');
    card.className = 'scene-card';
    card.hidden = grid.children.length >= 4;
    card.dataset.scene = scene.id;
    card.setAttribute('aria-label', name);
    const caption = document.createElement('div');
    caption.className = 'scene-caption';
    caption.append(document.createTextNode(name));
    if (!scene.animated) {
      const badge = document.createElement('span'); badge.textContent = 'Still preview'; caption.append(badge);
    }
    card.append(caption);
    const controls = document.createElement('div');
    controls.className = 'mode-switch';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', `${name} comparison view`);
    for (const [mode, label] of [['semantic', 'Semantic room'], ['tokens', 'RoomToken slices']]) {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.mode = mode; button.textContent = label;
      button.setAttribute('aria-pressed', String(mode === 'semantic'));
      button.disabled = true;
      if (!scene.animated) button.title = 'Available when this scene’s turntable is rendered';
      controls.append(button);
    }
    card.append(controls);
    if (scene.animated) {
      const note = document.createElement('p'); note.className = 'mode-note'; note.hidden = true;
      note.textContent = 'Reconstructed from retrieved object bounds; native token grids were not saved.';
      card.append(note);
      createTurntable(card, scene, name);
    } else {
      const img = document.createElement('img');
      img.src = scene.poster; img.alt = name + ' semantic scene';
      img.width = img.height = 800; img.loading = 'lazy';
      card.prepend(img);
    }
    grid.append(card);
  }
  // Resolve old direct links after the grid has been inserted asynchronously.
  if (location.hash === '#prototype') document.querySelector('#prototype')?.scrollIntoView();
}).catch(() => {
  document.querySelector('#gallery').textContent = 'Scene previews could not load. Please reload.';
});
