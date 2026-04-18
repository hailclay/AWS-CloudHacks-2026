const API = 'http://localhost:5001';
const answers = {};
const POSTS_KEY = 'trailmatch_posts';
const MEETUPS_KEY = 'trailmatch_meetups';

let currentHike = null;
let activePostHikeId = null;
let activePostHikeName = null;
let activeMeetupId = null;
let prevPage = 'social';
let uploadedPostPhoto = '';
let lastRecommendations = [];
let lastRecommendationsMeta = { location: '', radiusMiles: null };

let leafletMap = null;
let leafletMarkers = new Map();
let leafletLoadPromise = null;

const FALLBACK_TRAILS = [
  {
    id: 'mist-trail-yosemite',
    name: 'Mist Trail (Vernal & Nevada Falls), CA',
    tagline: 'Granite steps, roaring mist, and classic Yosemite drama.',
    tags: ['moderate–hard', 'waterfalls', 'spring–fall'],
    desc: 'A Yosemite favorite with constant water and big payoffs. Expect misty spray, stone staircases, and unforgettable falls.',
    emoji: '💦',
    lat: 37.7325,
    lng: -119.5586
  },
  {
    id: 'angels-landing-zion',
    name: 'Angels Landing, UT',
    tagline: 'Knife-edge views over Zion Canyon.',
    tags: ['hard', 'exposure', 'spring–fall'],
    desc: 'A legendary ridge walk with massive views. Not for the faint of heart; check permit requirements before you go.',
    emoji: '🧗',
    lat: 37.2692,
    lng: -112.9509
  },
  {
    id: 'bright-angel-grand-canyon',
    name: 'Bright Angel Trail, AZ',
    tagline: 'Descend into the Grand Canyon’s layers of time.',
    tags: ['hard', 'desert', 'fall–spring'],
    desc: 'Iconic canyon hiking with water stops (seasonal) and huge elevation changes. Start early and respect the heat.',
    emoji: '🌵',
    lat: 36.0576,
    lng: -112.1433
  },
  {
    id: 'ocean-path-acadia',
    name: 'Ocean Path to Otter Cliffs, ME',
    tagline: 'Salt air and granite cliffs on the Atlantic.',
    tags: ['easy–moderate', 'coast', 'summer–fall'],
    desc: 'A scenic Acadia stroll with ocean views and cliffside drama. Great for sunrise and sea-breeze resets.',
    emoji: '🌊',
    lat: 44.3209,
    lng: -68.1887
  },
  {
    id: 'runyon-canyon-la',
    name: 'Runyon Canyon, CA',
    tagline: 'City views, quick climb, instant reward.',
    tags: ['easy–moderate', 'views', 'year-round'],
    desc: 'A classic LA hike for skyline sunsets and a fast sweat. Busy at peak times—go early for quieter trails.',
    emoji: '🌇',
    lat: 34.1053,
    lng: -118.348
  },
  {
    id: 'rattlesnake-ledge-wa',
    name: 'Rattlesnake Ledge, WA',
    tagline: 'A short climb to a huge lake overlook.',
    tags: ['moderate', 'forest', 'spring–fall'],
    desc: 'A popular Seattle-area hike with a punchy ascent and a dramatic view over Rattlesnake Lake.',
    emoji: '🏞️',
    lat: 47.4339,
    lng: -121.7849
  },
  {
    id: 'garden-of-the-gods-co',
    name: 'Garden of the Gods (Loop), CO',
    tagline: 'Red rock spires and wide-open skies.',
    tags: ['easy', 'red rock', 'year-round'],
    desc: 'An easy, stunning loop among towering sandstone formations. Sunrise and golden hour are unreal.',
    emoji: '🪨',
    lat: 38.8784,
    lng: -104.8693
  },
  {
    id: 'twin-peaks-sf',
    name: 'Twin Peaks (Viewpoint), CA',
    tagline: 'A breezy summit with a 360° city panorama.',
    tags: ['easy', 'views', 'year-round'],
    desc: 'A quick SF viewpoint with sweeping Bay Area views. Bring a layer—wind is part of the experience.',
    emoji: '🌬️',
    lat: 37.7544,
    lng: -122.4477
  }
];

function getPosts() {
  return JSON.parse(localStorage.getItem(POSTS_KEY) || '[]');
}

function savePosts(posts) {
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
}

function getMeetups() {
  return JSON.parse(localStorage.getItem(MEETUPS_KEY) || '[]');
}

function saveMeetups(meetups) {
  localStorage.setItem(MEETUPS_KEY, JSON.stringify(meetups));
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');

  const activeBtn = document.querySelector(`.nav-btn[data-page="${name}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  if (name === 'social') loadSocialFeed();
  if (name === 'map') {
    ensureLeafletMap();
    renderMapRecommendations();
  }
}

function openDetail(hike) {
  const activePage = document.querySelector('.page.active');
  prevPage = activePage ? activePage.id.replace('page-', '') : 'social';

  currentHike = hike;
  document.getElementById('detail-title').textContent = hike.name;
  document.getElementById('detail-desc').textContent = hike.desc;

  const tagRow = document.getElementById('detail-tags');
  tagRow.innerHTML = '';

  (hike.tags || []).forEach(tag => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = tag;
    tagRow.appendChild(span);
  });

  const mapBtn = document.getElementById('detail-map-btn');
  if (mapBtn) {
    const hasCoords = Number.isFinite(hike.lat) && Number.isFinite(hike.lng);
    mapBtn.style.display = hasCoords ? 'inline-flex' : 'none';
  }

  document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
  document.getElementById('page-detail').classList.add('active');

  const firstTabBtn = document.querySelector('.detail-tab');
  switchTab('posts', firstTabBtn);
  loadDetailPosts(hike.id);
  loadDetailMeetups(hike.id);
}

function goBack() {
  showPage(prevPage);
}

function switchTab(name, btn = null) {
  document.querySelectorAll('.detail-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

  const panel = document.getElementById('tab-' + name);
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
}

function pick(btn) {
  const q = btn.dataset.q;
  document.querySelectorAll(`[data-q="${q}"]`).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  answers[q] = btn.dataset.v;

  const filled = Object.keys(answers).length;
  document.getElementById('progress').style.width = (filled / 5 * 100) + '%';
  document.getElementById('submit-btn').disabled = filled < 5;
}

function buildQuizAnalysis(answers) {
  const environmentText = {
    forest: "grounded, calm, and comforted by nature",
    mountain: "ambitious, driven, and inspired by big challenges",
    beach: "easygoing, reflective, and drawn to open, freeing spaces",
    desert: "independent, thoughtful, and comfortable with solitude"
  };

  const fitnessText = {
    beginner: "You like experiences that feel accessible and enjoyable rather than overwhelming.",
    moderate: "You enjoy a healthy challenge, but still want your hike to feel fun and balanced.",
    advanced: "You seem energized by effort and probably like feeling that you earned the view.",
    expert: "You are clearly drawn to intensity, adventure, and pushing your limits."
  };

  const sceneryText = {
    wildlife: "You seem observant and curious, someone who likes the little details along the trail.",
    views: "You are probably motivated by dramatic payoffs and big memorable moments.",
    water: "You seem to crave calm, movement, and refreshing scenery that helps you reset.",
    flowers: "You likely appreciate beauty, softness, and the quieter side of the outdoors."
  };

  const groupText = {
    solo: "You probably use hiking as personal time to think, recharge, and be present.",
    partner: "You seem to enjoy connection and shared experiences without wanting a huge crowd.",
    group: "You bring social energy and probably enjoy turning hikes into shared memories."
  };

  const vibeText = {
    adventure: "Overall, you seem like someone who wants excitement and a trail that feels alive.",
    peaceful: "Overall, you seem to be looking for peace, stillness, and a real mental reset.",
    scenic: "Overall, you are drawn to beauty and moments that feel worth remembering.",
    discovery: "Overall, you seem curious and open to hidden gems, surprises, and exploration."
  };

  const env = environmentText[answers["1"]] || "connected to the outdoors";
  const fit = fitnessText[answers["2"]] || "";
  const see = sceneryText[answers["3"]] || "";
  const who = groupText[answers["4"]] || "";
  const vibe = vibeText[answers["5"]] || "";

  return `You seem ${env}. ${fit} ${see} ${who} ${vibe}`;
}

async function submitQuiz() {
  const labels = {
    '1': { forest: 'forest person', mountain: 'mountain person', beach: 'coastal person', desert: 'desert canyon lover' },
    '2': { beginner: 'beginner hiker', moderate: 'casual hiker', advanced: 'experienced trekker', expert: 'expert summit chaser' },
    '3': { wildlife: 'wildlife and birds', views: 'panoramic views', water: 'waterfalls and rivers', flowers: 'wildflowers and meadows' },
    '4': { solo: 'going solo', partner: 'with a partner or friend', group: 'with a group' },
    '5': { adventure: 'adventure and pushing limits', peaceful: 'peace and solitude', scenic: 'scenic photo-worthy beauty', discovery: 'exploration and hidden gems' }
  };

  const prompt = `You are a hiking guide. Based on this hiker's profile, recommend 3 real US trails.

Profile:
- Environment: ${labels['1'][answers['1']]}
- Fitness: ${labels['2'][answers['2']]}
- Wants to see: ${labels['3'][answers['3']]}
- Hiking with: ${labels['4'][answers['4']]}
- Vibe: ${labels['5'][answers['5']]}

Return ONLY a JSON array of 3 trails, no markdown:
[
  {
    "id": "slug-no-spaces",
    "name": "Trail Name, State",
    "tagline": "short poetic description",
    "tags": ["difficulty", "terrain", "best season"],
    "desc": "2-3 sentence vivid description",
    "emoji": "one relevant emoji"
  }
  ]`;

  const locationInput = document.getElementById('hike-location');
  const radiusInput = document.getElementById('hike-radius');
  const locationText = (locationInput ? locationInput.value : '').trim();
  const radiusMiles = radiusInput ? Number(radiusInput.value || 10) : 10;

  const navResults = document.getElementById('nav-results');
  if (navResults) navResults.style.display = 'block';
  const navMap = document.getElementById('nav-map');
  if (navMap) navMap.style.display = 'block';

  showPage('results');
  const openMapBtn = document.getElementById('open-map-btn');
  if (openMapBtn) openMapBtn.style.display = 'none';

  document.getElementById('hike-loading').style.display = 'block';
  document.getElementById('hike-loading').innerHTML = `
    <div class="loading-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    <p style="font-size:13px;color:var(--text-muted)">Finding your trails...</p>
  `;
  document.getElementById('hike-grid').innerHTML = '';

  const analysis = buildQuizAnalysis(answers);
  document.getElementById('quiz-analysis-text').textContent = analysis;
  document.getElementById('quiz-analysis').style.display = 'block';


  try {
    let hikes = [];
    let meta = { location: '', radiusMiles };

    if (locationText) {
      const res = await fetch(`${API}/find-hikes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: locationText, radius: radiusMiles, answers })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data && data.error ? data.error : 'Could not find nearby hikes.';
        throw new Error(msg);
      }

      meta = { location: data.location || locationText, radiusMiles };
      hikes = (data.hikes || []).map(normalizeNearbyHike);
      hikes = hikes.filter(h => Number.isFinite(h.lat) && Number.isFinite(h.lng));
    } else {
      const res = await fetch(`${API}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
      });

      if (!res.ok) throw new Error('Could not get hike recommendations.');
      const data = await res.json();

      const text = Array.isArray(data.content)
        ? data.content.map(item => item.text || '').join('')
        : (data.content || '');

      hikes = JSON.parse(text.replace(/```json|```/g, '').trim());
    }

    lastRecommendations = hikes.length ? hikes : pickRandom(FALLBACK_TRAILS, 6);
    lastRecommendationsMeta = meta;

    document.getElementById('hike-loading').style.display = 'none';
    renderHikeCards(lastRecommendations);

    if (openMapBtn) openMapBtn.style.display = 'inline-flex';
  } catch (error) {
    lastRecommendations = pickRandom(FALLBACK_TRAILS, 6);
    lastRecommendationsMeta = { location: locationText || 'United States', radiusMiles };

    renderHikeCards(lastRecommendations);
    if (openMapBtn) openMapBtn.style.display = 'inline-flex';

    document.getElementById('hike-loading').innerHTML = `
      <p style="color:#c00;font-size:13px; margin-bottom:10px;">Error: ${error.message}</p>
      <p style="font-size:12px;color:var(--text-muted)">Showing a few popular trails instead.</p>
    `;
  }
}

function renderHikeCards(hikes) {
  const grid = document.getElementById('hike-grid');
  grid.innerHTML = '';

  hikes.forEach(hike => {
    const card = document.createElement('div');
    card.className = 'hike-card';
    card.onclick = () => openDetail(hike);

    const imgStyle = hike.photo_url
      ? `style="background-image:url('${String(hike.photo_url).replace(/'/g, '%27')}')"`
      : '';
    const imgContent = hike.photo_url ? '' : (hike.emoji || '🏔');

    card.innerHTML = `
      <div class="hike-card-img" ${imgStyle}>${imgContent}</div>
      <div class="hike-card-body">
        <h3>${hike.name}</h3>
        <p>${hike.tagline}</p>
        <div class="tag-row">${(hike.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}</div>
      </div>
    `;

    grid.appendChild(card);
  });
}

function normalizeNearbyHike(hike) {
  const ratingText = hike.rating ? `⭐ ${hike.rating}` : '';
  const ratingCountText = hike.user_ratings_total ? `(${hike.user_ratings_total})` : '';
  const address = hike.address || '';
  const difficulty = hike.difficulty_guess || 'nearby';

  const tags = [difficulty, ratingText && `${ratingText} ${ratingCountText}`.trim()].filter(Boolean);

  return {
    id: hike.id || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())),
    name: hike.name || 'Trail',
    tagline: hike.vibe_match || hike.short_reason || 'A nearby trail match.',
    tags,
    desc: [hike.short_reason, address].filter(Boolean).join(' — '),
    emoji: '🥾',
    lat: Number(hike.lat),
    lng: Number(hike.lng),
    photo_url: hike.photo_url || null,
    address
  };
}

function pickRandom(list, n) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(n, arr.length));
}

function openMap() {
  showPage('map');
}

function viewCurrentHikeOnMap() {
  if (!currentHike) return;
  showPage('map');
  requestAnimationFrame(() => focusHikeOnMap(currentHike.id));
}

function ensureLeafletMap() {
  const mapEl = document.getElementById('map');
  const statusEl = document.getElementById('map-status');
  if (!mapEl) return;

  if (!window.L) {
    if (statusEl) statusEl.textContent = 'Loading map…';
    loadLeafletIfNeeded()
      .then(() => {
        if (!window.L) throw new Error('Leaflet did not load');
        ensureLeafletMap();
        renderMapRecommendations();
      })
      .catch(() => {
        if (statusEl) statusEl.textContent = 'Map library failed to load. Try serving this page (python3 -m http.server 8000).';
      });
    return;
  }

  if (leafletMap) {
    requestAnimationFrame(() => leafletMap.invalidateSize());
    return;
  }

  leafletMap = window.L.map('map', { zoomControl: true }).setView([39.5, -98.35], 4);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(leafletMap);

  requestAnimationFrame(() => leafletMap.invalidateSize());
}

function renderMapRecommendations() {
  const subtitleEl = document.getElementById('map-subtitle');
  const listEl = document.getElementById('map-list');
  const statusEl = document.getElementById('map-status');
  if (statusEl) statusEl.textContent = '';

  const hikesWithCoords = (lastRecommendations || []).filter(h => Number.isFinite(h.lat) && Number.isFinite(h.lng));
  const mapHikes = hikesWithCoords.length ? hikesWithCoords : FALLBACK_TRAILS;

  if (subtitleEl) {
    const loc = (lastRecommendationsMeta && lastRecommendationsMeta.location) ? lastRecommendationsMeta.location : 'United States';
    subtitleEl.textContent = `Showing ${mapHikes.length} trails near ${loc}`;
  }

  if (listEl) {
    listEl.innerHTML = '';
    mapHikes.forEach(hike => {
      const item = document.createElement('div');
      item.className = 'map-item';
      item.onclick = () => focusHikeOnMap(hike.id);
      item.innerHTML = `
        <div class="name">${hike.emoji ? `${hike.emoji} ` : ''}${escapeHTML(hike.name)}</div>
        <div class="meta">${escapeHTML(hike.tagline || '')}</div>
      `;
      listEl.appendChild(item);
    });
  }

  if (!leafletMap || !window.L) return;

  leafletMarkers.forEach(marker => marker.remove());
  leafletMarkers.clear();

  const bounds = window.L.latLngBounds();
  mapHikes.forEach(hike => {
    const marker = window.L.marker([hike.lat, hike.lng]).addTo(leafletMap);
    marker.bindPopup(`<strong>${escapeHTML(hike.name)}</strong><br/>${escapeHTML(hike.tagline || '')}`);
    leafletMarkers.set(hike.id, marker);
    bounds.extend([hike.lat, hike.lng]);
  });

  try {
    leafletMap.fitBounds(bounds.pad(0.2));
  } catch {
    // ignore
  }
}

function focusHikeOnMap(hikeId) {
  if (!leafletMap || !window.L) return;
  const marker = leafletMarkers.get(hikeId);
  if (!marker) return;
  leafletMap.setView(marker.getLatLng(), Math.max(leafletMap.getZoom(), 12), { animate: true });
  marker.openPopup();
}

function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function loadLeafletIfNeeded() {
  if (window.L) return Promise.resolve();
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise((resolve, reject) => {
    const head = document.head || document.getElementsByTagName('head')[0];
    if (!head) return reject(new Error('Missing <head>'));

    const cssHref = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
    if (!document.querySelector(`link[rel="stylesheet"][href="${cssHref}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssHref;
      head.appendChild(link);
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    head.appendChild(script);
  });

  return leafletLoadPromise;
}

function loadSocialFeed() {
  renderFeed(getPosts());
  renderMeetups(getMeetups(), 'meetups-list');
}

function renderFeed(posts) {
  const el = document.getElementById('social-feed');

  if (!posts.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🌲</div>No posts yet. Be the first to share!</div>';
    return;
  }

  const sortedPosts = [...posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  el.innerHTML = sortedPosts.map(post => postHTML(post)).join('');
}

function postHTML(post) {
  const initials = (post.author || 'A')
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const time = post.created_at ? new Date(post.created_at).toLocaleDateString() : '';

  return `
    <div class="post-card">
      <div class="post-meta">
        <div class="avatar">${initials}</div>
        <div class="post-meta-text">
          <div class="author">${post.author || 'Anonymous'}</div>
          <div class="hike-ref">${post.hike_name || 'General'}</div>
        </div>
      </div>
      ${post.photo_url ? `<img class="post-photo" src="${post.photo_url}" alt="trail photo" />` : ''}
      <div class="post-caption">${post.caption || ''}</div>
      <div class="post-time">${time}</div>
    </div>
  `;
}

function renderMeetups(meetups, targetId) {
  const el = document.getElementById(targetId);

  if (!meetups.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div>No meetups yet.</div>';
    return;
  }

  const sortedMeetups = [...meetups].sort((a, b) => {
    const aDate = new Date(`${a.date}T${a.time}`);
    const bDate = new Date(`${b.date}T${b.time}`);
    return aDate - bDate;
  });

  el.innerHTML = sortedMeetups.map(meetup => {
    const goingCount = (meetup.rsvps || []).filter(rsvp => rsvp.status === 'going').length;

    return `
      <div class="meetup-card" onclick="openMeetupDetails('${meetup.id}')">
        <h4>${meetup.hike_name || 'General'}</h4>
        <div class="meetup-meta">📅 ${meetup.date} at ${meetup.time} · by ${meetup.organizer}</div>
        ${meetup.notes ? `<div class="meetup-notes">${meetup.notes}</div>` : ''}
        <div class="meetup-notes" style="margin-top:8px; font-weight:500;">${goingCount} going</div>
      </div>
    `;
  }).join('');
}

function loadDetailPosts(hikeId) {
  const posts = getPosts().filter(post => post.hike_id === hikeId);
  const el = document.getElementById('detail-posts-feed');

  if (!posts.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📸</div>No posts for this trail yet.</div>';
    return;
  }

  const sortedPosts = [...posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  el.innerHTML = sortedPosts.map(post => postHTML(post)).join('');
}

function loadDetailMeetups(hikeId) {
  const meetups = getMeetups().filter(meetup => meetup.hike_id === hikeId);
  renderMeetups(meetups, 'detail-meetups-list');
}

function openPostModal(hikeId, hikeName) {
  activePostHikeId = hikeId || 'general';
  activePostHikeName = hikeName || 'General';
  document.getElementById('post-modal').classList.add('open');
}

function openMeetupModal(hikeId, hikeName) {
  activePostHikeId = hikeId || 'general';
  activePostHikeName = hikeName || 'General';
  document.getElementById('meetup-modal').classList.add('open');
}

function openMeetupDetails(meetupId) {
  const meetups = getMeetups();
  const meetup = meetups.find(m => m.id === meetupId);

  if (!meetup) return;

  activeMeetupId = meetupId;

  const goingCount = (meetup.rsvps || []).filter(rsvp => rsvp.status === 'going').length;
  const notGoingCount = (meetup.rsvps || []).filter(rsvp => rsvp.status === 'not-going').length;

  document.getElementById('meetup-detail-content').innerHTML = `
    <div style="margin-bottom:10px;">
      <div style="font-weight:600; font-size:15px; color:var(--text);">${meetup.hike_name || 'General'}</div>
      <div style="font-size:13px; color:var(--text-muted); margin-top:4px;">Hosted by ${meetup.organizer}</div>
    </div>
    <div style="font-size:13px; color:var(--text); margin-bottom:6px;">📅 ${meetup.date}</div>
    <div style="font-size:13px; color:var(--text); margin-bottom:6px;">⏰ ${meetup.time}</div>
    ${meetup.notes ? `<div style="font-size:13px; color:var(--text); margin-top:10px;">${meetup.notes}</div>` : ''}
  `;

  document.getElementById('meetup-rsvp-summary').innerHTML =
    `<strong>${goingCount}</strong> going · <strong>${notGoingCount}</strong> not going`;

  document.getElementById('rsvp-name').value = '';
  document.getElementById('meetup-detail-modal').classList.add('open');
}

function submitRSVP(status) {
  const name = document.getElementById('rsvp-name').value.trim();

  if (!name) {
    alert('Please enter your name.');
    return;
  }

  const meetups = getMeetups();
  const meetup = meetups.find(m => m.id === activeMeetupId);

  if (!meetup) return;

  if (!meetup.rsvps) {
    meetup.rsvps = [];
  }

  const existingRSVP = meetup.rsvps.find(rsvp => rsvp.name.toLowerCase() === name.toLowerCase());

  if (existingRSVP) {
    existingRSVP.status = status;
  } else {
    meetup.rsvps.push({ name, status });
  }

  saveMeetups(meetups);
  openMeetupDetails(activeMeetupId);
  loadSocialFeed();

  if (currentHike) {
    loadDetailMeetups(currentHike.id);
  }
}

function closeModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.remove('open'));

  const postAuthor = document.getElementById('post-author');
  const postCaption = document.getElementById('post-caption');
  const postPhoto = document.getElementById('post-photo');
  const meetupOrganizer = document.getElementById('meetup-organizer');
  const meetupDate = document.getElementById('meetup-date');
  const meetupTime = document.getElementById('meetup-time');
  const meetupNotes = document.getElementById('meetup-notes');
  const rsvpName = document.getElementById('rsvp-name');
  const previewWrap = document.getElementById('post-photo-preview-wrap');
  const previewImg = document.getElementById('post-photo-preview');

  if (postAuthor) postAuthor.value = '';
  if (postCaption) postCaption.value = '';
  if (postPhoto) postPhoto.value = '';
  if (meetupOrganizer) meetupOrganizer.value = '';
  if (meetupDate) meetupDate.value = '';
  if (meetupTime) meetupTime.value = '';
  if (meetupNotes) meetupNotes.value = '';
  if (rsvpName) rsvpName.value = '';

  uploadedPostPhoto = '';
  activeMeetupId = null;

  if (previewWrap) previewWrap.style.display = 'none';
  if (previewImg) previewImg.src = '';
}

function submitPost() {
  const author = document.getElementById('post-author').value.trim() || 'Anonymous';
  const caption = document.getElementById('post-caption').value.trim();

  if (!caption) {
    alert('Please add a caption!');
    return;
  }

  const posts = getPosts();

  posts.push({
    id: crypto.randomUUID(),
    hike_id: activePostHikeId,
    hike_name: activePostHikeName,
    author,
    caption,
    photo_url: uploadedPostPhoto,
    created_at: new Date().toISOString()
  });

  savePosts(posts);
  closeModals();
  loadSocialFeed();

  if (currentHike && activePostHikeId === currentHike.id) {
    loadDetailPosts(currentHike.id);
  }
}

function submitMeetup() {
  const organizer = document.getElementById('meetup-organizer').value.trim() || 'Anonymous';
  const date = document.getElementById('meetup-date').value;
  const time = document.getElementById('meetup-time').value;
  const notes = document.getElementById('meetup-notes').value.trim();

  if (!date || !time) {
    alert('Please pick a date and time!');
    return;
  }

  const meetups = getMeetups();

  meetups.push({
    id: crypto.randomUUID(),
    hike_id: activePostHikeId,
    hike_name: activePostHikeName,
    organizer,
    date,
    time,
    notes,
    rsvps: []
  });

  saveMeetups(meetups);
  closeModals();
  loadSocialFeed();

  if (currentHike && activePostHikeId === currentHike.id) {
    loadDetailMeetups(currentHike.id);
  }
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('post-photo');
  const previewWrap = document.getElementById('post-photo-preview-wrap');
  const previewImg = document.getElementById('post-photo-preview');

  if (fileInput) {
    fileInput.addEventListener('change', async event => {
      const file = event.target.files[0];

      if (!file) {
        uploadedPostPhoto = '';
        previewWrap.style.display = 'none';
        previewImg.src = '';
        return;
      }

      if (!file.type.startsWith('image/')) {
        alert('Please choose an image file.');
        fileInput.value = '';
        uploadedPostPhoto = '';
        previewWrap.style.display = 'none';
        previewImg.src = '';
        return;
      }

      try {
        uploadedPostPhoto = await fileToDataURL(file);
        previewImg.src = uploadedPostPhoto;
        previewWrap.style.display = 'block';
      } catch (error) {
        console.error(error);
        alert('Could not read the image file.');
      }
    });
  }

  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', event => {
      if (event.target === modal) {
        closeModals();
      }
    });
  });

  loadSocialFeed();
});
