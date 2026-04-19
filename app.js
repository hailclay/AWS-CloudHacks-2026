const API = 'http://localhost:5001';
const answers = {};
const POSTS_KEY = 'trailmatch_posts';
const MEETUPS_KEY = 'trailmatch_meetups';

let currentHike = null;
let currentHikeResults = [];
let activePostHikeId = null;
let activePostHikeName = null;
let activeMeetupId = null;
let prevPage = 'social';
let uploadedPostPhoto = '';
let selectedPostTrail = null;
let selectedMeetupTrail = null;

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

  const btns = document.querySelectorAll('.nav-btn');

  if (name === 'quiz' && btns[0]) btns[0].classList.add('active');
  if (name === 'results' && btns[1]) btns[1].classList.add('active');
  if (name === 'social' && btns[2]) {
    btns[2].classList.add('active');
    loadSocialFeed();
  }
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

async function submitQuiz() {
  const location = document.getElementById('quiz-location').value.trim();
  const radius = document.getElementById('quiz-radius').value;

  if (!location) {
    alert('Please enter a location.');
    return;
  }

  document.getElementById('nav-results').style.display = 'block';
  showPage('results');
  document.getElementById('hike-loading').style.display = 'block';
  document.getElementById('hike-grid').innerHTML = '';

  // show fallback analysis immediately so the section always appears
  document.getElementById('quiz-analysis-text').textContent =
    'You seem drawn to trails that match your energy, scenery preferences, and hiking style.';
  document.getElementById('quiz-analysis').style.display = 'block';

  try {
    const res = await fetch(`${API}/quiz-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers,
        location,
        radius
      })
    });

    const data = await res.json();
    console.log('quiz results:', data);

    if (!res.ok) {
      throw new Error(data.error || 'Could not get trail results.');
    }

    document.getElementById('quiz-analysis-text').textContent =
      data.analysis || 'You seem drawn to trails that match your energy, scenery preferences, and hiking style.';

    document.getElementById('hike-loading').style.display = 'none';
    renderHikeCards(data.trails || []);
  } catch (error) {
    console.error('submitQuiz error:', error);
    document.getElementById('hike-loading').style.display = 'none';
    document.getElementById('hike-grid').innerHTML = `
      <div class="empty-state" style="grid-column:1 / -1;">
        <div class="empty-icon">⚠️</div>
        ${error.message}
      </div>
    `;
  }
}

function renderHikeCards(hikes) {
  currentHikeResults = hikes;

  const grid = document.getElementById('hike-grid');
  grid.innerHTML = '';

  if (!hikes.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1 / -1;">
        <div class="empty-icon">🥾</div>
        No matching trails found.
      </div>
    `;
    return;
  }

  hikes.forEach(hike => {
    const card = document.createElement('div');
    card.className = 'hike-card';
    card.onclick = () => openDetail(hike);

    card.innerHTML = `
      <div class="hike-card-img">${hike.emoji || '🥾'}</div>
      <div class="hike-card-body">
        <h3>${hike.name}</h3>
        <p>${hike.tagline || ''}</p>
        <div class="tag-row">${(hike.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}</div>
      </div>
    `;

    grid.appendChild(card);
  });
}

function buildGoogleMapsUrl(trail) {
  if (!trail) return '#';

  if (trail.maps_url) {
    return trail.maps_url;
  }

  if (trail.lat && trail.lng) {
    return `https://www.google.com/maps/search/?api=1&query=${trail.lat},${trail.lng}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trail.name || 'trail')}`;
}

function getTrailReviews(trailName) {
  return getPosts().filter(post => post.tagged_trail && post.tagged_trail.name === trailName);
}

function getTrailAverageRating(trailName) {
  const reviews = getTrailReviews(trailName).filter(r => typeof r.rating === 'number');
  if (!reviews.length) return null;

  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  return {
    average: avg,
    count: reviews.length
  };
}

function updateDetailRating(trail) {
  const wrap = document.getElementById('detail-rating-wrap');
  const mapWrap = document.getElementById('detail-map-link');
  const rating = getTrailAverageRating(trail.name);

  if (rating) {
    wrap.innerHTML = `
      <div class="rating-badge">⭐ ${rating.average.toFixed(1)} / 5.0 · ${rating.count} review${rating.count === 1 ? '' : 's'}</div>
    `;
  } else {
    wrap.innerHTML = `<div class="rating-badge">⭐ No ratings yet</div>`;
  }

  mapWrap.innerHTML = `
    <a href="${buildGoogleMapsUrl(trail)}" target="_blank" rel="noopener noreferrer" style="color:var(--green); text-decoration:none; font-weight:500;">
      📍 Open in Google Maps
    </a>
  `;
}

function openDetail(hike) {
  const activePage = document.querySelector('.page.active');
  prevPage = activePage ? activePage.id.replace('page-', '') : 'social';

  currentHike = hike;
  document.getElementById('detail-title').textContent = hike.name;
  document.getElementById('detail-desc').textContent = hike.desc || '';

  const tagRow = document.getElementById('detail-tags');
  tagRow.innerHTML = '';

  (hike.tags || []).forEach(tag => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = tag;
    tagRow.appendChild(span);
  });

  updateDetailRating(hike);

  document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
  document.getElementById('page-detail').classList.add('active');

  const firstTabBtn = document.querySelector('.detail-tab');
  switchTab('posts', firstTabBtn);
  loadDetailPosts(hike.id);
  loadDetailMeetups(hike.id);
}

function loadSocialFeed() {
  renderFeed(getPosts());
  renderMeetups(getMeetups(), 'meetups-list');
}

function populateTrailSelect(selectId, selectedTrail = null) {
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = '<option value="">Choose a trail</option>';

  currentHikeResults.forEach((trail, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = trail.name;
    select.appendChild(option);
  });

  if (selectedTrail) {
    const matchIndex = currentHikeResults.findIndex(trail => trail.name === selectedTrail.name);
    if (matchIndex >= 0) {
      select.value = String(matchIndex);
    }
  }
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

      ${post.tagged_trail ? `
        <div style="margin-bottom:10px;">
          <a href="${post.tagged_trail.maps_url}" target="_blank" rel="noopener noreferrer" style="font-size:12px; color:var(--green); text-decoration:none; font-weight:500;">
            📍 ${post.tagged_trail.name}
          </a>
        </div>
      ` : ''}

      ${typeof post.rating === 'number' ? `
        <div style="font-size:13px; color:var(--text); margin-bottom:8px;">⭐ ${post.rating.toFixed(1)} · ${post.difficulty || 'No difficulty'}</div>
      ` : ''}

      ${post.review_tags && post.review_tags.length ? `
        <div class="tag-row" style="margin-bottom:10px;">
          ${post.review_tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>
      ` : ''}

      ${post.photo_url ? `<img class="post-photo" src="${post.photo_url}" alt="trail photo" />` : ''}
      <div class="post-caption">${post.caption || ''}</div>
      <div class="post-time">${time}</div>
    </div>
  `;
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

        ${meetup.tagged_trail ? `
          <div class="meetup-notes" style="margin-top:6px;">
            <a
              href="${meetup.tagged_trail.maps_url}"
              target="_blank"
              rel="noopener noreferrer"
              onclick="event.stopPropagation()"
              style="color:var(--green); text-decoration:none; font-weight:500;"
            >
              📍 ${meetup.tagged_trail.name}
            </a>
          </div>
        ` : ''}

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
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📸</div>No reviews for this trail yet.</div>';
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
  selectedPostTrail = currentHike || null;

  populateTrailSelect('post-trail-select', selectedPostTrail);
  document.getElementById('post-modal').classList.add('open');
}

function openMeetupModal(hikeId, hikeName) {
  activePostHikeId = hikeId || 'general';
  activePostHikeName = hikeName || 'General';
  selectedMeetupTrail = currentHike || null;

  populateTrailSelect('meetup-trail-select', selectedMeetupTrail);
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
    ${meetup.tagged_trail ? `
      <div style="margin-bottom:8px;">
        <a href="${meetup.tagged_trail.maps_url}" target="_blank" rel="noopener noreferrer" style="font-size:13px; color:var(--green); text-decoration:none; font-weight:500;">
          📍 ${meetup.tagged_trail.name}
        </a>
      </div>
    ` : ''}
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

  const fields = [
    'post-author',
    'post-caption',
    'post-photo',
    'meetup-organizer',
    'meetup-date',
    'meetup-time',
    'meetup-notes',
    'rsvp-name'
  ];

  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const postTrailSelect = document.getElementById('post-trail-select');
  const meetupTrailSelect = document.getElementById('meetup-trail-select');
  const previewWrap = document.getElementById('post-photo-preview-wrap');
  const previewImg = document.getElementById('post-photo-preview');
  const postTags = document.getElementById('post-tags');

  if (postTrailSelect) postTrailSelect.value = '';
  if (meetupTrailSelect) meetupTrailSelect.value = '';
  if (previewWrap) previewWrap.style.display = 'none';
  if (previewImg) previewImg.src = '';
  if (postTags) Array.from(postTags.options).forEach(option => option.selected = false);

  const postRating = document.getElementById('post-rating');
  const postDifficulty = document.getElementById('post-difficulty');
  if (postRating) postRating.value = '5';
  if (postDifficulty) postDifficulty.value = 'Beginner';

  uploadedPostPhoto = '';
  activeMeetupId = null;
  selectedPostTrail = null;
  selectedMeetupTrail = null;
}

function submitPost() {
  const author = document.getElementById('post-author').value.trim() || 'Anonymous';
  const caption = document.getElementById('post-caption').value.trim();
  const trailIndex = document.getElementById('post-trail-select').value;
  const rating = Number(document.getElementById('post-rating').value);
  const difficulty = document.getElementById('post-difficulty').value;
  const reviewTags = Array.from(document.getElementById('post-tags').selectedOptions).map(option => option.value);

  if (!caption) {
    alert('Please add a comment!');
    return;
  }

  let taggedTrail = null;
  if (trailIndex !== '') {
    taggedTrail = currentHikeResults[Number(trailIndex)];
  } else if (currentHike) {
    taggedTrail = currentHike;
  }

  const posts = getPosts();

  posts.push({
    id: crypto.randomUUID(),
    hike_id: activePostHikeId,
    hike_name: activePostHikeName,
    author,
    caption,
    photo_url: uploadedPostPhoto,
    created_at: new Date().toISOString(),
    rating,
    difficulty,
    review_tags: reviewTags,
    tagged_trail: taggedTrail
      ? {
          name: taggedTrail.name,
          lat: taggedTrail.lat || null,
          lng: taggedTrail.lng || null,
          maps_url: buildGoogleMapsUrl(taggedTrail)
        }
      : null
  });

  savePosts(posts);
  closeModals();
  loadSocialFeed();

  if (currentHike && activePostHikeId === currentHike.id) {
    loadDetailPosts(currentHike.id);
    updateDetailRating(currentHike);
  }
}

function submitMeetup() {
  const organizer = document.getElementById('meetup-organizer').value.trim() || 'Anonymous';
  const date = document.getElementById('meetup-date').value;
  const time = document.getElementById('meetup-time').value;
  const notes = document.getElementById('meetup-notes').value.trim();
  const trailIndex = document.getElementById('meetup-trail-select').value;

  if (!date || !time) {
    alert('Please pick a date and time!');
    return;
  }

  let taggedTrail = null;
  if (trailIndex !== '') {
    taggedTrail = currentHikeResults[Number(trailIndex)];
  } else if (currentHike) {
    taggedTrail = currentHike;
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
    rsvps: [],
    tagged_trail: taggedTrail
      ? {
          name: taggedTrail.name,
          lat: taggedTrail.lat || null,
          lng: taggedTrail.lng || null,
          maps_url: buildGoogleMapsUrl(taggedTrail)
        }
      : null
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
