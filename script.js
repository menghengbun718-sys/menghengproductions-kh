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

  // --- Requirements modal for real-file download links ---
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
    link.dataset.originalLabel = link.innerHTML;
    link.dataset.pending = 'true';
    link.textContent = 'Waiting...';
    link.setAttribute('aria-disabled', 'true');
    link.style.pointerEvents = 'none';
    link.style.opacity = '0.75';
  }

  function cancelPayment() {
    if (paymentTimer) {
      clearTimeout(paymentTimer);
      paymentTimer = null;
    }
    if (activePaymentLink) {
      const data = readPendingDownloads();
      delete data[getProductKey(activePaymentLink)];
      savePendingDownloads(data);
      activePaymentLink.dataset.pending = 'false';
      activePaymentLink.removeAttribute('aria-disabled');
      activePaymentLink.style.pointerEvents = '';
      activePaymentLink.style.opacity = '';
      activePaymentLink.innerHTML = activePaymentLink.dataset.originalLabel || 'Buy now <span>&#8595;</span>';
      sendActivityLog('payment_cancelled', activePaymentLink);
      activePaymentLink = null;
    }
    closeSpecs();
  }

  function unlockProductButton(link) {
    const key = getProductKey(link);
    const data = readPendingDownloads();
    delete data[key];
    savePendingDownloads(data);
    link.dataset.pending = 'false';
    link.removeAttribute('aria-disabled');
    link.style.pointerEvents = '';
    link.style.opacity = '';
    if (link.dataset.downloadLink) {
      link.href = link.dataset.downloadLink;
      link.setAttribute('download', link.dataset.downloadFile || '');
      link.innerHTML = 'Download now <span>&#8595;</span>';
    }
  }

  function closeSpecs() {
    specsOverlay.classList.remove('open');
  }

  function setPaymentPendingState(link) {
    const paymentQR = link.dataset.paymentQr;
    const paymentURL = link.dataset.paymentUrl || link.getAttribute('href') || '#';
    const productPrice = link.dataset.price || 'Payment required';
    const downloadLink = link.dataset.downloadLink || link.getAttribute('href') || '#';

    specsQR.src = paymentQR || '';
    specsQR.alt = `${specsTitle.textContent} payment QR code`;
    specsQRWrap.hidden = !paymentQR;
    specsPrice.textContent = productPrice;
    specsStatus.textContent = 'Payment received. Please click (Pay Now) to continue. | នៅពេលអ្នកបង់ប្រាក់រួច សូមចុច​ (Pay Now )';
    specsConfirm.textContent = 'Pay Now';
    specsConfirm.innerHTML = 'Pay Now <span>&#8595;</span>';
    specsConfirm.href = paymentURL;
    specsConfirm.removeAttribute('download');
    specsConfirm.dataset.downloadLink = downloadLink;
    specsConfirm.dataset.productKey = getProductKey(link);
    specsConfirm.dataset.pending = 'true';
  }

  function unlockDownload(link) {
    const downloadLink = link.dataset.downloadLink || link.getAttribute('href') || '#';
    specsStatus.textContent = 'Payment confirmed. Your download is ready.';
    specsConfirm.textContent = 'Download now';
    specsConfirm.innerHTML = 'Download now <span>&#8595;</span>';
    specsConfirm.href = downloadLink;
    specsConfirm.download = link.getAttribute('download') || '';
    specsConfirm.dataset.pending = 'false';
  }

  function restorePendingState(link) {
    if (!link.dataset.paymentQr) return;
    const key = getProductKey(link);
    const data = readPendingDownloads();
    const entry = data[key];
    if (!entry) return;
    if (Date.now() >= Number(entry.expiresAt || 0)) {
      delete data[key];
      savePendingDownloads(data);
      return;
    }
    link.dataset.pending = 'true';
    link.textContent = 'Waiting...';
    link.setAttribute('aria-disabled', 'true');
    link.style.pointerEvents = 'none';
    link.style.opacity = '0.75';
    link.dataset.downloadLink = link.dataset.downloadLink || link.getAttribute('href') || '#';
  }

  grid.querySelectorAll('a.download-button[data-specs]:not(.out-of-stock)').forEach((link) => {
    restorePendingState(link);

    link.addEventListener('click', (e) => {
      if (link.dataset.pending === 'true') {
        e.preventDefault();
        activePaymentLink = link;
        specsTitle.textContent = link.dataset.name || 'This product';
        if (link.dataset.specsList) {
          specsLine.innerHTML = `<ul class="specs-list">${link.dataset.specsList.split('|').map((spec) => `<li>${spec}</li>`).join('')}</ul>`;
        } else {
          specsLine.textContent = (link.dataset.specs || '').replace(/\\n/g, '\n');
        }
        specsQRWrap.hidden = false;
        specsPrice.textContent = link.dataset.price || 'Payment required';
        specsStatus.textContent = 'Payment received. Please click (Pay Now) to continue. | នៅពេលអ្នកបង់ប្រាក់រួច សូមចុច​ (Pay Now )';
        specsConfirm.textContent = 'Waiting...';
        specsConfirm.innerHTML = 'Waiting...';
        specsConfirm.dataset.pending = 'true';
        specsOverlay.classList.add('open');
        return;
      }

      e.preventDefault();
      specsTitle.textContent = link.dataset.name || 'This product';
      if (link.dataset.specsList) {
        specsLine.innerHTML = `<ul class="specs-list">${link.dataset.specsList.split('|').map((spec) => `<li>${spec}</li>`).join('')}</ul>`;
      } else {
        specsLine.textContent = (link.dataset.specs || '').replace(/\\n/g, '\n');
      }

      const paymentQR = link.dataset.paymentQr;
      if (paymentQR) {
        activePaymentLink = link;
        setPaymentPendingState(link);
      } else {
        specsQRWrap.hidden = true;
        specsPrice.textContent = '';
        specsStatus.textContent = 'Ready to download';
        specsConfirm.textContent = 'Download now';
        specsConfirm.innerHTML = 'Download now <span>&#8595;</span>';
        specsConfirm.href = link.getAttribute('href');
        specsConfirm.setAttribute('download', link.getAttribute('download') || '');
        specsConfirm.dataset.pending = 'false';
      }

      specsOverlay.classList.add('open');
    });
  });

  specsConfirm.addEventListener('click', (e) => {
    const pending = specsConfirm.dataset.pending === 'true';
    if (pending) {
      e.preventDefault();
      specsStatus.textContent = 'Payment confirmed. Please wait a moment for your download.';
      specsConfirm.textContent = 'Waiting...';
      specsConfirm.innerHTML = 'Waiting...';
      specsConfirm.setAttribute('aria-disabled', 'true');
      specsConfirm.classList.add('disabled');
      const targetKey = specsConfirm.dataset.productKey;
      if (activePaymentLink) {
        setProductWaiting(activePaymentLink);
      }
      const data = readPendingDownloads();
      data[targetKey] = { expiresAt: Date.now() + PAYMENT_WAIT_MS };
      savePendingDownloads(data);
      sendActivityLog('pay_now_clicked', activePaymentLink);
      paymentTimer = setTimeout(() => {
        const pendingButtons = grid.querySelectorAll('a.download-button[data-payment-qr]');
        pendingButtons.forEach((button) => {
          if (getProductKey(button) === targetKey) {
            unlockProductButton(button);
            activePaymentLink = null;
            sendActivityLog('download_ready', button);
          }
        });
        unlockDownload({
          dataset: { downloadLink: specsConfirm.dataset.downloadLink || '#' },
          getAttribute: (name) => name === 'download' ? '' : specsConfirm.dataset.downloadLink || '#'
        });
        paymentTimer = null;
      }, PAYMENT_WAIT_MS);
      return;
    }

    setTimeout(closeSpecs, 200);
  });

  specsClose.addEventListener('click', closeSpecs);
  specsCancel.addEventListener('click', cancelPayment);
  specsOverlay.addEventListener('click', (e) => {
    if (e.target === specsOverlay) closeSpecs();
  });

  const pendingButtons = grid.querySelectorAll('a.download-button[data-payment-qr]');
  pendingButtons.forEach((button) => {
    const key = getProductKey(button);
    const data = readPendingDownloads();
    const entry = data[key];
    if (!entry) return;
    if (Date.now() >= Number(entry.expiresAt || 0)) {
      delete data[key];
      savePendingDownloads(data);
      unlockProductButton(button);
      return;
    }

    const timeLeft = Number(entry.expiresAt) - Date.now();
    button.dataset.pending = 'true';
    button.textContent = 'Waiting...';
    button.setAttribute('aria-disabled', 'true');
    button.style.pointerEvents = 'none';
    button.style.opacity = '0.75';
    setTimeout(() => {
      unlockProductButton(button);
    }, timeLeft);
  });
});