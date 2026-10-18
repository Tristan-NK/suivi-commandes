(function() {
  'use strict';

  /* ==========================================================================
     BASE DE DONNÉES GÉOGRAPHIQUE & TARIFS DU GRAND LIBREVILLE (GABON)
     ========================================================================== */
  var CITY_PRICES = {
    'Libreville': 2000,
    'Owendo': 3000,
    'Akanda': 3000,
    'Ntoum': 4000
  };

  var GABON_LOCATIONS = {
    "Libreville": [
      "Akébé (Frontière)", "Akébé (Poteaux)", "Akébé (Ville)", "Alibandeng",
      "Anguile", "Awendjé", "Baraka", "Batterie IV", "Belle-Vue (1, 2, 3)",
      "Camp de Police", "Charbonnages", "Chantiers", "Cocotiers", "Damé",
      "Derrière la Prison", "Glass", "Gros Bouquet", "Haut de Gué-Gué",
      "Bas de Gué-Gué", "IAI", "Kinguélé", "Kiliba", "La Peyrie",
      "Lalala (À droite)", "Lalala (À gauche)", "Lalala (Dakar)", "Likouala",
      "London", "Louis", "Mindoubé (1, 2, 3)", "Montagne Sainte", "Mont-Bouët",
      "Nkembo", "Nomba Domaine", "Nzeng-Ayong (Chantiers)", "Nzeng-Ayong (Dragages)",
      "Nzeng-Ayong (Fin Goudron)", "Nzeng-Ayong (Rond-Point)", "Oloumi (Zone industrielle)",
      "Petit Paris", "Plaine Niger", "Plaine Orety", "Plein Ciel (Bisségué)",
      "PK 5", "PK 6", "PK 7", "PK 8", "PK 9", "PK 10", "PK 11", "PK 12",
      "Quartier Sorbonne", "Rio (Carrefour)", "Sablière", "Sainte-Marie",
      "Sotéga", "Tsinga", "Venez-Voir"
    ],
    "Owendo": [
      "Akournam 1", "Akournam 2", "Alénakiri", "Awoungou", "Barracuda",
      "Cité Octra", "Cité SNI", "Gare Setrag", "Igoumié", "Port d'Owendo",
      "Razel", "Virage Port-Môle", "Zone Industrielle Owendo"
    ],
    "Akanda": [
      "Angondjé (Château)", "Angondjé (Carrefour Amissa)", "Angondjé (Delta)",
      "Angondjé (Cité des Ailes)", "Angondjé (Sherko)", "Avorbam", "Beau-Séjour",
      "Cap Caravane", "Cap Estérias", "Cap Santa Clara", "Carrefour Gigi",
      "Malibé 1", "Malibé 2", "Premier Campement", "Sablière Nord"
    ],
    "Ntoum": [
      "Bikélé", "Centre-ville Ntoum", "Donguila", "Essassa", "Meyang",
      "Nkoltang", "Okolassi", "Zone Economique Spéciale (ZES Nkok)"
    ]
  };

  /* ==========================================================================
     ETAT ET CLÉS LOCALSTORAGE
     ========================================================================== */
  var $ = function(s) { return document.querySelector(s); };
  var $$ = function(s) { return document.querySelectorAll(s); };

  var STORAGE_ORDERS = 'cmd_gabon_orders_v4';
  var STORAGE_SOUND = 'cmd_gabon_sound_choice';
  var STORAGE_CUSTOM_AUDIO = 'cmd_gabon_custom_audio_data';
  var STORAGE_CUSTOM_AUDIO_NAME = 'cmd_gabon_custom_audio_name';
  var STORAGE_USER = 'cmd_gabon_user_session';
  var STORAGE_THEME = 'cmd_gabon_theme_v4';

  var orders = [];
  var editOrderId = null;
  var actx = null;
  var customAudioElement = null;
  var snoozeUntil = 0;
  var activeScreen = 'todo';
  var pwaDeferredPrompt = null;
  var openAccordions = {}; // Trace les cartes dépliées par ID

  // Filtres
  var filterSearchText = '';
  var filterSelectedCity = '';
  var filterOnlyLate = false;

  /* ==========================================================================
     UTILITAIRES DE STOCKAGE
     ========================================================================== */
  function lget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function loadOrders() {
    try {
      var raw = lget(STORAGE_ORDERS);
      if (raw) {
        orders = JSON.parse(raw);
        if (Array.isArray(orders)) return;
      }
    } catch (e) {}

    // Migration transparente si d'anciennes commandes existaient
    try {
      var prev = lget('cmd_gabon_orders_v3') || lget('cmd_v1');
      if (prev) {
        var parsed = JSON.parse(prev);
        if (Array.isArray(parsed) && parsed.length) {
          orders = parsed.map(function(o) {
            return {
              id: o.id || ('ord_' + Date.now()),
              num: o.num || 'GA-001',
              client: o.client || o.cli || 'Client',
              articles: o.articles || (o.art ? (o.art + ' article(s)') : 'Articles divers'),
              pieces: o.pieces || o.pcs || 1,
              fee: o.fee || 2000,
              city: o.city || 'Libreville',
              quarter: o.quarter || o.place || 'Libreville',
              due: o.due || Date.now(),
              done: !!o.done,
              doneAt: o.doneAt,
              notified: false
            };
          });
          saveOrders();
          return;
        }
      }
    } catch (e) {}

    orders = [];
  }

  function syncAlarmsWithServiceWorker() {
    if ('serviceWorker' in navigator) {
      var pending = orders.filter(function(o) { return !o.done; });
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SYNC_ALARMS',
          orders: pending
        });
      } else {
        navigator.serviceWorker.ready.then(function(reg) {
          if (reg && reg.active) {
            reg.active.postMessage({
              type: 'SYNC_ALARMS',
              orders: pending
            });
          }
        }).catch(function() {});
      }
    }
  }

  function saveOrders() {
    lset(STORAGE_ORDERS, JSON.stringify(orders));
    syncAlarmsWithServiceWorker();
  }

  function showToast(msg, type) {
    var c = $('#toastContainer');
    if (!c) return;
    var t = document.createElement('div');
    t.className = 'toast-msg toast-' + (type || 'info');
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(function() {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 2800);
  }

  function customConfirm(title, msg) {
    return new Promise(function(resolve) {
      var modal = $('#confirmModal');
      $('#confirmTitle').textContent = title || 'Confirmation';
      $('#confirmMsg').textContent = msg;
      modal.classList.remove('hid');

      function finish(val) {
        modal.classList.add('hid');
        $('#confirmOkBtn').removeEventListener('click', onOk);
        $('#confirmCancelBtn').removeEventListener('click', onCancel);
        resolve(val);
      }
      function onOk() { finish(true); }
      function onCancel() { finish(false); }

      $('#confirmOkBtn').addEventListener('click', onOk);
      $('#confirmCancelBtn').addEventListener('click', onCancel);
    });
  }

  /* ==========================================================================
     GESTION DE SESSION (CONNEXION & DÉCONNEXION SIMPLE)
     ========================================================================== */
  function getUserSession() {
    try {
      return JSON.parse(lget(STORAGE_USER) || 'null');
    } catch (e) {
      return null;
    }
  }

  function checkSession() {
    var session = getUserSession();
    if (session && session.isLoggedIn) {
      openAppSession(session);
    } else {
      showLoginScreen(session);
    }
  }

  function showLoginScreen(savedSession) {
    $('#loginScreen').classList.remove('hid');
    $('#mainAppInterface').classList.add('hid');
    if (savedSession && savedSession.username) {
      $('#loginUsername').value = savedSession.username;
    }
    $('#loginPin').value = '';
    $('#loginError').textContent = '';
  }

  function handleLoginSubmit() {
    var username = $('#loginUsername').value.trim();
    var pin = $('#loginPin').value.trim();
    var err = $('#loginError');
    err.textContent = '';

    if (!username) {
      err.textContent = 'Veuillez saisir votre nom ou celui de votre boutique.';
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      err.textContent = 'Le code PIN doit comporter entre 4 et 6 chiffres.';
      return;
    }

    var saved = getUserSession();
    // Si c'est le premier login ou si le pin correspond
    if (saved && saved.pin && saved.pin !== pin) {
      err.textContent = 'Code PIN incorrect.';
      $('#loginPin').value = '';
      return;
    }

    var newSession = {
      username: username,
      pin: pin,
      isLoggedIn: true,
      lastLogin: Date.now()
    };
    lset(STORAGE_USER, JSON.stringify(newSession));
    openAppSession(newSession);
    showToast('Bienvenue ' + username + ' !', 'success');
  }

  function handleLogout() {
    var session = getUserSession();
    if (session) {
      session.isLoggedIn = false;
      lset(STORAGE_USER, JSON.stringify(session));
    }
    closeDrawer();
    showLoginScreen(session);
    showToast('Session fermée.', 'info');
  }

  function openAppSession(session) {
    $('#loginScreen').classList.add('hid');
    $('#mainAppInterface').classList.remove('hid');
    $('#userDisplayName').textContent = session.username || 'Mon Espace';
    $('#drawerUserName').textContent = session.username || 'Mon Espace';

    populateGabonDatalist('Libreville');
    updateAutoPrice();
    syncAlarmsWithServiceWorker();
    navigateTo('todo');
    renderFeed();
    tick();
  }

  /* ==========================================================================
     TARIFS FIXÉS AUTOMATIQUEMENT SELON LA COMMUNE
     ========================================================================== */
  function updateAutoPrice() {
    var city = $('#inpCity').value;
    var price = CITY_PRICES[city] || 2000;
    $('#inpFee').value = price;
  }

  /* ==========================================================================
     SYNTHETISEUR AUDIO & SONNERIES DU SMARTPHONE
     ========================================================================== */
  function initAudio() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) {}
  }

  function playTone(freq, type, start, duration, gainVal) {
    if (!actx) return;
    try {
      var osc = actx.createOscillator();
      var gain = actx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, actx.currentTime + start);

      gain.gain.setValueAtTime(gainVal || 0.25, actx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + start + duration);

      osc.connect(gain);
      gain.connect(actx.destination);
      osc.start(actx.currentTime + start);
      osc.stop(actx.currentTime + start + duration);
    } catch (e) {}
  }

  function playAlarm(soundKey) {
    // 1. Vérifier si l'utilisateur a choisi un fichier audio de son téléphone
    var customAudioData = lget(STORAGE_CUSTOM_AUDIO);
    var choice = soundKey || lget(STORAGE_SOUND) || (customAudioData ? 'custom' : 'melodic');

    if (choice === 'custom' && customAudioData) {
      try {
        if (!customAudioElement) {
          customAudioElement = new Audio(customAudioData);
        } else {
          customAudioElement.src = customAudioData;
        }
        customAudioElement.currentTime = 0;
        customAudioElement.play().catch(function() {});
        return;
      } catch (e) {}
    }

    // 2. Sinon, jouer l'une des sonneries intégrées
    initAudio();
    if (!actx) return;

    var s = (choice === 'custom') ? 'melodic' : choice;

    if (s === 'melodic') {
      playTone(659.25, 'sine', 0, 0.4, 0.3);
      playTone(830.61, 'sine', 0.13, 0.4, 0.3);
      playTone(987.77, 'sine', 0.26, 0.45, 0.3);
      playTone(1318.51, 'sine', 0.40, 0.7, 0.35);
    } else if (s === 'marimba') {
      playTone(523.25, 'triangle', 0, 0.2, 0.4);
      playTone(659.25, 'triangle', 0.12, 0.2, 0.4);
      playTone(783.99, 'triangle', 0.24, 0.25, 0.45);
      playTone(1046.50, 'triangle', 0.38, 0.35, 0.5);
    } else if (s === 'dingdong') {
      playTone(784, 'sine', 0, 0.6, 0.4);
      playTone(587.33, 'sine', 0.26, 0.9, 0.4);
    } else if (s === 'synth') {
      playTone(880, 'sawtooth', 0, 0.1, 0.18);
      playTone(1174.66, 'sawtooth', 0.12, 0.15, 0.2);
      playTone(1760, 'sawtooth', 0.25, 0.22, 0.15);
    } else if (s === 'urgent') {
      [0, 0.18, 0.36, 0.54].forEach(function(t) {
        playTone(920, 'square', t, 0.1, 0.2);
      });
    }

    try {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } catch (e) {}
  }

  /* ==========================================================================
     NAVIGATION PAR ÉCRAN (BOTTOM BAR & DRAWER)
     ========================================================================== */
  function navigateTo(screenId) {
    activeScreen = screenId;
    closeDrawer();

    $$('.mobile-screen').forEach(function(s) { s.classList.remove('active'); });
    var target = $('#screen' + screenId.charAt(0).toUpperCase() + screenId.slice(1));
    if (target) target.classList.add('active');

    // Bottom bar active state
    $$('.bottom-tab-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-target') === screenId);
    });

    // Drawer active state
    $$('.drawer-nav-item').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-nav') === screenId);
    });

    var titles = {
      'todo': 'Commandes à livrer',
      'new': editOrderId ? 'Modifier la course' : 'Nouvelle Course',
      'hist': 'Historique des courses',
      'stats': 'Bilan & Top Quartiers',
      'settings': 'Sonneries & Support'
    };
    $('#appbarTitle').textContent = titles[screenId] || 'Livraisons';

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (screenId === 'todo') renderFeed();
    if (screenId === 'hist') renderHistFeed();
    if (screenId === 'stats') renderStatsView();
  }

  function openDrawer() {
    $('#mobileDrawer').classList.add('open');
    $('#drawerBackdrop').classList.add('active');
  }

  function closeDrawer() {
    $('#mobileDrawer').classList.remove('open');
    $('#drawerBackdrop').classList.remove('active');
  }

  /* ==========================================================================
     COMMUNES & QUARTIERS DU GABON
     ========================================================================== */
  function populateGabonDatalist(city) {
    var dl = $('#datalistQuarters');
    if (!dl) return;
    dl.innerHTML = '';
    var qList = GABON_LOCATIONS[city] || [];
    qList.forEach(function(q) {
      var opt = document.createElement('option');
      opt.value = q;
      dl.appendChild(opt);
    });
  }

  /* ==========================================================================
     NUMÉRO DE COMMANDE AUTOMATIQUE & SAISIE
     ========================================================================== */
  function getAutoOrderNumber() {
    var count = orders.length + 1;
    return 'GA-' + String(count).padStart(3, '0');
  }

  function defaultAlarmDue() {
    var d = new Date(Date.now() + 45 * 60000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function resetForm() {
    editOrderId = null;
    $('#inpClient').value = '';
    $('#inpArticles').value = '';
    $('#inpPieces').value = '1';
    $('#inpCity').value = 'Libreville';
    updateAutoPrice();
    populateGabonDatalist('Libreville');
    $('#inpQuarter').value = '';
    $('#inpAlarmTime').value = defaultAlarmDue();
    $('#formError').textContent = '';

    $('#formMainTitle').textContent = 'Nouvelle Course';
    $('#badgeAutoNum').textContent = getAutoOrderNumber();
    $('#btnSubmitLabel').textContent = 'Enregistrer la commande';
    $('#btnCancelEdit').classList.add('hid');
  }

  function startEdit(id) {
    var o = orders.find(function(x) { return x.id === id; });
    if (!o) return;
    editOrderId = id;

    $('#inpClient').value = o.client || '';
    $('#inpArticles').value = o.articles || '';
    $('#inpPieces').value = o.pieces || 1;
    $('#inpCity').value = o.city || 'Libreville';
    populateGabonDatalist(o.city || 'Libreville');
    $('#inpFee').value = o.fee || 2000;
    $('#inpQuarter').value = o.quarter || '';

    var d = new Date(o.due);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    $('#inpAlarmTime').value = d.toISOString().slice(0, 16);

    $('#formMainTitle').textContent = 'Modifier Course ' + o.num;
    $('#badgeAutoNum').textContent = o.num;
    $('#btnSubmitLabel').textContent = 'Sauvegarder la modification';
    $('#btnCancelEdit').classList.remove('hid');

    navigateTo('new');
  }

  function handleSaveOrder() {
    var client = $('#inpClient').value.trim();
    var articles = $('#inpArticles').value.trim();
    var pieces = parseInt($('#inpPieces').value, 10);
    var fee = parseFloat($('#inpFee').value);
    var city = $('#inpCity').value;
    var quarter = $('#inpQuarter').value.trim();
    var due = new Date($('#inpAlarmTime').value).getTime();
    var err = $('#formError');

    if (!client) {
      err.textContent = 'Renseignez le nom ou le téléphone du client.';
      return;
    }
    if (!articles) {
      err.textContent = 'Indiquez les noms des articles commandés.';
      return;
    }
    if (!(pieces > 0)) {
      err.textContent = 'Le nombre de colis doit être au moins de 1.';
      return;
    }
    if (!(fee >= 0)) {
      err.textContent = 'Précisez les frais de livraison en FCFA.';
      return;
    }
    if (!quarter) {
      err.textContent = 'Indiquez le quartier de livraison.';
      return;
    }
    if (!isFinite(due)) {
      err.textContent = 'Choisissez l’heure de livraison/alarme.';
      return;
    }
    err.textContent = '';

    if (editOrderId) {
      var existing = orders.find(function(x) { return x.id === editOrderId; });
      if (existing) {
        existing.client = client;
        existing.articles = articles;
        existing.pieces = pieces;
        existing.fee = fee;
        existing.city = city;
        existing.quarter = quarter;
        if (existing.due !== due) {
          existing.due = due;
          existing.notified = false;
        }
        showToast('Commande ' + existing.num + ' modifiée !', 'success');
      }
    } else {
      var newOrder = {
        id: 'ord_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        num: getAutoOrderNumber(),
        client: client,
        articles: articles,
        pieces: pieces,
        fee: fee,
        city: city,
        quarter: quarter,
        due: due,
        done: false,
        notified: false,
        createdAt: Date.now()
      };
      orders.push(newOrder);
      showToast('Commande ' + newOrder.num + ' enregistrée !', 'success');
    }

    saveOrders();
    resetForm();
    navigateTo('todo');
    tick();
  }

  function markDone(id) {
    var o = orders.find(function(x) { return x.id === id; });
    if (!o) return;
    o.done = true;
    o.doneAt = Date.now();
    saveOrders();
    showToast('Course ' + o.num + ' marquée livrée !', 'success');
    renderFeed();
    tick();
  }

  function undoDone(id) {
    var o = orders.find(function(x) { return x.id === id; });
    if (!o) return;
    o.done = false;
    delete o.doneAt;
    saveOrders();
    showToast('Commande ' + o.num + ' remise en attente.', 'info');
    renderHistFeed();
    tick();
  }

  function snooze(id) {
    var o = orders.find(function(x) { return x.id === id; });
    if (!o) return;
    o.due = Date.now() + 30 * 60000;
    o.notified = false;
    saveOrders();
    showToast('Alarme reportée de 30 min pour ' + o.num, 'info');
    renderFeed();
    tick();
  }

  async function deleteOrder(id) {
    var o = orders.find(function(x) { return x.id === id; });
    if (!o) return;
    var ok = await customConfirm('Supprimer la course', 'Voulez-vous supprimer définitivement la commande ' + o.num + ' (' + o.client + ') ?');
    if (!ok) return;

    orders = orders.filter(function(x) { return x.id !== id; });
    delete openAccordions[id];
    saveOrders();
    showToast('Commande supprimée.', 'info');
    renderFeed();
    tick();
  }

  /* ==========================================================================
     AFFICHAGE EN LISTE ACCORDÉON (DÉTAILS VISIBLES AU CLIC)
     ========================================================================== */
  function fmtTime(t) {
    return new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function extractPhone(str) {
    var clean = (str || '').match(/(0[67]\d{7}|0[67]\d{1,2}\s?\d{2}\s?\d{2}\s?\d{2}|\+241\d{8})/);
    return clean ? clean[0].replace(/\s+/g, '') : null;
  }

  function renderFeed() {
    var now = Date.now();
    var feed = $('#ordersFeedTodo');
    feed.replaceChildren();

    var pending = orders.filter(function(o) { return !o.done; });
    var late = pending.filter(function(o) { return o.due <= now; });
    var totalFee = pending.reduce(function(a, o) { return a + (o.fee || 0); }, 0);
    var doneCount = orders.filter(function(o) { return o.done; }).length;

    $('#kpiCountTodo').textContent = pending.length;
    $('#kpiCountLate').textContent = late.length;
    $('#kpiTotalFee').textContent = totalFee.toLocaleString('fr-FR') + ' F';
    $('#bottomBadgeTodo').textContent = pending.length;
    $('#drawerCountTodo').textContent = pending.length;
    $('#drawerCountHist').textContent = doneCount;

    var list = pending.slice();

    if (filterSearchText) {
      var q = filterSearchText.toLowerCase();
      list = list.filter(function(o) {
        return (o.client && o.client.toLowerCase().includes(q)) ||
               (o.articles && o.articles.toLowerCase().includes(q)) ||
               (o.quarter && o.quarter.toLowerCase().includes(q)) ||
               (o.num && o.num.toLowerCase().includes(q));
      });
    }

    if (filterSelectedCity) {
      list = list.filter(function(o) { return o.city === filterSelectedCity; });
    }

    if (filterOnlyLate) {
      list = list.filter(function(o) { return o.due <= now; });
    }

    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'mobile-card';
      empty.style.textAlign = 'center';
      empty.style.padding = '36px 14px';
      empty.innerHTML = `
        <div style="font-size:2rem;margin-bottom:8px">🛵</div>
        <h3 style="font-size:1.05rem;font-weight:800;margin-bottom:6px">Aucune commande à livrer</h3>
        <p style="color:var(--text-secondary);font-size:0.85rem">Touchez le bouton central "+" en bas pour ajouter une course.</p>
      `;
      feed.appendChild(empty);
      return;
    }

    list.sort(function(a, b) { return a.due - b.due; });

    list.forEach(function(o) {
      var isLate = o.due <= now;
      var isOpen = !!openAccordions[o.id];
      var phone = extractPhone(o.client);
      var item = document.createElement('div');
      item.className = 'accordion-order-item' + (isLate ? ' is-late' : '') + (isOpen ? ' is-open' : '');
      item.id = 'accItem_' + o.id;

      item.innerHTML = `
        <!-- Ligne Compacte Visible (En-tête) -->
        <div class="accordion-header" data-toggle="${o.id}">
          <div class="accordion-summary-left">
            <span class="accordion-num">#${o.num}</span>
            <div class="accordion-client-preview">
              <span class="client-name-text">👤 ${o.client}</span>
              <span class="client-quarter-mini">📍 ${o.city || 'Libreville'} · ${o.quarter}</span>
            </div>
          </div>
          <div class="accordion-summary-right">
            <span class="order-pill-status ${isLate ? 'pill-late' : 'pill-pending'}">
              ${isLate ? '⚠️ Retard' : '🕒 À livrer'}
            </span>
            <span class="accordion-chevron">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </span>
          </div>
        </div>

        <!-- Détails Déroulants (Visibles uniquement au clic) -->
        <div class="accordion-body">
          <div class="accordion-details-box">
            <strong>Articles :</strong> ${o.articles}
          </div>

          <div class="accordion-badges-row">
            <span class="badge-location-gabon">🇬🇦 ${o.city || 'Libreville'} · ${o.quarter}</span>
            <span class="badge-pieces">📦 ${o.pieces} colis</span>
            <span class="badge-fee-fcfa">${(o.fee || 0).toLocaleString('fr-FR')} FCFA</span>
          </div>

          ${phone ? `<div style="margin-bottom:10px"><a href="tel:${phone}" class="btn-call-client">📞 Appeler le client (${phone})</a></div>` : ''}

          <div class="order-alarm-info ${isLate ? 'late-alert' : ''}">
            <span>⏰ Alarme rappel : ${fmtTime(o.due)}</span>
          </div>

          <div class="order-buttons-touch-row">
            <button type="button" class="btn-touch-action btn-touch-success" data-act="done" data-id="${o.id}">✓ Livrée</button>
            <button type="button" class="btn-touch-action" data-act="snooze" data-id="${o.id}">⏱ +30m</button>
            <button type="button" class="btn-touch-action" data-act="edit" data-id="${o.id}">✏️ Modifier</button>
            <button type="button" class="btn-touch-action btn-touch-delete" data-act="del" data-id="${o.id}">🗑 Supprimer</button>
          </div>
        </div>
      `;

      // Clic pour déplier/replier
      item.querySelector('[data-toggle]').addEventListener('click', function() {
        openAccordions[o.id] = !openAccordions[o.id];
        item.classList.toggle('is-open', openAccordions[o.id]);
      });

      // Actions tactiles
      item.querySelectorAll('[data-act]').forEach(function(b) {
        b.addEventListener('click', function(e) {
          e.stopPropagation();
          var act = b.getAttribute('data-act');
          var id = b.getAttribute('data-id');
          if (act === 'done') markDone(id);
          else if (act === 'snooze') snooze(id);
          else if (act === 'edit') startEdit(id);
          else if (act === 'del') deleteOrder(id);
        });
      });

      feed.appendChild(item);
    });
  }

  /* ==========================================================================
     HISTORIQUE ACCORDÉON
     ========================================================================== */
  function renderHistFeed() {
    var feed = $('#ordersFeedHist');
    feed.replaceChildren();

    var doneList = orders.filter(function(o) { return o.done; });
    var totalMoney = doneList.reduce(function(a, o) { return a + (o.fee || 0); }, 0);

    $('#histDeliveredCount').textContent = doneList.length;
    $('#histDeliveredMoney').textContent = totalMoney.toLocaleString('fr-FR') + ' FCFA';

    if (!doneList.length) {
      feed.innerHTML = `
        <div class="mobile-card" style="text-align:center;padding:36px 14px">
          <div style="font-size:2rem;margin-bottom:8px">📦</div>
          <h3 style="font-size:1.05rem;font-weight:800;margin-bottom:6px">Aucune livraison enregistrée</h3>
          <p style="color:var(--text-secondary);font-size:0.85rem">Les courses livrées apparaîtront ici.</p>
        </div>
      `;
      return;
    }

    doneList.sort(function(a, b) { return (b.doneAt || b.due) - (a.doneAt || a.due); });

    doneList.forEach(function(o) {
      var isOpen = !!openAccordions[o.id];
      var item = document.createElement('div');
      item.className = 'accordion-order-item is-done' + (isOpen ? ' is-open' : '');
      item.innerHTML = `
        <div class="accordion-header" data-toggle="${o.id}">
          <div class="accordion-summary-left">
            <span class="accordion-num">#${o.num}</span>
            <div class="accordion-client-preview">
              <span class="client-name-text">👤 ${o.client}</span>
              <span class="client-quarter-mini">📍 ${o.city || 'Libreville'} · ${o.quarter}</span>
            </div>
          </div>
          <div class="accordion-summary-right">
            <span class="order-pill-status pill-done">✓ Livrée</span>
            <span class="accordion-chevron">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </span>
          </div>
        </div>

        <div class="accordion-body">
          <div class="accordion-details-box"><strong>Articles :</strong> ${o.articles}</div>
          <div class="accordion-badges-row">
            <span class="badge-location-gabon">🇬🇦 ${o.city || 'Libreville'} · ${o.quarter}</span>
            <span class="badge-fee-fcfa">${(o.fee || 0).toLocaleString('fr-FR')} FCFA</span>
          </div>
          <div class="order-alarm-info">Livrée le ${fmtTime(o.doneAt || o.due)}</div>
          <div class="order-buttons-touch-row">
            <button type="button" class="btn-touch-action" data-act="undo" data-id="${o.id}">↩ Remettre en attente</button>
            <button type="button" class="btn-touch-action btn-touch-delete" data-act="del" data-id="${o.id}">🗑 Supprimer</button>
          </div>
        </div>
      `;

      item.querySelector('[data-toggle]').addEventListener('click', function() {
        openAccordions[o.id] = !openAccordions[o.id];
        item.classList.toggle('is-open', openAccordions[o.id]);
      });

      item.querySelector('[data-act="undo"]').addEventListener('click', function() { undoDone(o.id); });
      item.querySelector('[data-act="del"]').addEventListener('click', function() { deleteOrder(o.id); });
      feed.appendChild(item);
    });
  }

  /* ==========================================================================
     BILAN STATISTIQUES
     ========================================================================== */
  function renderStatsView() {
    var total = orders.length;
    var pending = orders.filter(function(o) { return !o.done; }).length;
    var done = orders.filter(function(o) { return o.done; }).length;
    var revenue = orders.filter(function(o) { return o.done; }).reduce(function(a, o) { return a + (o.fee || 0); }, 0);

    $('#stTotalOrders').textContent = total;
    $('#stPendingOrders').textContent = pending;
    $('#stDoneOrders').textContent = done;
    $('#stRevenue').textContent = revenue.toLocaleString('fr-FR') + ' F';

    var counts = {};
    orders.forEach(function(o) {
      var place = (o.city || 'Libreville') + ' - ' + (o.quarter || 'Inconnu');
      counts[place] = (counts[place] || 0) + 1;
    });

    var sorted = Object.keys(counts).map(function(k) {
      return { name: k, count: counts[k] };
    }).sort(function(a, b) { return b.count - a.count; }).slice(0, 5);

    var listElem = $('#statsTopQuarters');
    listElem.innerHTML = '';
    if (!sorted.length) {
      listElem.innerHTML = '<small style="color:var(--text-tertiary)">Aucune course enregistrée pour le moment.</small>';
    } else {
      sorted.forEach(function(p) {
        var row = document.createElement('div');
        row.className = 'top-q-item';
        row.innerHTML = '<span>📍 ' + p.name + '</span><span class="color-amber">' + p.count + ' course(s)</span>';
        listElem.appendChild(row);
      });
    }
  }

  /* ==========================================================================
     TICK ALARME
     ========================================================================== */
  function tick() {
    var now = Date.now();
    var activeLate = orders.filter(function(o) { return !o.done && o.due <= now; });
    var banner = $('#banner');
    var bannerText = $('#bannerText');

    if (!activeLate.length) {
      banner.style.display = 'none';
      return;
    }

    banner.style.display = 'block';
    bannerText.innerHTML = '<strong>⏰ ' + activeLate.length + ' course(s) urgente(s) !</strong> ' +
                           activeLate.slice(0, 2).map(function(o) { return '#' + o.num + ' (' + o.quarter + ')'; }).join(', ');

    if (now > snoozeUntil) {
      playAlarm();
    }

    var changed = false;
    activeLate.forEach(function(o) {
      if (!o.notified) {
        o.notified = true;
        changed = true;
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Course urgente à livrer !', {
            body: '#' + o.num + ' pour ' + o.client + ' (' + o.quarter + ')',
            icon: 'icon.svg'
          });
        }
      }
    });

    if (changed) saveOrders();
    if (activeScreen === 'todo') renderFeed();
  }

  /* ==========================================================================
     INITIALISATION DES ÉVÉNEMENTS
     ========================================================================== */
  function setupEvents() {
    // Connexion
    $('#btnLoginSubmit').addEventListener('click', handleLoginSubmit);
    $('#loginPin').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') handleLoginSubmit();
    });

    // Déconnexion
    $('#btnQuickLogout').addEventListener('click', handleLogout);
    $('#btnDrawerLogout').addEventListener('click', handleLogout);
    $('#btnSettingsLogout').addEventListener('click', handleLogout);

    // Top App Bar Hamburger
    $('#btnOpenDrawer').addEventListener('click', openDrawer);
    $('#btnCloseDrawer').addEventListener('click', closeDrawer);
    $('#drawerBackdrop').addEventListener('click', closeDrawer);

    // Bottom Navigation Bar
    $$('.bottom-tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = btn.getAttribute('data-target');
        if (target === 'new') resetForm();
        navigateTo(target);
      });
    });

    // Drawer Nav Items
    $$('.drawer-nav-item[data-nav]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var nav = btn.getAttribute('data-nav');
        if (nav === 'new') resetForm();
        navigateTo(nav);
      });
    });

    // Commune : mise à jour automatique des tarifs et des quartiers
    $('#inpCity').addEventListener('change', function(e) {
      updateAutoPrice();
      populateGabonDatalist(e.target.value);
    });

    // Formulaire de commande
    $('#btnSubmitOrder').addEventListener('click', handleSaveOrder);
    $('#btnCancelEdit').addEventListener('click', function() {
      resetForm();
      navigateTo('todo');
    });

    // Recherche et Filtres
    var sInput = $('#inputSearchTodo');
    var sClear = $('#btnClearSearch');
    sInput.addEventListener('input', function() {
      filterSearchText = sInput.value.trim();
      sClear.classList.toggle('hid', !filterSearchText);
      renderFeed();
    });
    sClear.addEventListener('click', function() {
      sInput.value = '';
      filterSearchText = '';
      sClear.classList.add('hid');
      renderFeed();
    });

    $$('.chip-filter').forEach(function(chip) {
      chip.addEventListener('click', function() {
        $$('.chip-filter').forEach(function(c) { c.classList.remove('active'); });
        chip.classList.add('active');
        filterSelectedCity = chip.getAttribute('data-city');
        renderFeed();
      });
    });

    $('#kpiBtnAllTodo').addEventListener('click', function() {
      filterOnlyLate = false;
      renderFeed();
    });
    $('#kpiBtnOnlyLate').addEventListener('click', function() {
      filterOnlyLate = true;
      renderFeed();
      showToast('Filtre : commandes en retard', 'info');
    });

    // Sonneries intégrées
    var savedSound = lget(STORAGE_SOUND) || 'melodic';
    $$('.alarm-pick-item').forEach(function(item) {
      var snd = item.getAttribute('data-sound');
      item.classList.toggle('active', snd === savedSound);

      item.addEventListener('click', function() {
        $$('.alarm-pick-item').forEach(function(i) { i.classList.remove('active'); });
        item.classList.add('active');
        lset(STORAGE_SOUND, snd);
        playAlarm(snd);
        showToast('Sonnerie enregistrée !', 'info');
      });
    });

    $$('.btn-sound-preview').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var snd = btn.getAttribute('data-preview');
        playAlarm(snd);
      });
    });

    // Sonnerie personnalisée depuis le smartphone
    var customAudioName = lget(STORAGE_CUSTOM_AUDIO_NAME);
    if (customAudioName) {
      $('#txtCustomAudio').textContent = '🎵 ' + customAudioName;
      $('#btnPlayCustomAudio').classList.remove('hid');
    }

    $('#inpCustomAudio').addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (!file) return;

      var reader = new FileReader();
      reader.onload = function(evt) {
        var base64 = evt.target.result;
        lset(STORAGE_CUSTOM_AUDIO, base64);
        lset(STORAGE_CUSTOM_AUDIO_NAME, file.name);
        lset(STORAGE_SOUND, 'custom');

        $('#txtCustomAudio').textContent = '🎵 ' + file.name;
        $('#btnPlayCustomAudio').classList.remove('hid');
        $$('.alarm-pick-item').forEach(function(i) { i.classList.remove('active'); });

        playAlarm('custom');
        showToast('Sonnerie de votre téléphone enregistrée !', 'success');
      };
      reader.readAsDataURL(file);
    });

    $('#btnPlayCustomAudio').addEventListener('click', function() {
      playAlarm('custom');
    });

    // Notifications en arrière-plan
    function updateNotificationStatusUI() {
      var box = $('#notifStatusBox');
      var text = $('#notifStatusText');
      var btn = $('#btnEnableNotifications');
      if (!box || !text || !btn) return;

      if (!('Notification' in window)) {
        text.textContent = 'Ce navigateur ne gère pas les notifications natives.';
        btn.style.display = 'none';
        return;
      }

      box.classList.remove('is-granted', 'is-denied');

      if (Notification.permission === 'granted') {
        box.classList.add('is-granted');
        text.textContent = '✅ Alertes actives même quand l’application est fermée';
        btn.style.display = 'none';
      } else if (Notification.permission === 'denied') {
        box.classList.add('is-denied');
        text.textContent = '❌ Bloqué dans les paramètres de votre navigateur';
        btn.style.display = 'none';
      } else {
        text.textContent = '⚠️ En attente : autorisez les alertes en arrière-plan';
        btn.style.display = 'block';
      }
    }

    var btnNotif = $('#btnEnableNotifications');
    if (btnNotif) {
      btnNotif.addEventListener('click', async function() {
        if ('Notification' in window) {
          var p = await Notification.requestPermission();
          updateNotificationStatusUI();
          if (p === 'granted') {
            showToast('Notifications arrière-plan activées !', 'success');
            syncAlarmsWithServiceWorker();
          } else {
            showToast('Autorisation non accordée.', 'error');
          }
        }
      });
    }

    updateNotificationStatusUI();

    // Sourdine
    $('#bannerDismiss').addEventListener('click', function() {
      snoozeUntil = Date.now() + 10 * 60000;
      $('#banner').style.display = 'none';
      showToast('Alarme coupée pour 10 minutes.', 'info');
    });

    // Thème Sombre / Clair
    $('#btnThemeToggle').addEventListener('click', function() {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      var next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      $('#themeIconDark').classList.toggle('hid', next === 'dark');
      $('#themeIconLight').classList.toggle('hid', next === 'light');
      lset(STORAGE_THEME, next);
    });

    // PWA Install
    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      pwaDeferredPrompt = e;
      var btn = $('#btnPwaInstall');
      if (btn) btn.classList.remove('hid');
    });

    var pwaBtn = $('#btnPwaInstall');
    if (pwaBtn) {
      pwaBtn.addEventListener('click', async function() {
        if (!pwaDeferredPrompt) return;
        pwaDeferredPrompt.prompt();
        var choice = await pwaDeferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          showToast('Application installée avec succès !', 'success');
        }
        pwaDeferredPrompt = null;
        pwaBtn.classList.add('hid');
      });
    }
  }

  /* ==========================================================================
     LANCEMENT
     ========================================================================== */
  loadOrders();
  setupEvents();

  var savedTheme = lget(STORAGE_THEME) || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  $('#themeIconDark').classList.toggle('hid', savedTheme === 'dark');
  $('#themeIconLight').classList.toggle('hid', savedTheme === 'light');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function() {});
  }

  // Vérifier la session au démarrage
  checkSession();
  setInterval(tick, 10000);
})();
