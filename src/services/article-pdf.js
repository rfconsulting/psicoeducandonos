const PDFDocument = require('pdfkit');

function writeArticlePdf(article, output) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 54, bottom: 54, left: 54, right: 54 }, info: { Title: article.title, Author: article.author } });
  doc.pipe(output);
  doc.fillColor('#27635c').font('Helvetica-Bold').fontSize(10).text('PSICOEDUCÁNDONOS', { characterSpacing: 1.5 });
  doc.moveDown(1.2).fillColor('#172624').font('Times-Bold').fontSize(25).text(article.title, { lineGap: 4 });
  doc.moveDown(0.7).fillColor('#52615d').font('Helvetica').fontSize(11).text(`Por ${article.author}`);
  doc.moveDown(1.4).fillColor('#344842').font('Times-Roman').fontSize(14).text(article.summary, { lineGap: 4 });
  doc.moveDown(1.7).fillColor('#172624').font('Helvetica').fontSize(11);
  for (const paragraph of (article.body.trim() === article.summary.trim() ? '' : article.body).split(/\n{2,}/).map(value => value.trim()).filter(Boolean)) {
    doc.text(paragraph, { lineGap: 5, paragraphGap: 12, align: 'left' });
  }
  doc.end();
}

module.exports = writeArticlePdf;
