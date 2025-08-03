document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;

  const data = {
    customerName: form.customerName.value,
    copierModel: form.copierModel.value,
    month: form.month.value,
    year: form.year.value,
    bwReading: form.bwReading.value,
    colorReading: form.colorReading.value,
    spoilCopies: form.spoilCopies.value || 0,
    rentalFee: form.rentalFee.value,
    bwRate: form.bwRate.value,
    colorRate: form.colorRate.value,
    freeBw: form.freeBw.value,
    freeColor: form.freeColor.value,
    minUsageCharge: form.minUsageCharge.value,
  };

  const res = await fetch('/api/invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const result = await res.json();
  const resultDiv = document.getElementById('result');
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = `
    <h3>🎉 Invoice Ready!</h3>
    <p><strong>Total Due: $${result.invoice.totalDue}</strong></p>
    <button onclick="downloadPDF('${result.pdf}')">📥 Download PDF</button>
    <hr>
    <h4>📋 Past Invoices</h4>
    <div id="invoicesList">Loading...</div>
  `;

  loadInvoices();
});

function downloadPDF(base64) {
  const link = document.createElement('a');
  link.href = 'data:application/pdf;base64,' + base64;
  link.download = 'invoice.pdf';
  link.click();
}

async function loadInvoices() {
  try {
    const res = await fetch('/api/invoices');
    const invoices = await res.json();
    const list = document.getElementById('invoicesList');
    list.innerHTML = invoices.length ? '' : '<p>No invoices yet.</p>';
    invoices.reverse().forEach(inv => {
      const div = document.createElement('div');
      div.innerHTML = `<strong>${inv.customerName}</strong> - ${inv.month} ${inv.year} - $${inv.totalDue}`;
      div.style.margin = '8px 0';
      div.style.padding = '8px';
      div.style.border = '1px solid #ddd';
      div.style.borderRadius = '4px';
      list.appendChild(div);
    });
  } catch (e) {
    document.getElementById('invoicesList').innerHTML = 'Error loading.';
  }
}

// Load invoices when page opens
window.onload = loadInvoices;