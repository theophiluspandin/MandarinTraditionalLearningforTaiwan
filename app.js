(() => {
  const LESSONS = window.LESSONS || [];
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const subs = o => (o.id ? `<div class="tr tid"><span class="lang">ID</span>${esc(o.id)}</div>` : '') + (o.ja ? `<div class="tr tja"><span class="lang">JA</span>${esc(o.ja)}</div>` : '');
  const COLORS = ['#b3402a', '#2f6f8f', '#7a5aa6', '#3d8a5b', '#c07a1a'];

  const store = {
    get(k, d) { try { const v = localStorage.getItem('ml_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ml_' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  const prefs = Object.assign({ theme: null, py: true, en: true, zh: true, ans: false, id: false, ja: false, mlang: 'en', speed: 1, shadow: false, model: true, wait: 0 }, store.get('prefs', {}));
  const done = new Set(store.get('done', []));
  const save = () => store.set('prefs', prefs);
  let role = '';

  /* ---------- theme + hints ---------- */
  function isDark() { return prefs.theme ? prefs.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; }
  function applyChrome() {
    document.documentElement.dataset.theme = isDark() ? 'dark' : 'light';
    $('#t-theme').textContent = isDark() ? '☀ Light mode' : '☾ Dark mode';
    $('#t-theme').setAttribute('aria-pressed', isDark());
    const hidden = !prefs.py && !prefs.en;
    $('#t-hints').textContent = hidden ? 'Show all hints' : 'Hide all hints';
    $('#t-hints').setAttribute('aria-pressed', hidden);
    const app = $('#app');
    app.classList.toggle('hide-py', !prefs.py);
    app.classList.toggle('hide-en', !prefs.en);
    app.classList.toggle('hide-zh', !prefs.zh);
    app.classList.toggle('hide-ans', !prefs.ans);
    app.classList.toggle('show-id', prefs.id);
    app.classList.toggle('show-ja', prefs.ja);
    $$('[data-vis]').forEach(b => b.setAttribute('aria-pressed', prefs[b.dataset.vis]));
  }
  $('#t-theme').onclick = () => { prefs.theme = isDark() ? 'light' : 'dark'; save(); applyChrome(); };
  $('#t-hints').onclick = () => { const hide = prefs.py || prefs.en; prefs.py = prefs.en = !hide; save(); applyChrome(); };
  document.addEventListener('click', e => {
    const hint = e.target.closest('.py, .en, .zh');
    if (hint && $('#app').contains(hint)) hint.classList.add('reveal');
    const ans = e.target.closest('.ans');
    if (ans && !e.target.closest('.play')) ans.classList.add('reveal');
    const vis = e.target.closest('[data-vis]');
    if (vis) { prefs[vis.dataset.vis] = !prefs[vis.dataset.vis]; save(); $$('.reveal').forEach(x => x.classList.remove('reveal')); applyChrome(); }
  });

  /* ---------- audio ---------- */
  const audio = new Audio();
  let token = 0, pending = null, uiBusy = null;
  function playClip(id, muted) {
    return new Promise(res => {
      pending = res;
      audio.muted = !!muted;
      audio.src = 'audio/' + id + '.mp3';
      audio.playbackRate = prefs.speed;
      audio.onended = () => { pending = null; res(true); };
      audio.onerror = () => { pending = null; res(false); };
      audio.play().catch(() => { pending = null; res(false); });
    });
  }
  function stopAll() {
    token++;
    audio.pause();
    if (pending) { const r = pending; pending = null; r(false); }
    $$('.playing, .turn').forEach(x => x.classList.remove('playing', 'turn'));
    $$('.play.on').forEach(x => x.classList.remove('on'));
    if (uiBusy) { uiBusy(false); uiBusy = null; }
  }
  const status = msg => { const s = $('#status'); if (s) s.textContent = msg || ''; };

  async function playDialogue(L, di, start, one) {
    stopAll();
    const my = token, dlg = L.dialogues[di];
    status('');
    for (let i = start; i < dlg.lines.length; i++) {
      const ln = dlg.lines[i], el = $('.line[data-i="' + i + '"]');
      const mine = role !== '' && String(ln.s) === role;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add(mine ? 'turn' : 'playing');
      const ok = await playClip(ln.a, mine);
      el.classList.remove('turn', 'playing');
      if (my !== token) return;
      if (!ok) { status('Audio failed to load. If you opened index.html as a file, serve the folder over http (see README).'); return; }
      if (one) return;
      if (prefs.shadow && !mine) {
        el.classList.add('turn');
        await playClip(ln.a, true);
        el.classList.remove('turn');
        if (my !== token) return;
      }
      await sleep(350);
      if (my !== token) return;
    }
    const key = L.n + ':d' + di;
    done.add(key); store.set('done', Array.from(done));
    status('Finished ✓');
  }

  async function playWords(items, rowSel) {
    stopAll();
    const my = token;
    for (let i = 0; i < items.length; i++) {
      const el = $(rowSel(items[i]));
      if (!el || el.hidden) continue;
      el.classList.add('playing');
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const ok = await playClip(items[i].a);
      el.classList.remove('playing');
      if (my !== token || !ok) return;
      await sleep(500);
      if (my !== token) return;
    }
  }

  /* ---------- views ---------- */
  const app = $('#app');
  const visChips = () => `<div class="toolbar" aria-label="Display options">
    <span style="color:var(--muted);font-size:14px">Show:</span>
    <button class="chip" data-vis="zh">Chinese</button><button class="chip" data-vis="py">Pinyin</button><button class="chip" data-vis="en">English</button><button class="chip" data-vis="id">Indonesia</button><button class="chip" data-vis="ja">日本語</button>
    <span style="color:var(--muted);font-size:13px">Hidden text is blurred — click it to reveal.</span></div>`;
  const speedSel = () => `<label>Speed <select id="speed">${[0.7, 0.85, 1, 1.2].map(v => `<option value="${v}" ${v === prefs.speed ? 'selected' : ''}>${v}×</option>`).join('')}</select></label>`;
  function bindSpeed() { const s = $('#speed'); if (s) s.onchange = () => { prefs.speed = +s.value; audio.playbackRate = prefs.speed; save(); }; }

  function home() {
    document.title = 'Mandarin Study · Lessons 1–15';
    app.innerHTML = `<h1>Your lessons &amp; materials</h1>
      <p class="sub">Read the Chinese first. Reveal pinyin and English only when you need them. Every sentence and word has audio, and every dialogue can be played as a whole conversation.</p>
      <div class="grid">${LESSONS.map(L => {
        const nd = L.dialogues.length, ok = L.dialogues.filter((_, i) => done.has(L.n + ':d' + i)).length;
        const nv = L.vocab.reduce((a, g) => a + g.items.length, 0);
        return `<a class="card" href="#/lesson/${L.n}"><div class="num">Lesson ${L.n}</div><div class="t-zh">${esc(L.zh)}</div>
          <div class="t-en">${esc(L.en)}</div><div class="meta"><span>${esc(L.topic)}</span><span>${nd} dialogues</span><span>${nv} words</span>
          <span class="${ok === nd ? 'done' : ''}">${ok}/${nd} listened${ok === nd ? ' ✓' : ''}</span></div></a>`;
      }).join('')}</div>
      <h2>Practice</h2>
      <div class="grid"><a class="card" href="#/speak"><div class="t-zh" style="font-size:20px">會話練習 Conversation training</div>
      <div class="t-en">The teacher asks a question, you answer aloud, then hear a model answer — ${LESSONS.reduce((a, L) => a + (L.speak || []).reduce((b, s) => b + s.items.length, 0), 0)} questions for lessons 1–15.</div></a>
      <a class="card" href="#/practice"><div class="t-zh" style="font-size:20px">聽力練習 Listening &amp; flashcards</div>
      <div class="t-en">Hear a word or sentence and pick the meaning, or drill with flashcards — across all lessons 1–15.</div></a></div>`;
    applyChrome();
  }

  function lessonPage(n, tab, extra) {
    const L = LESSONS.find(l => l.n === n);
    if (!L) return home();
    document.title = `Lesson ${n} · ${L.en}`;
    const tabs = [].concat(L.dialogues.map((d, i) => ['d' + (i + 1), d.title]), L.vocab.map((v, i) => ['v' + (i + 1), v.title]),
      L.speak && L.speak.length ? [['speak', '會話練習 Speaking']] : [], L.chars && L.chars.length ? [['write', '寫字 Writing']] : [],
      [['practice', 'Practice']]);
    if (!tabs.some(t => t[0] === tab)) tab = 'd1';
    app.innerHTML = `<div class="crumbs"><a href="#/">← All lessons</a></div>
      <h1><span class="zh">${esc(L.zh)}</span></h1><p class="sub">Lesson ${n} · ${esc(L.en)} · ${esc(L.topic)}</p>
      <nav class="tabs">${tabs.map(t => `<a class="tab ${t[0] === tab ? 'on' : ''}" href="#/lesson/${n}/${t[0]}">${esc(t[1])}</a>`).join('')}</nav>
      <div id="body"></div>`;
    const body = $('#body');
    if (tab[0] === 'd') dialogueView(body, L, +tab.slice(1) - 1);
    else if (tab[0] === 'v') vocabView(body, L, +tab.slice(1) - 1);
    else if (tab === 'speak') speakView(body, L);
    else if (tab === 'write') writeView(body, L, extra);
    else practiceView(body, n);
    applyChrome();
  }

  function dialogueView(body, L, di) {
    const dlg = L.dialogues[di];
    const order = [];
    dlg.lines.forEach(l => { if (!order.includes(l.s)) order.push(l.s); });
    if (!order.map(String).includes(role)) role = '';
    body.innerHTML = `<div class="toolbar">
        <button class="btn" id="playAll">▶ Play whole conversation</button><button class="btn ghost" id="stop">■ Stop</button>
        ${speedSel()}
        <label>Role-play <select id="role"><option value="">Just listen</option>${order.map(s => `<option value="${s}" ${String(s) === role ? 'selected' : ''}>I am ${esc(L.speakers[s].zh)}</option>`).join('')}</select></label>
        <label><input type="checkbox" id="shadow" ${prefs.shadow ? 'checked' : ''}> Pause to repeat after each line</label>
        <span class="sp"></span><a class="chip" href="audio/${dlg.full}" download="Lesson${L.n}-${esc(dlg.title)}.mp3" style="text-decoration:none">⬇ mp3</a></div>
      ${visChips()}
      <div id="status" class="sub" role="status"></div>
      <ol class="lines">${dlg.lines.map((ln, i) => {
        const sp = L.speakers[ln.s], right = order.indexOf(ln.s) > 0;
        return `<li class="line ${right ? 'r' : ''}" data-i="${i}"><div class="avatar" style="background:${COLORS[ln.s % COLORS.length]}">${esc(sp.zh[0])}</div>
          <div class="bubble"><div class="spk">${esc(sp.zh)} · ${esc(sp.py)}</div><div class="bubble-row"><div>
          <div class="zh">${esc(ln.zh)}</div><div class="py">${esc(ln.py)}</div><div class="en">${esc(ln.en)}</div>${subs(ln)}</div>
          <div style="display:flex;flex-direction:column;gap:6px"><button class="play" data-one="${i}" title="Play this sentence" aria-label="Play sentence ${i + 1}">▶</button>
          <button class="play" data-from="${i}" title="Play from here" aria-label="Play from sentence ${i + 1}">⏭</button></div></div></div></li>`;
      }).join('')}</ol>`;
    bindSpeed();
    $('#playAll').onclick = () => playDialogue(L, di, 0, false);
    $('#stop').onclick = () => { stopAll(); status(''); };
    $('#role').onchange = e => { role = e.target.value; };
    $('#shadow').onchange = e => { prefs.shadow = e.target.checked; save(); };
    body.onclick = e => {
      const b = e.target.closest('.play'); if (!b) return;
      if (b.dataset.one != null) playDialogue(L, di, +b.dataset.one, true);
      else playDialogue(L, di, +b.dataset.from, false);
    };
  }

  function vocabView(body, L, vi) {
    const grp = L.vocab[vi];
    body.innerHTML = `<div class="toolbar"><button class="btn" id="playAll">▶ Play all words</button><button class="btn ghost" id="stop">■ Stop</button>
        ${speedSel()}<span class="sp"></span><input class="search" id="q" type="search" placeholder="Filter (Chinese, pinyin, English)"></div>
      ${visChips()}
      <div class="vlist">${grp.items.map((it, i) => `<div class="v" data-i="${i}" data-s="${esc([it.zh, it.py, it.en, it.id, it.ja].join(' ').toLowerCase())}">
        <button class="play" data-one="${i}" title="Play" aria-label="Play ${esc(it.zh)}">▶</button><div class="zh">${esc(it.zh)}</div>
        <div class="mid"><div class="py">${esc(it.py)}<span class="pos">${esc(it.pos)}</span></div><div class="en">${esc(it.en)}</div>${subs(it)}
        <div class="wlinks">${Array.from(it.zh).filter(c => CHAR_HOME[c]).map(c => `<a href="#/lesson/${CHAR_HOME[c]}/write/${encodeURIComponent(c)}" title="Stroke order and handwriting for ${esc(c)}">✍ ${esc(c)}</a>`).join('')}</div></div></div>`).join('')}</div>`;
    bindSpeed();
    const rowSel = it => '.v[data-i="' + grp.items.indexOf(it) + '"]';
    $('#playAll').onclick = () => playWords(grp.items, rowSel);
    $('#stop').onclick = stopAll;
    $('#q').oninput = e => { const q = e.target.value.trim().toLowerCase(); $$('.v').forEach(r => { r.hidden = q && !r.dataset.s.includes(q); }); };
    body.onclick = async e => {
      const b = e.target.closest('.play'); if (!b) return;
      stopAll();
      const my = token, row = b.closest('.v');
      row.classList.add('playing');
      await playClip(grp.items[+b.dataset.one].a);
      if (my === token) row.classList.remove('playing');
    };
  }

  /* ---------- conversation training ---------- */
  let skipWait = null;
  function waitTurn(ms, label) {
    const my = token, end = Date.now() + ms;
    return new Promise(res => {
      skipWait = () => { clearInterval(t); skipWait = null; res(); };
      const tick = () => {
        const left = Math.ceil((end - Date.now()) / 1000);
        if (my !== token) { clearInterval(t); skipWait = null; return res(); }
        if (left <= 0) return skipWait();
        status(`${label} (${left}s) — press “Next ›” when you're done.`);
      };
      const t = setInterval(tick, 250); tick();
    });
  }
  const answerTime = p => prefs.wait ? prefs.wait * 1000 : Math.max(5000, 3000 + (p ? p.zh.length : 6) * 450);

  async function runTraining(sets, si, start) {
    stopAll();
    const my = token, st = sets[si];
    $('#next').disabled = false;
    uiBusy = on => { const n = $('#next'); if (n) n.disabled = !on; };
    for (let i = start; i < st.items.length; i++) {
      const it = st.items[i], el = $(`.qa[data-s="${si}"][data-i="${i}"]`);
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('playing');
      status('Listen to the question…');
      const ok = await playClip(it.q.a);
      if (my !== token) return;
      if (!ok) { el.classList.remove('playing'); status('Audio failed to load. If you opened index.html as a file, serve the folder over http (see README).'); return; }
      el.classList.remove('playing'); el.classList.add('turn');
      await waitTurn(answerTime(it.ans), it.ans ? 'Your turn: answer aloud' : 'Your turn: repeat it');
      el.classList.remove('turn');
      if (my !== token) return;
      if (it.ans && prefs.model) {
        const box = $('.ans', el); box.classList.add('reveal', 'playing');
        status('Model answer:');
        await playClip(it.ans.a);
        box.classList.remove('playing');
        if (my !== token) return;
      }
      await sleep(600);
      if (my !== token) return;
    }
    done.add(sets.key + ':s' + si); store.set('done', Array.from(done));
    if (uiBusy) { uiBusy(false); uiBusy = null; }
    status('Finished ✓ Great work!');
  }

  function speakView(body, L) {
    const sets = L.speak; sets.key = L.n;
    const line = (p, cls, label) => `<div class="${cls}"><div class="bubble-row"><div style="flex:1">
      ${label ? `<div class="spk">${label}</div>` : ''}<div class="zh">${esc(p.zh)}</div><div class="py">${esc(p.py)}</div><div class="en">${esc(p.en)}</div>${subs(p)}</div>
      <button class="play" data-a="${p.a}" title="Play" aria-label="Play">▶</button></div></div>`;
    body.innerHTML = `<p class="sub">The teacher asks each question. Answer aloud in the pause, then compare with the model answer.
      The model answers are only examples — change them to describe your own life.</p>
      <div class="toolbar">${speedSel()}
        <label>Answer time <select id="wait">${[[0, 'Auto'], [5, '5 s'], [8, '8 s'], [12, '12 s'], [20, '20 s']].map(([v, t]) => `<option value="${v}" ${v === prefs.wait ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label><input type="checkbox" id="model" ${prefs.model ? 'checked' : ''}> Play model answer after my turn</label>
        <span class="sp"></span><button class="btn ghost" id="stop">■ Stop</button><button class="btn" id="next" disabled>Next ›</button></div>
      <div class="toolbar" aria-label="Display options"><span style="color:var(--muted);font-size:14px">Show:</span>
        <button class="chip" data-vis="py">Pinyin</button><button class="chip" data-vis="en">English</button><button class="chip" data-vis="id">Indonesia</button><button class="chip" data-vis="ja">日本語</button><button class="chip" data-vis="ans">Model answers</button>
        <span style="color:var(--muted);font-size:13px">Hidden text is blurred — click it to reveal.</span></div>
      <div id="status" class="sub" role="status"></div>
      ${sets.map((st, si) => `<h2>${esc(st.title)}${done.has(L.n + ':s' + si) ? ' <span class="done" style="font-size:14px">✓ done</span>' : ''}</h2>
        <div class="toolbar"><button class="btn" data-start="${si}">▶ Start training</button>
        <span class="sp"></span><a class="chip" href="audio/${st.full}" download="Lesson${L.n}-speaking-${si + 1}.mp3" style="text-decoration:none">⬇ mp3 (questions + answers)</a></div>
        <ol class="qlist">${st.items.map((it, i) => `<li class="qa" data-s="${si}" data-i="${i}">
          <div class="qn">${i + 1}</div><div class="qbody">${line(it.q, 'q', '')}${it.ans ? line(it.ans, 'ans', 'Model answer · click to reveal') : ''}
          <div class="qtools"><button class="chip" data-from="${i}" data-set="${si}">⏭ Train from here</button></div></div></li>`).join('')}</ol>`).join('')}`;
    bindSpeed();
    $('#wait').onchange = e => { prefs.wait = +e.target.value; save(); };
    $('#model').onchange = e => { prefs.model = e.target.checked; save(); };
    $('#stop').onclick = () => { stopAll(); status(''); };
    $('#next').onclick = () => {
      if (skipWait) skipWait();
      else if (pending) { audio.pause(); const r = pending; pending = null; r(true); }
    };
    body.onclick = async e => {
      const s = e.target.closest('[data-start]'); if (s) return runTraining(sets, +s.dataset.start, 0);
      const f = e.target.closest('[data-from]'); if (f) return runTraining(sets, +f.dataset.set, +f.dataset.from);
      const b = e.target.closest('.play[data-a]'); if (!b) return;
      stopAll();
      const my = token; b.classList.add('on');
      await playClip(b.dataset.a);
      if (my === token) b.classList.remove('on');
    };
  }

  /* ---------- writing (stroke order + handwriting) ---------- */
  const CHAR_HOME = {};
  LESSONS.forEach(L => (L.chars || []).forEach(ch => { CHAR_HOME[ch.c] = L.n; }));
  let writer = null;

  function makeWriter(box, c, size, stat) {
    box.innerHTML = ''; box.style.width = box.style.height = size + 'px';
    if (!window.HanziWriter) { stat('Stroke data needs an internet connection (Hanzi Writer library failed to load).'); return null; }
    const css = getComputedStyle(document.documentElement), col = v => css.getPropertyValue(v).trim();
    return HanziWriter.create(box, c, {
      width: size, height: size, padding: 12, showOutline: true, showCharacter: false,
      strokeColor: col('--ink'), outlineColor: col('--line'), drawingColor: col('--accent'), highlightColor: col('--ok'),
      radicalColor: null, strokeAnimationSpeed: 1, delayBetweenStrokes: 250, drawingWidth: 6,
      onLoadCharDataSuccess: d => stat(d.strokes.length + ' strokes'),
      onLoadCharDataError: () => stat('Could not load stroke data (needs internet).')
    });
  }

  // Handwriting test: show a word with one character blanked out, play it, and ask for that character from memory.
  function writingTest(box, chars, onBack) {
    stopAll();
    let deck = shuffle(chars), score = 0, total = 0;
    const next = () => {
      if (!deck.length) {
        box.innerHTML = `<div class="panel center"><h2 style="margin-top:0">All done 🎉</h2><p>${score} of ${total} written perfectly from memory.</p>
          <button class="btn" id="again">Test again</button>${onBack ? ' <button class="btn ghost" id="back">← Characters</button>' : ''}</div>`;
        $('#again', box).onclick = () => writingTest(box, chars, onBack);
        if (onBack) $('#back', box).onclick = onBack;
        return;
      }
      const ch = deck.shift(), w = ch.w[Math.floor(Math.random() * ch.w.length)];
      const blank = Array.from(w.zh).map(c => c === ch.c ? '<span class="blank">？</span>' : esc(c)).join('');
      let helped = false;
      box.innerHTML = `<div class="panel wtest">
        <div class="sub center" style="margin:0">Write the missing character from memory</div>
        <div class="q-prompt" style="font-family:var(--zh);margin:8px 0 2px" id="tw">${blank}</div>
        <div class="center"><span class="py" style="font-size:18px">${esc(w.py)}</span> · <span style="color:var(--muted)">${esc(w[prefs.mlang] || w.en)}</span>
          <button class="play" id="say" aria-label="Play the word" style="display:inline-grid;vertical-align:middle;margin-left:6px">▶</button></div>
        <div class="center" style="margin-top:12px"><div id="hw2" class="hw" style="margin:0 auto"></div></div>
        <div id="tstat" class="sub center" role="status" style="margin:8px 0 0">Write the first stroke…</div>
        <div class="wbtns" style="justify-content:center"><button class="btn ghost" id="hint">💡 Hint</button><button class="btn ghost" id="show">Show answer</button>
          <button class="btn" id="tnext">Skip ›</button>${onBack ? '<button class="btn ghost" id="back">← Characters</button>' : ''}</div>
        <div class="score">Score ${score} / ${total} · ${deck.length} left</div></div>`;
      const stat = m => { const s = $('#tstat', box); if (s) s.textContent = m; };
      const say = () => { stopAll(); playClip(w.a); };
      $('#say', box).onclick = say;
      say();
      const wr = makeWriter($('#hw2', box), ch.c, Math.min(280, box.clientWidth - 48), () => {});
      writer = wr;
      const finish = (msg, ok) => {
        total++; if (ok) { score++; done.add('w:' + ch.c); store.set('done', Array.from(done)); }
        $('#tw', box).innerHTML = Array.from(w.zh).map(c => c === ch.c ? `<span class="got">${esc(c)}</span>` : esc(c)).join('');
        stat(msg); say();
        $('#tnext', box).textContent = 'Next ›'; $('#hint', box).disabled = $('#show', box).disabled = true;
        $('.score', box).textContent = `Score ${score} / ${total} · ${deck.length} left`;
      };
      if (!wr) return;
      wr.hideOutline();
      wr.quiz({
        showHintAfterMisses: 3, highlightOnComplete: true,
        onCorrectStroke: d => stat(`Stroke ${d.strokeNum + 1} ✓ — ${d.strokesRemaining} to go`),
        onMistake: d => stat(`Not that stroke — try again${d.mistakesOnStroke >= 3 ? ' (follow the flashing hint)' : ''}.`),
        onComplete: d => finish(!helped && !d.totalMistakes ? 'Perfect from memory! ✓' : `Done — ${d.totalMistakes} mistake${d.totalMistakes === 1 ? '' : 's'}${helped ? ', with hints' : ''}. Keep practising this one.`, !helped && !d.totalMistakes)
      });
      $('#hint', box).onclick = () => { helped = true; wr.showOutline(); stat('Outline shown — trace the strokes in order.'); };
      $('#show', box).onclick = () => {
        helped = true; wr.cancelQuiz(); wr.showOutline(); wr.animateCharacter();
        finish('Here is the stroke order. It goes back in the deck — you will see it again.', false);
        deck.push(ch);
      };
      $('#tnext', box).onclick = next;
      if (onBack) $('#back', box).onclick = onBack;
    };
    next();
  }

  function writeView(body, L, pick) {
    const chars = L.chars;
    let idx = Math.max(0, chars.findIndex(c => c.c === pick));
    body.innerHTML = `<p class="sub">The ${chars.length} new characters in this lesson. Watch the stroke order, then write it yourself with your mouse or finger —
      a wrong stroke is not accepted, and after 3 misses the next stroke flashes as a hint.</p>
      <div class="toolbar"><button class="btn" id="testme">📝 Test me: write from memory</button>
        <span style="color:var(--muted);font-size:14px">You hear a word and see its pinyin and meaning — write the missing character.</span></div>
      <div class="chargrid">${chars.map((c, i) => `<button class="cg zh ${done.has('w:' + c.c) ? 'ok' : ''}" data-i="${i}" aria-label="${esc(c.c)} ${esc(c.py)}">${esc(c.c)}</button>`).join('')}</div>
      <div class="writepanel"><div><div id="hw" class="hw"></div>
        <div class="wbtns"><button class="btn ghost" id="prev" aria-label="Previous character">‹</button><button class="btn" id="anim">▶ Stroke order</button>
        <button class="btn" id="quiz">✍ Write it</button><button class="btn ghost" id="nextc" aria-label="Next character">›</button></div>
        <label class="wopt"><input type="checkbox" id="outline" ${prefs.outline !== false ? 'checked' : ''}> Show grey outline while writing</label></div>
        <div class="winfo" id="winfo"></div></div>`;
    const show = i => {
      idx = (i + chars.length) % chars.length;
      const ch = chars[idx];
      history.replaceState(null, '', `#/lesson/${L.n}/write/${encodeURIComponent(ch.c)}`);
      $$('.cg', body).forEach((b, k) => b.classList.toggle('on', k === idx));
      $('#winfo').innerHTML = `<div class="bigpy py">${esc(ch.py)}</div><div id="wstat" class="sub" role="status">Loading strokes…</div>
        <div class="spk" style="margin-top:10px">Words with ${esc(ch.c)}</div>
        ${ch.w.map(w => `<div class="wword"><button class="play" data-a="${w.a}" aria-label="Play ${esc(w.zh)}">▶</button><div><span class="zh">${esc(w.zh)}</span>
          <span class="py"> ${esc(w.py)}</span><div class="en">${esc(w.en)}</div>${subs(w)}</div></div>`).join('')}`;
      writer = makeWriter($('#hw'), ch.c, Math.min(300, body.clientWidth - 24), m => { const s = $('#wstat'); if (s) s.textContent = m; });
      if (writer) writer.showCharacter();
    };
    const quiz = () => {
      const ch = chars[idx], w = writer; if (!w) return;
      const stat = m => { const s = $('#wstat'); if (s) s.textContent = m; };
      w.hideCharacter();
      if ($('#outline').checked) w.showOutline(); else w.hideOutline();
      stat('Write the first stroke…');
      w.quiz({
        showHintAfterMisses: 3, highlightOnComplete: true,
        onCorrectStroke: d => stat(`Stroke ${d.strokeNum + 1} of ${d.strokeNum + 1 + d.strokesRemaining} ✓`),
        onMistake: d => stat(`Not quite — try stroke ${d.strokeNum + 1} again${d.mistakesOnStroke >= 3 ? ' (follow the hint)' : ''}.`),
        onComplete: d => {
          stat(d.totalMistakes ? `Done with ${d.totalMistakes} mistake${d.totalMistakes > 1 ? 's' : ''}. Try again or press › for the next one.` : 'Perfect! ✓ Press › for the next character.');
          done.add('w:' + ch.c); store.set('done', Array.from(done));
          const b = $(`.cg[data-i="${idx}"]`, body); if (b) b.classList.add('ok');
          if (w === writer && ch.w[0]) { stopAll(); playClip(ch.w[0].a); }
        }
      });
    };
    $('#anim').onclick = () => { if (!writer) return; writer.cancelQuiz(); writer.showOutline(); writer.hideCharacter(); writer.animateCharacter(); };
    $('#quiz').onclick = quiz;
    $('#prev').onclick = () => show(idx - 1);
    $('#nextc').onclick = () => show(idx + 1);
    $('#outline').onchange = e => { prefs.outline = e.target.checked; save(); quiz(); };
    $('#testme').onclick = () => { body.onclick = null; writingTest(body, chars, () => writeView(body, L, chars[idx].c)); };
    body.onclick = async e => {
      const g = e.target.closest('.cg'); if (g) return show(+g.dataset.i);
      const b = e.target.closest('.play[data-a]'); if (!b) return;
      stopAll(); const my = token; b.classList.add('on');
      await playClip(b.dataset.a); if (my === token) b.classList.remove('on');
    };
    show(idx);
  }

  /* ---------- practice ---------- */
  function pools(scope) {
    const ls = scope === 'all' ? LESSONS : LESSONS.filter(l => l.n === +scope);
    const seen = new Set(), words = [], sents = [];
    ls.forEach(L => {
      L.vocab.forEach(g => g.items.forEach(it => { if (!seen.has(it.zh)) { seen.add(it.zh); words.push(it); } }));
      L.dialogues.forEach(d => d.lines.forEach(l => sents.push(l)));
    });
    return { words, sents };
  }
  const MODES = {
    'listen-en': 'Hear a word → pick the meaning',
    'listen-zh': 'Hear a word → pick the characters',
    'en-zh': 'See the meaning → pick the characters',
    'sentence': 'Hear a sentence → pick the translation',
    'write': 'Hear a word → handwrite the character from memory',
    'cards': 'Flashcards (Chinese → reveal)'
  };

  function practiceView(body, n) {
    const scopeVal = n ? String(n) : 'all';
    body.innerHTML = `<div class="toolbar"><label>Mode <select id="mode">${Object.entries(MODES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label>Material <select id="scope"><option value="${n || ''}" ${n ? 'selected' : 'hidden'}>Lesson ${n}</option><option value="all" ${n ? '' : 'selected'}>All lessons 1–15</option></select></label>
        <label>Meaning in <select id="mlang">${[['en', 'English'], ['id', 'Indonesia'], ['ja', '日本語']].map(([v, t]) => `<option value="${v}" ${v === prefs.mlang ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        ${speedSel()}<button class="btn" id="go">Start</button></div><div id="quiz"></div>`;
    bindSpeed();
    $('#mlang').onchange = e => { prefs.mlang = e.target.value; save(); };
    $('#go').onclick = () => startQuiz($('#mode').value, $('#scope').value || 'all');
  }

  function startQuiz(mode, scope) {
    stopAll();
    const quiz = $('#quiz'), { words, sents } = pools(scope);
    let score = 0, total = 0, deck = shuffle(words), cur = null;
    if (mode === 'cards') return card();
    if (mode === 'write') return writingTest(quiz, [].concat(...LESSONS.filter(l => scope === 'all' || l.n === +scope).map(l => l.chars || [])));
    ask();

    function ask() {
      const pool = mode === 'sentence' ? sents : words;
      cur = pool[Math.floor(Math.random() * pool.length)];
      const field = mode === 'listen-en' || mode === 'sentence' ? prefs.mlang : 'zh';
      const others = shuffle(pool.filter(x => x[field] !== cur[field])).filter((x, i, a) => a.findIndex(y => y[field] === x[field]) === i).slice(0, 3);
      const opts = shuffle([cur].concat(others));
      const prompt = mode === 'en-zh' ? `<div class="q-prompt small">${esc(cur[prefs.mlang])}</div>` : `<div class="center"><button class="btn" id="again">🔊 Play again</button></div>`;
      quiz.innerHTML = `<div class="panel">${prompt}<div class="opts" style="margin-top:14px">${opts.map((o, i) =>
        `<button class="opt ${field === 'zh' ? 'zh' : ''}" data-i="${i}">${esc(o[field])}</button>`).join('')}</div>
        <div class="score">Score ${score} / ${total}</div><div class="center" style="margin-top:10px"><button class="btn ghost" id="next" hidden>Next →</button></div></div>`;
      if (mode !== 'en-zh') { stopAll(); playClip(cur.a); $('#again').onclick = () => { stopAll(); playClip(cur.a); }; }
      $$('.opt', quiz).forEach(b => b.onclick = () => {
        const pick = opts[+b.dataset.i], good = pick === cur || pick[field] === cur[field];
        total++; if (good) score++;
        $$('.opt', quiz).forEach((x, i) => { x.disabled = true; if (opts[i][field] === cur[field]) x.classList.add('ok'); });
        if (!good) b.classList.add('bad');
        if (mode === 'en-zh') { stopAll(); playClip(cur.a); }
        $('.score', quiz).textContent = `Score ${score} / ${total}` + (mode === 'sentence' || mode === 'listen-zh' ? ` · ${cur.zh}${cur.py ? ' (' + cur.py + ')' : ''}` : ` · ${cur.zh} ${cur.py}`);
        $('#next').hidden = false; $('#next').onclick = ask; $('#next').focus();
      });
    }

    function card() {
      if (!deck.length) { quiz.innerHTML = `<div class="panel center"><h2 style="margin-top:0">All done 🎉</h2><button class="btn" id="again2">Start over</button></div>`; $('#again2').onclick = () => startQuiz(mode, scope); return; }
      cur = deck[0];
      quiz.innerHTML = `<div class="panel"><div class="fc" id="fc"><div><div class="zh">${esc(cur.zh)}</div><div class="sub" style="margin-top:12px">Tap to reveal</div></div></div>
        <div class="score">${deck.length} cards left</div></div>`;
      $('#fc').onclick = () => {
        $('#fc').innerHTML = `<div><div class="zh">${esc(cur.zh)}</div><div class="py" style="font-size:20px">${esc(cur.py)}</div><div style="font-size:18px;margin-top:6px">${esc(cur.en)}</div><div style="margin-top:4px;color:var(--muted)">${esc([cur.id, cur.ja].filter(Boolean).join(' · '))}</div>
          <div style="margin-top:16px;display:flex;gap:10px;justify-content:center"><button class="btn ghost" id="again3">↻ Again</button><button class="btn" id="got">✓ Got it</button></div></div>`;
        stopAll(); playClip(cur.a);
        $('#again3').onclick = e => { e.stopPropagation(); deck.push(deck.shift()); card(); };
        $('#got').onclick = e => { e.stopPropagation(); deck.shift(); card(); };
        $('#fc').onclick = null;
      };
    }
  }

  /* ---------- router ---------- */
  function route() {
    stopAll();
    const p = location.hash.replace(/^#\/?/, '').split('/');
    if (p[0] === 'lesson') lessonPage(+p[1], p[2] || 'd1', p[3] && decodeURIComponent(p[3]));
    else if (p[0] === 'practice') {
      document.title = 'Practice · Mandarin Study';
      app.innerHTML = `<div class="crumbs"><a href="#/">← All lessons</a></div><h1>Practice</h1><div id="body"></div>`;
      practiceView($('#body'), 0); applyChrome();
    } else if (p[0] === 'speak') {
      document.title = 'Conversation training · Mandarin Study';
      const n = +p[1] || 1, ls = LESSONS.filter(l => l.speak && l.speak.length);
      app.innerHTML = `<div class="crumbs"><a href="#/">← All lessons</a></div><h1>會話練習 Conversation training</h1>
        <nav class="tabs">${ls.map(l => `<a class="tab ${l.n === n ? 'on' : ''}" href="#/speak/${l.n}">Lesson ${l.n}</a>`).join('')}</nav><div id="body"></div>`;
      speakView($('#body'), ls.find(l => l.n === n) || ls[0]); applyChrome();
    } else home();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  applyChrome();
  route();
})();
