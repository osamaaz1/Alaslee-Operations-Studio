import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(here, 'خطة-تطوير-متجر-الأصلي-على-سلة.html');
const pdfPath = path.join(here, 'خطة-تطوير-متجر-الأصلي-على-سلة.pdf');
const pdfPathV2 = path.join(here, 'خطة-تطوير-متجر-الأصلي-على-سلة-V2.pdf');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.complete
      ? Promise.resolve()
      : new Promise(resolve => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        })));

    // The source remains easy to edit; the rendered document is normalized
    // into the intended reading order before pagination.
    const main = document.querySelector('main');
    const executive = [...main.children].find(element =>
      element.matches('.sheet:not(.chapter)') && !element.id);
    const ordered = [
      main.querySelector('.cover'), executive,
      ...['toc', 'scope', 'audit', 'roadmap', 'data', 'catalog', 'ux',
        'seo', 'tracking', 'crm', 'finance', 'integration', 'point', 'cost',
        'kpis', 'checklists', 'sources', 'execution'].map(id => document.getElementById(id))
    ];
    for (const element of ordered) {
      if (element) main.appendChild(element);
    }
    main.style.display = 'block';
  });

  const audit = await page.evaluate(() => {
    const internalLinks = [...document.querySelectorAll('a[href^="#"]')];
    const missingTargets = internalLinks
      .map(link => link.getAttribute('href'))
      .filter(href => href && !document.querySelector(href));
    const failedImages = [...document.images]
      .filter(image => !image.complete || image.naturalWidth === 0)
      .map(image => image.getAttribute('src'));
    const allIds = [...document.querySelectorAll('[id]')].map(element => element.id);
    const duplicateIds = allIds.filter((id, index) => allIds.indexOf(id) !== index);
    const overflowing = [...document.querySelectorAll('main *')]
      .filter(element => element.scrollWidth > element.clientWidth + 2)
      .map(element => ({
        tag: element.tagName,
        id: element.id || null,
        className: typeof element.className === 'string' ? element.className : null,
        overflow: element.scrollWidth - element.clientWidth
      }))
      .filter(item => item.overflow > 4);
    const chapterOrder = [...document.querySelectorAll('main > section')]
      .map(section => section.id || (section.classList.contains('cover') ? 'cover' : 'executive'));
    return { missingTargets, failedImages, duplicateIds: [...new Set(duplicateIds)], overflowing, chapterOrder };
  });

  if (pageErrors.length || audit.missingTargets.length || audit.failedImages.length || audit.duplicateIds.length) {
    throw new Error(JSON.stringify({ pageErrors, ...audit }, null, 2));
  }

  await page.emulateMedia({ media: 'print' });
  const pdfOptions = {
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    tagged: true,
    outline: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="box-sizing:border-box;width:100%;padding:0 10mm 2.5mm;display:flex;justify-content:space-between;align-items:center;font-family:Arial,sans-serif;font-size:7px;color:#78716c;direction:rtl;">
        <span>خطة تطوير متجر الأصلي — Alaslee.com</span>
        <span dir="ltr"><span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`,
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
  };

  let finalPdfPath = pdfPath;
  try {
    await page.pdf({ ...pdfOptions, path: pdfPath });
  } catch (error) {
    if (error && error.code === 'EBUSY') {
      finalPdfPath = pdfPathV2;
      await page.pdf({ ...pdfOptions, path: pdfPathV2 });
    } else {
      throw error;
    }
  }

  console.log(JSON.stringify({ htmlPath, pdfPath: finalPdfPath, pageErrors, ...audit }, null, 2));
} finally {
  await browser.close();
}
