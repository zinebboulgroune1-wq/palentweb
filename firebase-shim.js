// Connects the site's admin panel, visitor log and requests to Firebase (Auth + Firestore).
// Leave FIREBASE_CONFIG empty in firebase-config.js and the site still works without it.
(function () {
  'use strict';
  var C = window.FIREBASE_CONFIG;
  if (!C || !C.apiKey || !window.firebase) return;
  window.FB_MODE = true;
  firebase.initializeApp(C);
  var auth = firebase.auth(), fs = firebase.firestore();
  var OWNER = String(window.OWNER_EMAIL || '').trim().toLowerCase();
  var isOwner = function (u) { return !!(u && !u.isAnonymous && u.email && u.email.toLowerCase() === OWNER); };
  var ready = new Promise(function (res) {
    var done = false;
    auth.onAuthStateChanged(function (u) {
      if (done) return;
      if (!u) { auth.signInAnonymously().catch(function () { done = true; res(null); }); return; }
      done = true; res(u);
    });
  });
  var snap = function (d) { return { id: d.id, exists: d.exists, data: function () { return d.exists ? d.data() : undefined; }, metadata: { fromCache: false, hasPendingWrites: false } }; };
  var qsnap = function (q) { var docs = q.docs.map(snap); return { docs: docs, size: docs.length, empty: !docs.length, docChanges: function () { return []; }, metadata: {} }; };
  var noop = function () {};
  function docRef(p) {
    var r = fs.doc(p);
    return {
      id: r.id, path: p,
      get: function () { return r.get().then(snap); },
      set: function (d) { return r.set(d); },
      update: function (d) { return r.update(d); },
      delete: function () { return r.delete(); },
      onSnapshot: function (n, e) { return r.onSnapshot(function (s) { n(snap(s)); }, e || noop); },
      collection: function (sub) { return colRef(p + '/' + sub); }
    };
  }
  function colRef(p) {
    var r = fs.collection(p);
    return {
      path: p,
      doc: function (id) { return docRef(p + '/' + (id || r.doc().id)); },
      get: function () { return r.get().then(qsnap); },
      onSnapshot: function (n, e) { return r.onSnapshot(function (q) { n(qsnap(q)); }, e || noop); },
      add: function (d) { return r.add(d).then(function (x) { return docRef(p + '/' + x.id); }); }
    };
  }
  var user = {
    isOwner: function () { return ready.then(isOwner); },
    canEdit: function () { return ready.then(isOwner); },
    can: function () { return Promise.resolve(null); },
    id: function () { return ready.then(function (u) { return u ? u.uid : null; }); },
    me: function () { return ready.then(function (u) { return { id: u ? u.uid : null, name: '', email: null, isOwner: isOwner(u), canEdit: isOwner(u) }; }); },
    profiles: function (ids) { var o = {}; [].concat(ids || []).forEach(function (i) { o[i] = { id: i, name: '', avatarUrl: '', color: '#64748B', email: null, isMe: false, guest: false }; }); return Promise.resolve(o); }
  };
  var db = { doc: docRef, collection: colRef };
  window.claude = { use: function (n) { return ready.then(function () { return n === 'db' ? db : n === 'user' ? user : null; }); } };
  window.FB = {
    login: function (e, p) { return auth.signInWithEmailAndPassword(e, p); },
    logout: function () { return auth.signOut(); },
    isOwner: function () { return Promise.resolve(isOwner(auth.currentUser)); }
  };
})();
