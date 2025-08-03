const express = require('express');
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

// Optional: for sending emails
let FormData;
let Resend;

if (process.env.RESEND_API_KEY) {
  FormData = require('form-data');
  Resend = require('resend');
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

// === Security ===
const PASSWORD = process.env.ADMIN_PASSWORD || 'secret123'; // CHANGE THIS!
let sessions = new Set();

// Protect all routes except login & public files
app.use((req, res, next) => {
  const isPublic = [
    '/login',
    '/api/login',
    '/customers.html',
    '/login.html'
  ].includes(req.path) || req.path.startsWith('/style.css') || req.path.startsWith('/script.js') || req.path.startsWith('/customers.js');

  if (isPublic) return next();

  const token = req.headers['x-session'] || req.query.session;
  if (token && sessions.has(token)) {
    res.locals.session = token;
    return next();
  }

  return res.redirect('/login');
});

// === Data Files ===
const CUSTOMERS_FILE = './data/customers.json';
const INVOICES_FILE = './data/invoices.json';

[ './data', CUSTOMERS_FILE, INVOICES_FILE ].forEach(file => {
  if (!fs.existsSync(file)) {
    if (file.endsWith('.json')) fs.writeFileSync(file, '[]');
  }
});

// === API: Login ===
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === PASSWORD) {
    const token = 'auth_' + Math.random().toString(36).substr(2, 9);
    sessions.add(token);
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// === API: Customers ===
app.get('/api/customers', (req, res) => {
  const data = fs.readFileSync(CUSTOMERS_FILE);
  res.json(JSON.parse(data));
});

app.post('/api/customers', (req, res) => {
  const updated = req.body;
  const data = JSON.parse(fs.readFileSync(CUSTOMERS_FILE));
  const i = data.findIndex(c => c.id === updated.id);
  if (i > -1) data[i] = updated;
  else data.push(updated);
  fs.writeFileSync(CUSTOMERS_FILE, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

app.delete('/api/customers/:id', (req, res) => {
  const id = req.params.id;
  const data = JSON.parse(fs.readFileSync(CUSTOMERS_FILE));
  const filtered = data.filter(c => c.id !== id);
  fs.writeFileSync(CUSTOMERS_FILE, JSON.stringify(filtered, null, 2));
  res.json({ success: true });
});

// === API: Invoices ===
app.get('/api/invoices', (req, res) => {
  const data = fs.readFileSync(INVOICES_FILE);
  res.json(JSON.parse(data));
});

app.post('/api/invoice', async (req, res) => {
  const data = req.body;
  const invoice = {
    id: Date.now().toString(),
    ...data,
    dateIssued: new Date().toISOString().split('T')[0]
  };

  // Save invoice
  const invoices = JSON.parse(fs.readFileSync(INVOICES_FILE));
  invoices.push(invoice);
  fs.writeFileSync(INVOICES_FILE, JSON.stringify(invoices, null, 2));

  // Generate PDF
  const pdfBytes = await generateInvoicePDF(invoice);

  // Send email if configured
  if (process.env.RESEND_API_KEY && data.email) {
    try {
      await sendEmail(data.email, data.customerName, invoice, pdfBytes);
    } catch (err) {
      console.error('Email failed:', err.message);
    }
  }

  res.json({ invoice, pdf: pdfBytes.toString('base64') });
});

// === PDF Generation ===
async function generateInvoicePDF(invoice) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const text = (str, x, y) => page.drawText(str, { x, y, size: 12, font, color: rgb(0, 0, 0) });

  let y = height - 50;
  text('COPIER RENTAL INVOICE', 50, y); y -= 30;
  text(`Invoice ID: ${invoice.id}`, 50, y); y -= 20;
  text(`Customer: ${invoice.customerName}`, 50, y); y -= 20;
  text(`Period: ${invoice.month} ${invoice.year}`, 50, y); y -= 30;

  let totalRental = 0, totalUsage = 0, totalDue = 0;

  for (const c of invoice.copiers) {
    text(`--- ${c.model} ---`, 50, y); y -= 20;
    text(`B&W: ${c.bwReading}`, 50, y);
    text(`Color: ${c.colorReading}`, 250, y);
    text(`Spoil: ${c.spoilCopies}`, 450, y); y -= 20;

    text(`Rental: $${c.rentalFee}`, 50, y); y -= 20;
    text(`Usage Charge: $${c.totalCharge}`, 50, y); y -= 20;

    totalRental += c.rentalFee;
    totalUsage += parseFloat(c.totalCharge);
    y -= 20;
  }

  totalDue = totalRental + totalUsage;

  text('--- TOTAL ---', 50, y); y -= 20;
  text(`Rental: $${totalRental.toFixed(2)}`, 50, y); y -= 20;
  text(`Usage: $${totalUsage.toFixed(2)}`, 50, y); y -= 20;
  text(`Total Due: $${totalDue.toFixed(2)}`, 50, y); y -= 30;

  text(`Date: ${invoice.dateIssued}`, 50, y);

  return await pdfDoc.save();
}

// === Email Sending (via Resend) ===
async function sendEmail(to, name, invoice, pdfBytes) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const base64 = Buffer.from(pdfBytes).toString('base64');

  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to,
    subject: `Your Invoice - ${invoice.month} ${invoice.year}`,
    html: `<p>Hi ${name},<br>Your monthly copier invoice is attached.<br><strong>Total: $${invoice.copiers.reduce((a,c)=>a+parseFloat(c.totalDue),0).toFixed(2)}</strong></p>`,
    attachments: [
      {
        content: base64,
        filename: 'invoice.pdf'
      }
    ]
  });
}

// === Home Page ===
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`App running on port ${PORT}`);
});