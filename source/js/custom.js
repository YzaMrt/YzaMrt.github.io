(() => {
  const nav = document.getElementById('nav');
  if (nav && !document.querySelector('.wp-clock')) {
    const clock = document.createElement('div'); clock.className = 'wp-clock';
    clock.innerHTML = '<span class="wp-clock-label">北京时间</span><time aria-label="北京时间"></time>';
    nav.appendChild(clock);
    const formatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const tick = () => { const now = new Date(); clock.querySelector('time').textContent = formatter.format(now); clock.querySelector('time').dateTime = now.toISOString(); };
    tick(); setInterval(tick, 1000);
  }
  const dock = document.createElement('nav'); dock.className = 'wp-dock'; dock.setAttribute('aria-label', '快捷导航');
  const links = [['/', 'house', '首页'], ['/archives/', 'box-archive', '文章归档'], ['/tags/', 'tags', '标签'], ['/categories/', 'layer-group', '分类'], ['/about/', 'user', '关于']];
  for (const [href, icon, label] of links) { const a = document.createElement('a'); a.href = href; a.title = label; a.setAttribute('aria-label', label); if (location.pathname === href) a.setAttribute('aria-current', 'page'); a.innerHTML = `<i class="fas fa-${icon}" aria-hidden="true"></i>`; dock.appendChild(a); }
  const search = document.createElement('button'); search.type = 'button'; search.title = '搜索文章'; search.setAttribute('aria-label', '搜索文章'); search.innerHTML = '<i class="fas fa-magnifying-glass" aria-hidden="true"></i>'; search.onclick = () => document.querySelector('#search-button .search')?.click(); dock.appendChild(search);
  if (['localhost', '127.0.0.1'].includes(location.hostname)) { const a = document.createElement('a'); a.href = 'http://127.0.0.1:4001/'; a.className = 'dock-write'; a.title = '打开写作台'; a.setAttribute('aria-label', '打开写作台'); a.innerHTML = '<i class="fas fa-pen-nib" aria-hidden="true"></i>'; dock.appendChild(a); }
  document.body.appendChild(dock);
  document.querySelectorAll('#article-container img').forEach(img => img.addEventListener('click', e => {
    e.preventDefault(); const overlay = document.createElement('div'); overlay.className = 'wp-lightbox'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-label', '查看大图'); overlay.setAttribute('aria-modal', 'true');
    const large = document.createElement('img'); large.src = img.src; large.alt = img.alt; const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', '关闭大图'); overlay.append(large, close);
    const dismiss = () => { overlay.remove(); document.removeEventListener('keydown', key); document.body.style.overflow = ''; };
    const key = ev => { if (ev.key === 'Escape') dismiss(); }; overlay.onclick = dismiss; document.addEventListener('keydown', key); document.body.appendChild(overlay); document.body.style.overflow = 'hidden'; close.focus();
  }));
})();
