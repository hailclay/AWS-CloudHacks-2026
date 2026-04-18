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

 document.getElementById('nav-results').style.display = 'block';
showPage('results');
document.getElementById('hike-loading').style.display = 'block';
document.getElementById('hike-grid').innerHTML = '';
const analysis = buildQuizAnalysis(answers);
document.getElementById('quiz-analysis-text').textContent = analysis;
document.getElementById('quiz-analysis').style.display = 'block';


  try {
    const res = await fetch(`${API}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
    });

    if (!res.ok) {
      throw new Error('Could not get hike recommendations.');
    }

    const data = await res.json();

    const text = Array.isArray(data.content)
      ? data.content.map(item => item.text || '').join('')
      : (data.content || '');

    const hikes = JSON.parse(text.replace(/```json|```/g, '').trim());

    document.getElementById('hike-loading').style.display = 'none';
    renderHikeCards(hikes);
  } catch (error) {
    document.getElementById('hike-loading').innerHTML =
      `<p style="color:#c00;font-size:13px;">Error: ${error.message}</p>`;
  }
}

function renderHikeCards(hikes) {
  const grid = document.getElementById('hike-grid');
  grid.innerHTML = '';

  hikes.forEach(hike => {
    const card = document.createElement('div');
    card.className = 'hike-card';
    card.onclick = () => openDetail(hike);

    card.innerHTML = `
      <div class="hike-card-img">${hike.emoji || '🏔'}</div>
      <div class="hike-card-body">
        <h3>${hike.name}</h3>
        <p>${hike.tagline}</p>
        <div class="tag-row">${(hike.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}</div>
      </div>
    `;

    grid.appendChild(card);
  });
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
