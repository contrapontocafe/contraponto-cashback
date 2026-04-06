// =====================================================
// CONTRAPONTO CAFÉ — CASHBACK SYSTEM
// Shared data layer using localStorage
// =====================================================

const DB = {
  // --- CLIENTS ---
  getClients() {
    return JSON.parse(localStorage.getItem('cp_clients') || '[]');
  },
  saveClients(clients) {
    localStorage.setItem('cp_clients', JSON.stringify(clients));
  },
  findClientByCPF(cpf) {
    return this.getClients().find(c => c.cpf === cpf);
  },
  addClient(client) {
    const clients = this.getClients();
    clients.push(client);
    this.saveClients(clients);
  },
  updateClient(updated) {
    const clients = this.getClients().map(c => c.cpf === updated.cpf ? updated : c);
    this.saveClients(clients);
  },

  // --- TRANSACTIONS ---
  getTransactions() {
    return JSON.parse(localStorage.getItem('cp_transactions') || '[]');
  },
  saveTransactions(txs) {
    localStorage.setItem('cp_transactions', JSON.stringify(txs));
  },
  addTransaction(tx) {
    const txs = this.getTransactions();
    txs.unshift(tx);
    this.saveTransactions(txs);
  },
  getClientTransactions(cpf) {
    return this.getTransactions().filter(t => t.cpf === cpf);
  },

  // --- USED COUPONS (anti-fraud) ---
  getUsedCoupons() {
    return JSON.parse(localStorage.getItem('cp_used_coupons') || '[]');
  },
  isCouponUsed(couponKey) {
    return this.getUsedCoupons().includes(couponKey);
  },
  markCouponUsed(couponKey) {
    const used = this.getUsedCoupons();
    used.push(couponKey);
    localStorage.setItem('cp_used_coupons', JSON.stringify(used));
  },

  // --- ACTIVE SESSION ---
  setSession(cpf) {
    sessionStorage.setItem('cp_session', cpf);
  },
  getSession() {
    return sessionStorage.getItem('cp_session');
  },
  clearSession() {
    sessionStorage.removeItem('cp_session');
  },

  // --- BALANCE (with expiry logic) ---
  getActiveBalance(cpf) {
    const txs = this.getClientTransactions(cpf);
    const now = Date.now();
    let balance = 0;
    txs.forEach(tx => {
      if (tx.type === 'credit') {
        const expiry = new Date(tx.expiresAt).getTime();
        if (expiry > now) balance += tx.amount;
      } else if (tx.type === 'debit' || tx.type === 'redeem') {
        balance -= tx.amount;
      } else if (tx.type === 'welcome') {
        const expiry = new Date(tx.expiresAt).getTime();
        if (expiry > now) balance += tx.amount;
      }
    });
    return Math.max(0, balance);
  },

  // Total accumulated (lifetime)
  getTotalEarned(cpf) {
    return this.getClientTransactions(cpf)
      .filter(t => t.type === 'credit' || t.type === 'welcome')
      .reduce((s, t) => s + t.amount, 0);
  }
};

// --- HELPERS ---
function formatCPF(v) {
  return v.replace(/\D/g,'').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
}
function rawCPF(v) { return v.replace(/\D/g,''); }
function formatPhone(v) {
  return v.replace(/\D/g,'').replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3');
}
function formatCurrency(v) {
  return v.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR');
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
function validateCPF(cpf) {
  cpf = rawCPF(cpf);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let sum = 0, r;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  r = 11 - (sum % 11); if (r >= 10) r = 0;
  if (r !== parseInt(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  r = 11 - (sum % 11); if (r >= 10) r = 0;
  return r === parseInt(cpf[10]);
}

// Parse NFC-e QR Code URL to extract invoice value
function parseNFCeQRCode(url) {
  try {
    // Standard NFC-e QR Code format: contains vNF (valor NF) parameter
    const u = new URL(url);
    // Try common NF-e/NFC-e parameter names
    const val = u.searchParams.get('vNF') || u.searchParams.get('vnf') ||
                u.searchParams.get('valor') || u.searchParams.get('v');
    if (val) return parseFloat(val.replace(',','.'));

    // Try to extract from path segments (some SEFAZ formats)
    const match = url.match(/[Vv][Nn][Ff]=([0-9]+[.,][0-9]{2})/);
    if (match) return parseFloat(match[1].replace(',','.'));

    return null;
  } catch {
    return null;
  }
}

// Extract unique coupon key from QR code
function extractCouponKey(url) {
  try {
    const u = new URL(url);
    // chNFe is the 44-digit access key — unique per invoice
    return u.searchParams.get('chNFe') || u.searchParams.get('chnfe') || url;
  } catch {
    return url;
  }
}
