// server.js - the main app
const express = require('express');
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

const INVOICE_FILE = './data/invoices.json';

// Make sure data folder and file exist
if (!fs.existsSync('./data')) fs.mkdirSync('./data');
if (!fs.existsSync(INVOICE_FILE)) fs.writeFileSync(INVOICE_FILE, '[]');

// Show the website
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get all past invoices
app.get('/api/invoices', (req, res) => {
  const data = fs.readFileSync(INVOICE_FILE);
  res.json(JSON.parse(data));
});

// Make a new invoice
app.post('/api/invoice', async (req, res) => {
  const {
    customerName,
    copierModel,
    month,
    year,
    bwReading,
    colorReading,
    spoilCopies,
    rentalFee,
    bwRate,
    colorRate,
    freeBw,
    freeColor,
    minUsageCharge,
  } = req.body;

  const bw = parseFloat(bwReading);
  const color = parseFloat(colorReading);
  const spoil = parseFloat(spoilCopies) || 0;
  const rental = parseFloat(rentalFee);
  const bwR = parseFloat(bwRate);
  const colorR = parseFloat(colorRate);
  const freeBwCount = parseFloat(freeBw);
  const freeColorCount = parseFloat(freeColor);
  const minCharge = parseFloat(minUsageCharge);

  // Math time!
  const netBw = Math.max(0, bw - spoil * 0.5);
  const netColor = Math.max(0, color - spoil * 0.5);
  const chargeableBw = Math.max(0, netBw - freeBwCount);
  const chargeableColor = Math.max(0, netColor - freeColorCount);
  const usageCharge = (chargeableBw * bwR) + (chargeableColor * colorR);
  const totalCharge = Math.max(usageCharge, minCharge);
  const totalDue = rental + totalCharge;

  const invoice = {
    id: Date.now().toString(),
    customerName,
    copierModel,
    month,
    year,
    bwReading: bw,
    colorReading: color,
    spoilCopies: spoil,
    netBw: netBw.toFixed(2),
    netColor: netColor.toFixed(2),
    rentalFee: rental,
    bwRate: bwR,
    colorRate: colorR,
    freeBw: freeBwCount,
    freeColor: freeColorCount,
    minUsageCharge: minCharge,
    chargeableBw,
    chargeableColor,
    usageCharge: usageCharge.toFixed(2),
    totalCharge: totalCharge.toFixed(2),
    totalDue: totalDue.toFixed(2),
    dateIssued: new Date().toISOString().split('T')[0],
  };

  // Save to file
  const data = JSON.parse(fs.readFileSync(INVOICE_FILE));
  data.push(invoice);
  fs.writeFileSync(INVOICE_FILE, JSON.stringify(data, null, 2));

  // Make PDF
  const pdfBytes = await generateInvoicePDF(invoice);
  res.json({ invoice, pdf: pdfBytes.toString('base64') });
});

// Make PDF
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
  text(`Copier Model: ${invoice.copierModel}`, 50, y); y -= 20;
  text(`Period: ${invoice.month} ${invoice.year}`, 50, y); y -= 30;

  text('--- Meter Readings ---', 50, y); y -= 20;
  text(`B&W Reading: ${invoice.bwReading}`, 50, y); y -= 20;
  text(`Color Reading: ${invoice.colorReading}`, 50, y); y -= 20;
  text(`Spoil Copies: ${invoice.spoilCopies}`, 50, y); y -= 20;
  text(`Net B&W: ${invoice.netBw}`, 50, y); y -= 20;
  text(`Net Color: ${invoice.netColor}`, 50, y); y -= 30;

  text('--- Charges ---', 50, y); y -= 20;
  text(`Rental Fee: $${invoice.rentalFee}`, 50, y); y -= 20;
  text(`Free B&W: ${invoice.freeBw}`, 50, y); y -= 20;
  text(`Free Color: ${invoice.freeColor}`, 50, y); y -= 20;
  text(`Chargeable B&W: ${invoice.chargeableBw} × $${invoice.bwRate}`, 50, y);
  text(`$${(invoice.chargeableBw * invoice.bwRate).toFixed(2)}`, 400, y); y -= 20;
  text(`Chargeable Color: ${invoice.chargeableColor} × $${invoice.colorRate}`, 50, y);
  text(`$${(invoice.chargeableColor * invoice.colorRate).toFixed(2)}`, 400, y); y -= 20;
  text(`Usage Charge: $${invoice.usageCharge}`, 50, y); y -= 20;
  text(`Minimum Usage Charge: $${invoice.minUsageCharge}`, 50, y); y -= 20;
  text(`Applied Charge: $${invoice.totalCharge}`, 50, y); y -= 20;
  text(`Total Due: $${invoice.totalDue}`, 50, y); y -= 30;

  text(`Date Issued: ${invoice.dateIssued}`, 50, y);

  return await pdfDoc.save();
}

app.listen(PORT, () => {
  console.log(`App is running on port ${PORT}`);
});