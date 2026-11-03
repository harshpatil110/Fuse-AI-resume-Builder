import PDFDocument from 'pdfkit';

// Vercel-deploy branch only: pure-JS PDF generation for Vercel, where neither
// pdflatex nor a Puppeteer Chrome binary is available. This renders the
// structured resume data (basics / work / projects / skills — exactly what
// the Editor edits) in a clean A4 layout. It is NOT the user's original LaTeX
// template layout; for an exact LaTeX-template PDF, compile the rewritten
// .tex locally or in Overleaf.
// Locally this file is unused — pdfService.js still uses Puppeteer there.

const clean = (value) => {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Strip simple LaTeX commands like \textbf{...} -> ..., and stray braces.
  text = text.replace(/\\[a-zA-Z]+\{([^{}]*)\}/g, '$1');
  text = text.replace(/\\[a-zA-Z]+/g, '');
  text = text.replace(/[{}]/g, '');
  text = text.replace(/%+/g, '%');
  return text.trim();
};

const asList = (value) => {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  if (typeof value === 'string') return value ? [clean(value)] : [];
  return [];
};

const joinList = (value) => {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).join(', ');
  return clean(value);
};

export const generatePDFWithPdfKit = async (resumeData) => {
  const data = resumeData || {};
  const basics = data.basics || {};
  const work = Array.isArray(data.work) ? data.work : [];
  const projects = Array.isArray(data.projects) ? data.projects : [];
  const skills = asList(data.skills);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 54 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const sectionTitle = (title) => {
      doc.moveDown(1);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#57534E').text(title.toUpperCase());
      doc.moveDown(0.25);
      doc.strokeColor('#E7E5E4').lineWidth(1).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
      doc.moveDown(0.5);
      doc.fillColor('#1C1917');
    };

    // Header
    if (clean(basics.name)) {
      doc.font('Helvetica-Bold').fontSize(26).text(clean(basics.name));
    }
    if (clean(basics.role)) {
      doc.font('Helvetica').fontSize(14).fillColor('#57534E').text(clean(basics.role));
      doc.fillColor('#1C1917');
    }
    const contact = [basics.email, basics.phone, basics.location, basics.url].map(clean).filter(Boolean).join('  |  ');
    if (contact) {
      doc.moveDown(0.25);
      doc.font('Helvetica').fontSize(10).fillColor('#57534E').text(contact);
      doc.fillColor('#1C1917');
    }
    if (clean(basics.summary)) {
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(11).text(clean(basics.summary), { lineGap: 2 });
    }

    // Work experience
    if (work.length > 0) {
      sectionTitle('Experience');
      for (const job of work) {
        const position = clean(job.position || job.title);
        const company = clean(job.company || job.organization);
        const period = clean(job.period || [job.startDate, job.endDate].filter(Boolean).join(' - '));
        if (position || company) {
          doc.font('Helvetica-Bold').fontSize(13).text(position || company);
          if (company && position) doc.font('Helvetica').fontSize(11).fillColor('#57534E').text(company);
          if (period) doc.font('Helvetica').fontSize(10).fillColor('#57534E').text(period);
          doc.fillColor('#1C1917');
        }
        if (clean(job.location)) doc.font('Helvetica').fontSize(10).fillColor('#57534E').text(clean(job.location)).fillColor('#1C1917');
        if (clean(job.summary)) doc.font('Helvetica').fontSize(11).text(clean(job.summary), { lineGap: 2 });
        for (const bullet of asList(job.bullets)) {
          doc.font('Helvetica').fontSize(11).text(`•  ${bullet}`, { indent: 12, lineGap: 2 });
        }
        doc.moveDown(0.5);
      }
    }

    // Projects
    if (projects.length > 0) {
      sectionTitle('Projects');
      for (const project of projects) {
        const name = clean(project.name || project.title);
        if (name) doc.font('Helvetica-Bold').fontSize(13).text(name);
        const tech = joinList(project.technologies || project.tech);
        const desc = clean(project.description);
        const meta = [tech, desc, clean(project.url)].filter(Boolean).join('  |  ');
        if (meta) doc.font('Helvetica').fontSize(11).fillColor('#57534E').text(meta).fillColor('#1C1917');
        for (const bullet of asList(project.bullets)) {
          doc.font('Helvetica').fontSize(11).text(`•  ${bullet}`, { indent: 12, lineGap: 2 });
        }
        doc.moveDown(0.5);
      }
    }

    // Skills
    if (skills.length > 0) {
      sectionTitle('Skills');
      doc.font('Helvetica').fontSize(11).text(skills.join(', '), { lineGap: 2 });
    }

    doc.end();
  });
};
