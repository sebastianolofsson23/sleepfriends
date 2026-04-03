import { initializeApp }                                   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup,
         signOut, onAuthStateChanged }                      from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, getDocs,
         addDoc, deleteDoc, collection, query, where,
         orderBy, limit, onSnapshot,
         serverTimestamp }                                  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { firebaseConfig }                                   from './firebase-config.js';

// ── Init ──────────────────────────────────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── State ─────────────────────────────────────────────────────────────────────
let currentUser    = null;
let currentProfile = null;          // Firestore user doc data
let followingIds   = [];            // UIDs the current user follows
let unsubFeed      = null;
let unsubMyPosts   = null;

// ── Auth ──────────────────────────────────────────────────────────────────────
async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    console.error('Login error:', err);
  }
}

async function logout() {
  unsubFeed?.();
  unsubMyPosts?.();
  await signOut(auth);
}

// ── Users ─────────────────────────────────────────────────────────────────────
async function getOrCreateUser(fbUser) {
  const ref  = doc(db, 'users', fbUser.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  const profile = {
    displayName:   fbUser.displayName,
    photoURL:      fbUser.photoURL || '',
    email:         fbUser.email,
    shortcutToken: crypto.randomUUID(),
    createdAt:     serverTimestamp(),
  };
  await setDoc(ref, profile);
  return profile;
}

async function getAllUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// ── Follows ───────────────────────────────────────────────────────────────────
function followDocId(fromUid, toUid) { return `${fromUid}_${toUid}`; }

async function loadFollowing(uid) {
  const q    = query(collection(db, 'follows'), where('followerId', '==', uid));
  const snap = await getDocs(q);
  followingIds = snap.docs.map(d => d.data().followingId);
  return followingIds;
}

async function followUser(targetUid) {
  const id = followDocId(currentUser.uid, targetUid);
  await setDoc(doc(db, 'follows', id), {
    followerId:  currentUser.uid,
    followingId: targetUid,
    createdAt:   serverTimestamp(),
  });
  followingIds = [...followingIds, targetUid];
  refreshFeed();
}

async function unfollowUser(targetUid) {
  await deleteDoc(doc(db, 'follows', followDocId(currentUser.uid, targetUid)));
  followingIds = followingIds.filter(id => id !== targetUid);
  refreshFeed();
}

// ── Sleep posts ───────────────────────────────────────────────────────────────
async function postSleep({ bedtime, wakeTime, quality, notes }) {
  const bed  = new Date(bedtime);
  const wake = new Date(wakeTime);
  if (wake <= bed) { alert('Wake time must be after bedtime.'); return; }

  const hours = Math.round((wake - bed) / 36000) / 100; // 2 decimal places

  await addDoc(collection(db, 'sleep_posts'), {
    userId:      currentUser.uid,
    displayName: currentProfile.displayName,
    photoURL:    currentProfile.photoURL || '',
    bedtime:     bed.toISOString(),
    wakeTime:    wake.toISOString(),
    hoursSlept:  hours,
    quality:     quality ? parseInt(quality) : null,
    notes:       notes?.trim() || '',
    date:        bed.toISOString().split('T')[0],
    timestamp:   serverTimestamp(),
  });
}

function subscribeFeed(ids, cb) {
  if (ids.length === 0) { cb([]); return () => {}; }
  // Firestore 'in' supports up to 30 items; fine for v1
  const ids30 = ids.slice(0, 30);
  const q = query(
    collection(db, 'sleep_posts'),
    where('userId', 'in', ids30),
    orderBy('wakeTime', 'desc'),
    limit(60)
  );
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

function subscribeMyPosts(uid, cb) {
  const q = query(
    collection(db, 'sleep_posts'),
    where('userId', '==', uid),
    orderBy('wakeTime', 'desc'),
    limit(30)
  );
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ── Rendering helpers ─────────────────────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return '?';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function qualityColor(q) {
  if (!q)    return '#64748b';
  if (q >= 80) return 'var(--green)';
  if (q >= 60) return 'var(--yellow)';
  return 'var(--red)';
}

function sleepEmoji(h) {
  if (h >= 8) return '😴';
  if (h >= 7) return '😊';
  if (h >= 6) return '😐';
  return '😩';
}

function renderPost(post) {
  const h = post.hoursSlept ?? 0;
  const qColor = qualityColor(post.quality);
  return `
    <div class="sleep-card">
      <div class="card-header">
        <img class="avatar" src="${post.photoURL || ''}" alt=""
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect width=%2240%22 height=%2240%22 fill=%22%232a2a5c%22/><text x=%2250%%22 y=%2255%%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23818cf8%22 font-size=%2218%22>${(post.displayName||'?')[0].toUpperCase()}</text></svg>'">
        <div class="card-meta">
          <span class="card-name">${post.displayName || 'Unknown'}</span>
          <span class="card-date">${fmtDate(post.bedtime)}</span>
        </div>
        <span class="sleep-emoji">${sleepEmoji(h)}</span>
      </div>
      <div class="sleep-stats">
        <div class="sleep-times">
          <span>🌙 ${fmtTime(post.bedtime)}</span>
          <span class="time-arrow">→</span>
          <span>☀️ ${fmtTime(post.wakeTime)}</span>
        </div>
        <span class="sleep-hours">${h}h</span>
      </div>
      ${post.quality ? `
        <div class="quality-row">
          <span class="quality-label">Quality</span>
          <div class="quality-bar">
            <div class="quality-fill" style="width:${post.quality}%;background:${qColor}"></div>
          </div>
          <span class="quality-num" style="color:${qColor}">${post.quality}%</span>
        </div>` : ''}
      ${post.notes ? `<div class="card-notes">"${post.notes}"</div>` : ''}
    </div>`;
}

function renderFeedList(posts) {
  const el = document.getElementById('feed-list');
  if (posts.length === 0) {
    el.innerHTML = `<div class="empty-state">No posts yet.<br>
      <a href="#" id="go-discover">Follow some people</a> to see their sleep here.</div>`;
    document.getElementById('go-discover')?.addEventListener('click', e => {
      e.preventDefault(); showView('discover'); loadDiscover();
    });
    return;
  }
  el.innerHTML = posts.map(renderPost).join('');
}

function renderMyPostsList(posts) {
  const el = document.getElementById('my-sleep-list');
  el.innerHTML = posts.length
    ? posts.map(renderPost).join('')
    : '<div class="empty-state">No posts yet.</div>';
}

// ── Discover view ─────────────────────────────────────────────────────────────
async function loadDiscover() {
  const el    = document.getElementById('users-list');
  el.innerHTML = '<div class="loading-state">Loading...</div>';
  const users = await getAllUsers();
  const others = users.filter(u => u.uid !== currentUser.uid);

  if (others.length === 0) {
    el.innerHTML = '<div class="empty-state">No other users yet.</div>';
    return;
  }

  el.innerHTML = others.map(u => {
    const isFollowing = followingIds.includes(u.uid);
    return `
      <div class="user-row" data-uid="${u.uid}">
        <img class="avatar" src="${u.photoURL || ''}" alt=""
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect width=%2240%22 height=%2240%22 fill=%22%232a2a5c%22/><text x=%2250%%22 y=%2255%%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23818cf8%22 font-size=%2218%22>${(u.displayName||'?')[0].toUpperCase()}</text></svg>'">
        <div class="user-row-info">
          <div class="user-row-name">${u.displayName || 'User'}</div>
          <div class="user-row-meta">Member</div>
        </div>
        <button class="${isFollowing ? 'btn-unfollow' : 'btn-follow'}"
                data-uid="${u.uid}"
                data-following="${isFollowing}">
          ${isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>`;
  }).join('');

  el.querySelectorAll('[data-uid]').forEach(btn => {
    if (!btn.matches('button')) return;
    btn.addEventListener('click', async () => {
      const uid      = btn.dataset.uid;
      const isFollow = btn.dataset.following === 'true';
      btn.disabled   = true;
      isFollow ? await unfollowUser(uid) : await followUser(uid);
      await loadDiscover(); // re-render with updated state
    });
  });
}

// ── Profile view ──────────────────────────────────────────────────────────────
function loadProfile() {
  const { uid, displayName, photoURL } = currentUser;
  const { shortcutToken } = currentProfile;

  document.getElementById('profile-photo').src = photoURL || '';
  document.getElementById('profile-name').textContent  = displayName;
  document.getElementById('profile-stats').textContent =
    `Following ${followingIds.length} people`;

  document.getElementById('uid-display').textContent   = uid;
  document.getElementById('token-display').textContent = shortcutToken;

  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/sleep_posts?key=${firebaseConfig.apiKey}`;
  document.getElementById('firestore-url').textContent = url;

  // JSON template for the Shortcut
  document.getElementById('json-template').textContent = JSON.stringify({
    fields: {
      userId:        { stringValue: uid },
      shortcutToken: { stringValue: shortcutToken },
      displayName:   { stringValue: displayName },
      photoURL:      { stringValue: photoURL || '' },
      bedtime:       { stringValue: '<First Sample Start Date as ISO 8601>' },
      wakeTime:      { stringValue: '<Last Sample End Date as ISO 8601>' },
      hoursSlept:    { doubleValue: 0 },
      quality:       { doubleValue: 0 },
      date:          { stringValue: '<Wake Date as YYYY-MM-DD>' },
      notes:         { stringValue: '' },
    }
  }, null, 2);

  // Copy buttons
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.copy;
      const texts = {
        uid:   uid,
        token: shortcutToken,
        url,
        json:  document.getElementById('json-template').textContent,
      };
      navigator.clipboard.writeText(texts[type] || '').then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
      });
    });
  });

  // My posts (real-time)
  unsubMyPosts?.();
  unsubMyPosts = subscribeMyPosts(uid, renderMyPostsList);
}

// ── Feed refresh ──────────────────────────────────────────────────────────────
function refreshFeed() {
  unsubFeed?.();
  unsubFeed = subscribeFeed(followingIds, renderFeedList);
}

// ── View routing ──────────────────────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`${name}-view`).classList.remove('hidden');
  document.querySelectorAll('.nav-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.view === name)
  );
}

// ── Event listeners ───────────────────────────────────────────────────────────
document.getElementById('google-login-btn').addEventListener('click', loginWithGoogle);
document.getElementById('logout-btn').addEventListener('click', logout);

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const view = tab.dataset.view;
    showView(view);
    if (view === 'discover') loadDiscover();
  });
});

document.getElementById('manual-post-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.textContent = 'Posting…';
  btn.disabled    = true;
  try {
    await postSleep({
      bedtime:  document.getElementById('bedtime-input').value,
      wakeTime: document.getElementById('waketime-input').value,
      quality:  document.getElementById('quality-input').value,
      notes:    document.getElementById('notes-input').value,
    });
    e.target.reset();
    btn.textContent = 'Posted!';
    setTimeout(() => { btn.textContent = 'Post Sleep'; btn.disabled = false; }, 2000);
  } catch (err) {
    console.error(err);
    btn.textContent = 'Error — try again';
    btn.disabled = false;
  }
});

// ── Auth state ────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser    = user;
    currentProfile = await getOrCreateUser(user);
    await loadFollowing(user.uid);

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    loadProfile();
    refreshFeed();
    showView('feed');
  } else {
    currentUser = currentProfile = null;
    followingIds = [];
    unsubFeed?.(); unsubMyPosts?.();
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  }
});
