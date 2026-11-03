import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generatePDFWithPdfKit } from './pdfServiceVercel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const generatePDF = async (resumeData) => {
  // Vercel-deploy branch only: no Chrome binary is available on Vercel, so
  // Puppeteer launch would fail. Use the pure-JS pdfkit renderer instead.
  // Locally (VERCEL unset) the Puppeteer path below is unchanged.
  if (process.env.VERCEL === '1') {
    return generatePDFWithPdfKit(resumeData);
  }
  // Read and compile template
  const templatePath = path.join(__dirname, '../templates/resumeTemplate.hbs');
  const templateHtml = fs.readFileSync(templatePath, 'utf-8');
  const template = Handlebars.compile(templateHtml);
  
  const html = template(resumeData);
  
  // Launch puppeteer
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Set HTML content and wait for fonts to load
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  // Generate PDF
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '1in', bottom: '1in', left: '1in', right: '1in' }
  });
  
  await browser.close();
  return pdfBuffer;
};
