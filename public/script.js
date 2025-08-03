// Load customers on page load
window.onload = () => {
  loadCustomers();
  loadInvoices();
};

// Load customer list
async function loadCustomers() {
  const res = await fetch('/api/customers', {
    headers: { 'x-session': localStorage.getItem('authToken') }
  });
  const customers = await res.json();
  const select = document.getElementById('customerSelect');
  select.innerHTML = '<option value="">Choose Customer</option>';
  customers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    select.appendChild(opt);
  });
}

// Load copiers for selected customer
async function loadCopiers() {
  const customerId = document.getElementById('customerSelect').value;
  if (!customerId) return;

  const res = await fetch('/api/customers', {
    headers: { 'x-session': localStorage.getItem('authToken') }
  });
  const customers = await res.json();
  const customer = customers.find(c => c.id === customerId);
  if (!customer) return;

  const form = document.getElementById('copiersForm');
  form.innerHTML = '';

  customer.copiers.forEach((copier, i) => {
    const div = document.createElement('div');
    div.innerHTML = `
      <h3>${copier.model}</h3>
      <input placeholder="B&W Reading" id="bw_${copier.id}" type="number" required>
      <input placeholder="Color Reading" id="color_${copier.id}" type="number" required>
      <input placeholder="Spoil Copies (optional)" id="spoil_${copier.id}" type="number" value="0">
    `;
    form.appendChild(div);
  });

  const submit = document.createElement('button');
  submit.textContent = '✅ Generate Invoice';
  submit.onclick = () => generateInvoice(customer);
  form.appendChild(submit);
}

// Generate invoice
async function generateInvoice(customer) {
  const readings = [];

  customer.copiers.forEach(copier => {
    const bw = parseFloat(document.getElementById(`bw_${copier.id}`).value) || 0;
    const color = parseFloat(document.getElementById(`color_${copier.id}`).value) || 0;
    const spoil = parseFloat(document.getElementById(`spoil_${copier.id}`).value) || 0;

    const netBw = Math.max(0, bw - spoil * 0.5);
    const netColor = Math.max(0, color - spoil * 0.5);
    const chargeableBw = Math.max(0, netBw - copier.freeBw);
    const chargeableColor = Math.max(0, netColor - copier.freeColor);
    const usageCharge = (chargeableBw * copier.bwRate) + (chargeableColor * copier.colorRate);
    const totalCharge = Math.max(usageCharge, copier.minUsageCharge);
    const totalDue = copier.rentalFee + totalCharge;

    readings.push({
      copierId: copier.id,
      model: copier.model,
      bwReading: bw,
      colorReading: color,
      spoilCopies: spoil,
      netBw: netBw.toFixed(2),
      netColor: netColor.toFixed(2),
      chargeableBw,
      chargeableColor,
      usageCharge: usageCharge.toFixed(2),
      totalCharge: totalCharge.toFixed(2),
      rentalFee: copier.rentalFee,
      totalDue: totalDue.toFixed(2)
    });
  });

  const invoiceData = {
    customerId: customer.id,
    customerName: customer.name,
    month: document.getElementById('month').value,
    year: document.getElementById('year').value,
    copiers: readings
  };

  const res = await fetch('/api/invoice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-session': localStorage.getItem('authToken')
    },
    body: JSON.stringify(invoiceData)
  });

  const result = await res.json();
  const resultDiv = document.getElementById('result');
  resultDiv.style.display = 'block';

  let lines = '';
  result.invoice.copiers.forEach(c => {
    lines += `<p>${c.model}: $${c.totalDue}</p>`;
  });

  resultDiv.innerHTML = `
    <h3>🎉 Invoice for ${result.invoice.customerName}</h3>
    <p><strong>Total: $${result.invoice.copiers.reduce((a,b)=>a+parseFloat(b.totalDue),0).toFixed(2)}</strong></p>
    ${lines}
    <button onclick="downloadPDF('${result.pdf}')">📥 Download PDF</button>
  `;

  loadInvoices();
}

function downloadPDF(base64) {
  const link = document.createElement('a');
  link.href = 'data:application/pdf;base64,' + base64;
  link.download = 'invoice.pdf';
  link.click();
}

// Load past invoices
async function loadInvoices() {
  try {
    const res = await fetch('/api/invoices', {
      headers: { 'x-session': localStorage.getItem('authToken') }
    });
    const invoices = await res.json();
    const list = document.getElementById('invoicesList') || document.createElement('div');
    if (!document.getElementById('invoicesList')) {
      const container = document.createElement('div');
      container.id = 'invoicesList';
      container.innerHTML = '<h4>📋 Past Invoices</h4>';
      document.getElementById('result').appendChild(container);
    }
    list.innerHTML += invoices.slice(-5).reverse().map(inv => {
      return `<div style="margin:8px 0;padding:8px;border:1px solid #ccc;border-radius:4px;">
        <strong>${inv.customerName}</strong> - ${inv.month} ${inv.year} - $${inv.copiers.reduce((a,c)=>a+parseFloat(c.totalDue),0).toFixed(2)}
      </div>`;
    }).join('');
  } catch (e) {
    console.error(e);
  }
}