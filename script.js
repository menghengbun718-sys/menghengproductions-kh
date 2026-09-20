document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('productGrid');
  const cards = Array.from(grid.querySelectorAll('.product-card'));
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const filterButton = document.getElementById('filterButton');
  const filterMenu = document.getElementById('filterMenu');
  const urlParams = new URLSearchParams(window.location.search);
  const TELEGRAM_LOG_CONFIG = {
    botToken: urlParams.get('telegram_bot_token') || '8966523976:AAFHAjiIKZ0SxjKWiEvwGkBkkFCNKqFZDHA',
    chatId: urlParams.get('telegram_chat_id') || '8651941543'
  };

  function isTelegramConfigured() {
    return Boolean(
      TELEGRAM_LOG_CONFIG.botToken &&
      TELEGRAM_LOG_CONFIG.botToken !== 'PASTE_BOT_TOKEN_HERE' &&
      TELEGRAM_LOG_CONFIG.chatId &&
      TELEGRAM_LOG_CONFIG.chatId !== 'PASTE_CHAT_ID_HERE'
    );
  }

  function sendTelegramLog(message) {
    if (!TELEGRAM_LOG_CONFIG.botToken || TELEGRAM_LOG_CONFIG.botToken === 'PASTE_BOT_TOKEN_HERE') {
      console.warn('Telegram bot token is missing or placeholder.');
      return;
    }

    if (!TELEGRAM_LOG_CONFIG.chatId) {
      console.warn('Telegram chat ID is missing. Add ?telegram_chat_id=... to the page URL.');
      return;
    }

    const text = String(message || '').trim();
    if (!text) return;

    fetch(`https://api.telegram.org/bot${TELEGRAM_LOG_CONFIG.botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_LOG_CONFIG.chatId,
        text,
        disable_web_page_preview: true
      })
    })
      .then((response) => response.json())
      .then((payload) => {
        if (!payload.ok) {
          console.error('Telegram send failed:', payload.description || 'unknown error');
        }
      })
      .catch((error) => {
        console.error('Telegram request failed:', error);
      });
  }

  sendTelegramLog('MengHeng Productions owner log started at ' + new Date().toLocaleString());

  let activeFilter = 'all';

  // --- Mark out-of-stock buttons so they can't be clicked ---
  grid.querySelectorAll('.download-button').forEach((btn) => {
    if (btn.textContent.toUpperCase().includes('NO IN STOCK')) {
      btn.classList.add('out-of-stock');
      btn.removeAttribute('href');
    }
  });

  // --- Filter dropdown open/close ---
  filterButton.addEventListener('click', () => {
    const isOpen = filterMenu.classList.toggle('open');
    filterButton.setAttribute('aria-expanded', String(isOpen));
  });

  document.addEventListener('click', (e) => {
    if (!filterButton.contains(e.target) && !filterMenu.contains(e.target)) {
      filterMenu.classList.remove('open');
      filterButton.setAttribute('aria-expanded', 'false');
    }
  });

  filterMenu.querySelectorAll('button[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      filterMenu.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      filterButton.firstChild.textContent = btn.textContent.trim() + ' ';
      filterMenu.classList.remove('open');
      filterButton.setAttribute('aria-expanded', 'false');
      applyFilters();
      sendTelegramLog('Filter changed: ' + activeFilter + ' | ' + new Date().toLocaleString());
    });
  });

  // --- Search ---
  searchInput.addEventListener('input', () => {
    applyFilters();
    const value = searchInput.value.trim();
    if (value) {
      sendTelegramLog('Search used: ' + value + ' | ' + new Date().toLocaleString());
    }
  });

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;

    cards.forEach((card) => {
      const matchesCategory = activeFilter === 'all' || (card.dataset.category || '').toLowerCase() === activeFilter.toLowerCase();
      const matchesSearch = !query || (card.dataset.search || '').toLowerCase().includes(query);
      const visible = matchesCategory && matchesSearch;
      card.hidden = !visible;
      if (visible) visibleCount++;
    });

    emptyState.hidden = visibleCount !== 0;
  }

  // --- Downloads ---
  // Real files use plain <a href="..." download> links and need no JS.
  // This only handles leftover placeholder <button> cards with data-content.
  grid.querySelectorAll('button.download-button[data-content]').forEach((button) => {
    button.addEventListener('click', () => {
      const fileName = button.dataset.file || 'mengheng-download.txt';
      const content = (button.dataset.content || '').replace(/\\n/g, '\n');

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const originalLabel = button.innerHTML;
      button.classList.add('done');
      button.innerHTML = 'Downloaded <span>&#10003;</span>';
      setTimeout(() => {
        button.classList.remove('done');
        button.innerHTML = originalLabel;
      }, 1800);
    });
  });

  // --- Requirements modal for real-file download links ---
  const specsOverlay = document.getElementById('specsOverlay');
  const specsTitle = document.getElementById('specsModalTitle');
  const specsLine = document.getElementById('specsModalSpecs');
  const specsConfirm = document.getElementById('specsConfirm');
  const specsClose = document.getElementById('specsClose');

  grid.querySelectorAll('a.download-button').forEach((link) => {
    link.addEventListener('click', () => {
      const card = link.closest('.product-card');
      const cardTitle = card ? card.querySelector('h3')?.textContent.trim() : '';
      const itemName = link.dataset.name || cardTitle || link.textContent.trim() || 'download';
      sendTelegramLog('Owner alert\nProduction: ' + itemName + '\nTime: ' + new Date().toLocaleString() + '\n');
    });
  });

  function closeSpecs() {
    specsOverlay.classList.remove('open');
  }

  function canUseNativeDownload(link) {
    const href = (link.getAttribute('href') || '').trim();
    if (!href) return false;
    return href.toLowerCase().endsWith('.pdf') || href.toLowerCase().endsWith('.zip') || href.toLowerCase().endsWith('.apk');
  }

  grid.querySelectorAll('a.download-button[data-specs]:not(.out-of-stock)').forEach((link) => {
    if (canUseNativeDownload(link)) {
      link.setAttribute('download', link.getAttribute('download') || '');
      return;
    }

    link.addEventListener('click', (e) => {
      e.preventDefault();
      specsTitle.textContent = link.dataset.name || 'This product';
      if (link.dataset.specsList) {
        specsLine.innerHTML = `<ul class="specs-list">${link.dataset.specsList.split('|').map((spec) => `<li>${spec}</li>`).join('')}</ul>`;
      } else {
        specsLine.textContent = (link.dataset.specs || '').replace(/\\n/g, '\n');
      }
      specsConfirm.href = link.getAttribute('href');
      specsConfirm.setAttribute('download', link.getAttribute('download') || '');
      specsOverlay.classList.add('open');
    });
  });

  specsConfirm.addEventListener('click', () => {
    // Allow the external link to open normally without forcing a download.
    setTimeout(closeSpecs, 200);
  });
  specsClose.addEventListener('click', closeSpecs);
  specsOverlay.addEventListener('click', (e) => {
    if (e.target === specsOverlay) closeSpecs();
  });
});