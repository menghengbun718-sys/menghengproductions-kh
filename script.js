document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('productGrid');
  const cards = Array.from(grid.querySelectorAll('.product-card'));
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const filterButton = document.getElementById('filterButton');
  const filterMenu = document.getElementById('filterMenu');

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
    });
  });

  // --- Search ---
  searchInput.addEventListener('input', applyFilters);

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;

    cards.forEach((card) => {
      const status = (card.dataset.status || '').toLowerCase();
      const category = (card.dataset.category || '').toLowerCase();
      const matchesStatus =
        activeFilter === 'all' ||
        (activeFilter === 'free' && status === 'free') ||
        (activeFilter === 'sell' && status === 'sell') ||
        category === activeFilter.toLowerCase();
      const matchesSearch = !query || (card.dataset.search || '').toLowerCase().includes(query);
      const visible = matchesStatus && matchesSearch;
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

  // --- Requirements / payment modal for real-file download links ---
  const specsOverlay = document.getElementById('specsOverlay');
  const specsTitle = document.getElementById('specsModalTitle');
  const specsLine = document.getElementById('specsModalSpecs');
  const specsConfirm = document.getElementById('specsConfirm');
  const specsClose = document.getElementById('specsClose');
  const specsCancel = document.getElementById('specsCancel');
  const specsQRWrap = document.getElementById('specsQRWrap');
  const specsQR = document.getElementById('specsQR');
  const specsPrice = document.getElementById('specsPrice');
  const specsStatus = document.getElementById('specsStatus');
  const PAYMENT_WAIT_MS = 20000;
  const PENDING_KEY = 'mengheng_pending_downloads';
  let activePaymentLink = null;
  let paymentTimer = null;

  function readPendingDownloads() {
    try {
      return JSON.parse(localStorage.getItem(PENDING_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function savePendingDownloads(data) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(data));
  }

  function getProductKey(link) {
    return link.dataset.name || link.getAttribute('href') || link.textContent.trim();
  }

  function sendActivityLog(event, link) {
    const localPorts = new Set(['5500', '8000']);
    const logEndpoint = localPorts.has(window.location.port)
      ? 'http://127.0.0.1:8001/api/log'
      : '/api/log';
    fetch(logEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        product: getProductKey(link),
        price: link.dataset.price || 'Not specified',
      }),
    }).catch(() => {
      // Logging is optional while the site is opened from a static file server.
    });
  }

  function isProductPending(link) {
    const data = readPendingDownloads();
    const key = getProductKey(link);
    const entry = data[key];
    if (!entry) return false;
    if (Date.now() >= Number(entry.expiresAt || 0)) {
      delete data[key];
      savePendingDownloads(data);
      return false;
    }
    return true;
  }

  function setProductWaiting(link) {
    const key = getProductKey(link);
    const data = readPendingDownloads();
    data[key] = { expiresAt: Date.now() + PAYMENT_WAIT_MS };
    savePendingDownloads(data);
    if (!link.dataset.originalLabel) {
      link.dataset.originalLabel = link.innerHTML;
    }
    link.dataset.pending = 'true';
    link.textContent = 'Waiting...';
    link.setAttribute('aria-disabled', 'true');
    link.style.pointerEvents = 'none';
    link.style.opacity = '0.75';
  }

  function closeSpecs() {
    specsOverlay.classList.remove('open');
  }

  function cancelPayment() {
    if (paymentTimer) {
      clearTimeout(paymentTimer);
      paymentTimer = null;
    }
    if (activePaymentLink) {
      const data = readPendingDownloads();
      const key = getProductKey(activePaymentLink);
      delete data[key];
      savePendingDownloads(data);
      
      // FIX: Fully reset all state so button can be clicked again
      activePaymentLink.dataset.pending = 'false';
      activePaymentLink.dataset.unlocked = 'false';
      activePaymentLink.removeAttribute('aria-disabled');
      activePaymentLink.style.pointerEvents = '';
      activePaymentLink.style.opacity = '';
      activePaymentLink.innerHTML = activePaymentLink.dataset.originalLabel || 'Buy now <span>&#8595;</span>';
      
      sendActivityLog('payment_cancelled', activePaymentLink);
      activePaymentLink = null;
    }
    closeSpecs();
  }

  // Turns the card's own button into a real, ready-to-click download link.
  function unlockProductButton(link) {
    const key = getProductKey(link);
    const data = readPendingDownloads();
    delete data[key];
    savePendingDownloads(data);
    link.dataset.pending = 'false';
    link.dataset.unlocked = 'true';
    link.removeAttribute('aria-disabled');
    link.style.pointerEvents = '';
    link.style.opacity = '';
    const downloadLink = link.dataset.downloadLink || link.getAttribute('href') || '#';
    link.setAttribute('href', downloadLink);
    if (link.dataset.downloadFile) {
      link.setAttribute('download', link.dataset.downloadFile);
    }
    link.innerHTML = 'Download now <span>&#8595;</span>';
  }

  // Shows the QR-only "waiting for payment" screen and starts the 20s timer.
  function startPaymentFlow(link) {
    activePaymentLink = link;

    specsTitle.textContent = link.dataset.name || 'This product';
    specsLine.textContent = (link.dataset.specs || '').replace(/\\n/g, '\n');

    const paymentQR = link.dataset.paymentQr;
    specsQR.src = paymentQR || '';
    specsQR.alt = `${specsTitle.textContent} payment QR code`;
    specsQRWrap.hidden = !paymentQR;

    specsPrice.textContent = link.dataset.price || 'Payment required';
    specsStatus.textContent = 'Scan the QR code to complete your payment. Your download link will appear automatically. | សូមស្កេន QR ដើម្បីទូទាត់ ប៊ូតុងទាញយកនឹងលេចឡើងដោយស្វ័យប្រវត្តិ';

    // Hide the confirm button entirely while waiting — nothing to click yet.
    specsConfirm.hidden = true;
    specsConfirm.dataset.pending = 'true';
    specsConfirm.dataset.productKey = getProductKey(link);

    setProductWaiting(link);
    sendActivityLog('payment_started', link);

    specsOverlay.classList.add('open');

    paymentTimer = setTimeout(() => {
      finishPayment(link);
    }, PAYMENT_WAIT_MS);
  }

  // Called once the 20s wait is over: unlocks the card button and,
  // if the modal for this product is still open, reveals the Download button in it.
  function finishPayment(link) {
    unlockProductButton(link);
    sendActivityLog('download_ready', link);

    const stillOpen = specsOverlay.classList.contains('open') &&
      specsConfirm.dataset.productKey === getProductKey(link);

    if (stillOpen) {
      specsStatus.textContent = 'Payment confirmed. Your download is ready.';
      specsConfirm.hidden = false;
      specsConfirm.innerHTML = 'Download now <span>&#8595;</span>';
      specsConfirm.href = link.dataset.downloadLink || link.getAttribute('href') || '#';
      specsConfirm.setAttribute('download', link.dataset.downloadFile || link.getAttribute('download') || '');
      specsConfirm.dataset.pending = 'false';
    }

    paymentTimer = null;
    if (activePaymentLink === link) activePaymentLink = null;
  }

  // Re-shows the QR/waiting screen for a product that is already pending
  // (e.g. the customer closed the modal and clicked the card again).
  function openWaitingModal(link) {
    specsTitle.textContent = link.dataset.name || 'This product';
    specsLine.textContent = (link.dataset.specs || '').replace(/\\n/g, '\n');

    const paymentQR = link.dataset.paymentQr;
    specsQR.src = paymentQR || '';
    specsQR.alt = `${specsTitle.textContent} payment QR code`;
    specsQRWrap.hidden = !paymentQR;

    specsPrice.textContent = link.dataset.price || 'Payment required';
    specsStatus.textContent = 'Scan the QR code to complete your payment. Your download link will appear automatically. | សូមស្កេន QR ដើម្បីទូទាត់ ប៊ូតុងទាញយកនឹងលេចឡើងដោយស្វ័យប្រវត្តិ';

    specsConfirm.hidden = true;
    specsConfirm.dataset.pending = 'true';
    specsConfirm.dataset.productKey = getProductKey(link);
    activePaymentLink = link;

    specsOverlay.classList.add('open');
  }

  function openFreeDownloadModal(link) {
    specsTitle.textContent = link.dataset.name || 'This product';
    if (link.dataset.specsList) {
      specsLine.innerHTML = `<ul class="specs-list">${link.dataset.specsList.split('|').map((spec) => `<li>${spec}</li>`).join('')}</ul>`;
    } else {
      specsLine.textContent = (link.dataset.specs || '').replace(/\\n/g, '\n');
    }
    specsQRWrap.hidden = true;
    specsPrice.textContent = '';
    specsStatus.textContent = 'Ready to download';
    specsConfirm.hidden = false;
    specsConfirm.innerHTML = 'Download now <span>&#8595;</span>';
    specsConfirm.href = link.getAttribute('href');
    specsConfirm.setAttribute('download', link.getAttribute('download') || '');
    specsConfirm.dataset.pending = 'false';

    specsOverlay.classList.add('open');
  }

  // Restore state after a page reload (payment pending, or already unlocked).
  function restorePendingState(link) {
    if (!link.dataset.paymentQr) return;
    const key = getProductKey(link);
    const data = readPendingDownloads();
    const entry = data[key];
    if (!entry) return;
    const msLeft = Number(entry.expiresAt || 0) - Date.now();
    if (msLeft <= 0) {
      delete data[key];
      savePendingDownloads(data);
      return;
    }
    link.dataset.pending = 'true';
    if (!link.dataset.originalLabel) {
      link.dataset.originalLabel = link.innerHTML;
    }
    link.textContent = 'Waiting...';
    link.setAttribute('aria-disabled', 'true');
    link.style.pointerEvents = 'none';
    link.style.opacity = '0.75';
    paymentTimer = setTimeout(() => finishPayment(link), msLeft);
  }

  grid.querySelectorAll('a.download-button[data-specs]:not(.out-of-stock)').forEach((link) => {
    restorePendingState(link);

    link.addEventListener('click', (e) => {
      // Already unlocked: it's now a normal working download link, let it through.
      if (link.dataset.unlocked === 'true') {
        return;
      }

      // Still waiting on a payment started earlier: reopen the waiting screen.
      if (link.dataset.pending === 'true') {
        e.preventDefault();
        openWaitingModal(link);
        return;
      }

      e.preventDefault();
      if (link.dataset.paymentQr) {
        startPaymentFlow(link);
      } else {
        openFreeDownloadModal(link);
      }
    });
  });

  specsConfirm.addEventListener('click', () => {
    // While pending, the button is hidden, so a click here only ever
    // happens once payment is confirmed and it's a real download link.
    setTimeout(closeSpecs, 200);
  });

  specsClose.addEventListener('click', () => {
    // Closing during the wait just hides the modal; the timer keeps running
    // in the background and the card button updates when it's done.
    closeSpecs();
  });
  specsCancel.addEventListener('click', cancelPayment);
  specsOverlay.addEventListener('click', (e) => {
    if (e.target === specsOverlay) closeSpecs();
  });
});
