import { load } from "cheerio";
import { launch } from "puppeteer";
import fs from 'node:fs';

function formatDateForWriteInBanking(date) {
  const day = date.getUTCDate().toString().padStart(2, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const year = date.getUTCFullYear().toString();

  return day + month + year;
}

async function run(city) {
  const browser = await launch({
    headless: "new",
    defaultViewport: false,
  });
  const page = await browser.newPage();

  await page.goto('https://www42.bb.com.br/portalbb/daf/beneficiario.bbx');

  // Inputs and Buttons
  const beneficiarySelector = '#formulario\\:txtBenef';
  const beneficiarySubmit = '#formulario > div:nth-child(4) > div > input:nth-child(1)';
  const startOfDateSelector = '#formulario\\:dataInicial';
  const endOfDateSelector = '#formulario\\:dataFinal';
  const dataQuerySubmit = '#formulario > div:nth-child(7) > div > input:nth-child(1)';
  const fundSelector = '#formulario\\:comboFundo';

  try {
    const currentDate = new Date();

    const formattedDate = formatDateForWriteInBanking(currentDate);

    // Home
    await page.click(beneficiarySelector);
    await page.type(beneficiarySelector, city.name);

    await Promise.all([
      page.click(beneficiarySubmit),
      page.waitForNavigation(),
    ]);

    // Data Query
    await page.waitForSelector(startOfDateSelector);
    await page.waitForSelector(endOfDateSelector);
    await page.waitForSelector(dataQuerySubmit);

    await page.type(startOfDateSelector, "01122023");
    await page.type(endOfDateSelector, "31122023");
    await page.type(fundSelector, 'TODOS');

    try {
      await Promise.all([
        page.waitForNavigation(),
        page.click(dataQuerySubmit),
      ]);

      const alertMessage = await page.waitForSelector('.alert.alert-danger', { visible: true, timeout: 3000 });

      if (alertMessage) {
        await browser.close();
        return null;
      }
    } catch (err) {
      console.error(err.message);
    }

    // Extract Data
    await page.waitForSelector('#formulario\\:demonstrativoList\\:tb');

    const pageData = await page.evaluate(() => {
      return {
        html: document.documentElement.innerHTML,
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      };
    });

    const $ = load(pageData.html);
    const data = [];

    $('tr.rich-table-row.even').each((index, element) => {
      const rowData = {};

      // Get the name of the statement
      rowData.demonstrative = $(element).find('.rich-table-cell').text().replace(/\s+/g, ' ').trim();

      // Get information from sub-tables
      const parcels = [];
      $(element).nextUntil('tr.rich-table-row.even', 'tr.rich-subtable-row').each((subIndex, subElement) => {
        const subData = {};
        subData.parcel = $(subElement).find('.rich-subtable-cell.texto1').text().trim();
        subData.value = $(subElement).find('.rich-subtable-cell.extratoValorPositivoAlinhaDireita').text().slice(2).trim();
        subData.date = new Date();

        if (subData.parcel === 'CREDITO BENEF.' || subData.parcel === 'CREDITO FUNDO') {
          if (subData.value !== '') {
            let amount;
            let formattedAmount;

            if (subData.value.includes('C')) {
              formattedAmount = subData.value.replace("C", "").replace(",", ".");
              amount = parseFloat(formattedAmount.replace(/\./g, ''));

              subData.value = amount;
              return parcels.push(subData);
            }
            parcels.push(subData);
          }
        }
      });

      if (parcels.length > 0) {
        rowData.parcels = parcels;
        data.push(rowData);
      }
    });

    fs.writeFileSync(`./tmp/${city.name}_${formattedDate}.json`, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err.message);
  } finally {
    await browser.close();
  }
}

const cities = [
  { name: 'sacramento', date: new Date() },
];

cities.map((city) => (
  run(city)
));
