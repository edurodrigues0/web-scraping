import { load } from "cheerio";
import { launch } from "puppeteer";
import fs from 'node:fs'

async function run() {
  const browser = await launch({
    headless: false,
    defaultViewport: false,
  });
  const page = await browser.newPage();
  
  await page.goto('https://www42.bb.com.br/portalbb/daf/beneficiario.bbx');
  
  // Inputs e Buttons
  const beneficiarioSelector = '#formulario\\:txtBenef';
  const beneficiarioSubmit = '#formulario > div:nth-child(4) > div > input:nth-child(1)';
  const startOfDateSelector = '#formulario\\:dataInicial';
  const endOfDateSelector = '#formulario\\:dataFinal';
  const dadosDeConsultaSubmit = '#formulario > div:nth-child(7) > div > input:nth-child(1)';
  const fundoSelector = '#formulario\\:comboFundo';

  try {
    // Home
    await page.click(beneficiarioSelector);
    await page.type(beneficiarioSelector, 'araxa');
  
    await Promise.all([
      page.click(beneficiarioSubmit),
      page.waitForNavigation(),
    ]);
 
    // Dados de consulta
    await page.waitForSelector(startOfDateSelector);
    await page.waitForSelector(endOfDateSelector);
    await page.waitForSelector(dadosDeConsultaSubmit);

    await page.type(startOfDateSelector, '02012024', { viseble: true });
    await page.type(endOfDateSelector, '02012024', { viseble: true });
    await page.type(fundoSelector, 'TODOS', { viseble: true });

    try {
      await Promise.all([
        page.waitForNavigation(),
        page.click(dadosDeConsultaSubmit),
      ]);

    
      const i = await page.waitForSelector('.alert.alert-danger', { visible: true, timeout: 3000 })
      
      if (i) {
        await browser.close();
        return null
      }
    } catch (err) {
      console.error(err.message)
    }

    // Extrair dados
    await page.waitForSelector('#formulario\\:demonstrativoList\\:tb');

    const pageData = await page.evaluate(() => {
      return {
        html: document.documentElement.innerHTML,
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      }
    })

    const $ = load(pageData.html)
    const data = [];

    $('tr.rich-table-row.even').each((index, element) => {
      const rowData = {};
    
      // Obter o nome do demonstrativo
      rowData.nomeDemonstrativo = $(element).find('.rich-table-cell').text().replace(/\s+/g, ' ').trim();
    
      // Obter as informações das sub-tabelas
      const parcelas = [];
      $(element).nextUntil('tr.rich-table-row.even', 'tr.rich-subtable-row').each((subIndex, subElement) => {
        const subData = {};
        subData.parcela = $(subElement).find('.rich-subtable-cell.texto1').text().trim();
        subData.valor = $(subElement).find('.rich-subtable-cell.extratoValorPositivoAlinhaDireita').text().slice(2).trim();
        subData.data = new Date()

        if(subData.parcela === 'CREDITO BENEF.' || subData.parcela === 'CREDITO FUNDO') {
          if (subData.valor !== '') {
            let valor;
            let valorFormatado;
        
            if (subData.valor.includes('C')) {
               valorFormatado = subData.valor.replace("C", "").replace(",", ".");
               valor = parseFloat(valorFormatado.replace(/\./g, ''));
        
               subData.valor = valor;
               return parcelas.push(subData);
             }
            parcelas.push(subData);
          }
        }
      });
    
      if (parcelas.length > 0) {
        rowData.parcelas = parcelas
        data.push(rowData)
      }
    });
    
    // Exibindo os resultados
    fs.writeFileSync('data.json', JSON.stringify(data, null, 2))

  } catch (err) {
    console.error(err.message);
  } finally {
    await browser.close();
  }
}

run();