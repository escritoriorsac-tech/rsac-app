import React, { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient.js";

/* ============================================================
   Site público RSAC — página inicial única (âncoras)
   Rotas: /  (e /sobre /areas /como-atuamos /contato rolam até a seção)
   /portal e /equipe pertencem ao sistema (ver App.jsx).
   Imagens em public/assets/; fontes hospedadas localmente em public/fonts/ (sem chamadas a terceiros). Conteúdo informativo (Provimento 205/2021).
   ============================================================ */

const TAGLINE = "Advogados especializados"; // ver observação sobre o Provimento 205/2021
const EMAIL = "escritorio.rsac@gmail.com";
const WHATS_NUM = "5511933596958";
const CONTROLADOR = "Rodrigo Luiz Chaves de Sousa Santos";
const CNPJ = ""; // preencha se desejar exibir (ex.: "00.000.000/0000-00")
const PRIV_ATUALIZ = "22 de novembro de 2026";
const LINKEDIN = "https://www.linkedin.com/in/rodrigolcssantos";

const TOPICS = ["Holding e patrimônio da família", "M&A (compra, venda ou investimento)", "Reforma tributária (CBS e IBS)", "Planejamento tributário", "Reorganização societária", "Sucessão e ITCMD", "Outro assunto"];

const PAUTA = [
  { k: "CBS · 2027", t: "Alíquota de referência de 11,3%", p: "O TCU calculou o percentual que substitui PIS e Cofins. O Senado ainda precisa confirmá-lo por resolução. Reduções setoriais e créditos mudam o resultado de cada empresa." },
  { k: "ITCMD · LC 227/2026", t: "Herança e doação com regras novas", p: "A lei exige alíquotas progressivas, fixa teto de 8% e trata o valor de mercado das cotas. Cada estado ainda precisa legislar, o que torna a sucessão patrimonial uma pauta de planejamento." },
  { k: "Dividendos", t: "Tributação em debate", p: "Dois projetos de lei propõem novas regras para lucros e dividendos. São propostas em tramitação, ainda sem aprovação. A retenção vigente segue a Lei 15.270/2025." },
];

const DECISOES = [
  { t: "Vender, comprar ou captar investimento", p: "Estrutura da operação, impacto fiscal e contratos analisados antes da assinatura, e não depois.", topic: TOPICS[1] },
  { t: "Organizar o patrimônio da família", p: "Holdings familiares e imobiliárias, ITCMD e sucessão, com o efeito de cada alternativa explicado por escrito.", topic: TOPICS[0] },
  { t: "Entender o que a reforma tributária muda", p: "Simulação do efeito de CBS e IBS no seu negócio e revisão de estruturas já implantadas.", topic: TOPICS[2] },
  { t: "Reorganizar a sociedade ou ajustar a relação entre sócios", p: "Reorganizações, acordos de sócios e contratos, formalizados com segurança jurídica.", topic: TOPICS[4] },
];

const CAMPOS = [
  { h: "Tributário", core: true, l: ["Planejamento tributário", "Reforma tributária: CBS e IBS", "Tributário em M&A", "Tributação de lucros e dividendos", "ITCMD e transmissão patrimonial"] },
  { h: "Empresarial", l: ["Societário", "M&A", "Reorganização societária", "Contratos e negociações", "Contencioso societário"] },
  { h: "Patrimonial e imobiliário", l: ["Planejamento patrimonial e sucessório", "Holdings familiares e imobiliárias", "Imobiliário e locações", "Inventários e partilhas"] },
  { h: "Contencioso e demais áreas", l: ["Contencioso cível e empresarial", "Relações de consumo", "Propriedade intelectual", "Direito público e Fazenda Pública", "Trabalhista"] },
];

const VALORES = [
  ["Rigor técnico", "Análise baseada na lei, na jurisprudência e nos documentos do cliente."],
  ["Clareza", "Premissas, cenários e conclusões apresentados por escrito."],
  ["Ética", "Atuação conforme o Código de Ética e Disciplina da OAB."],
  ["Sigilo", "Confidencialidade sobre os dados e as operações dos clientes."],
  ["Atualização", "Acompanhamento da legislação e da regulamentação em mudança."],
];

const ETAPAS = [
  ["Diagnóstico", "Levantamento da empresa, do patrimônio e dos objetivos do cliente.", "escopo definido"],
  ["Cenários", "Comparação das alternativas jurídicas e tributárias, com premissas explícitas.", "estudo comparativo"],
  ["Implementação", "Elaboração e acompanhamento dos atos societários e documentos necessários.", "documentos prontos"],
  ["Acompanhamento", "Revisão da estrutura conforme a legislação e a situação do cliente mudam.", "informativos e revisões"],
];

const SECTION_BY_PATH = { "/sobre": "sobre", "/areas": "areas", "/como-atuamos": "como", "/contato": "contato" };

const CSS = `
@font-face{font-family:"Newsreader";font-style:normal;font-weight:400;font-display:swap;src:url("/fonts/newsreader-latin-400-normal.woff2") format("woff2")}
@font-face{font-family:"Newsreader";font-style:normal;font-weight:500;font-display:swap;src:url("/fonts/newsreader-latin-500-normal.woff2") format("woff2")}
@font-face{font-family:"Newsreader";font-style:normal;font-weight:600;font-display:swap;src:url("/fonts/newsreader-latin-600-normal.woff2") format("woff2")}
@font-face{font-family:"Newsreader";font-style:italic;font-weight:400;font-display:swap;src:url("/fonts/newsreader-latin-400-italic.woff2") format("woff2")}
@font-face{font-family:"Inter";font-style:normal;font-weight:400;font-display:swap;src:url("/fonts/inter-latin-400-normal.woff2") format("woff2")}
@font-face{font-family:"Inter";font-style:normal;font-weight:500;font-display:swap;src:url("/fonts/inter-latin-500-normal.woff2") format("woff2")}
@font-face{font-family:"Inter";font-style:normal;font-weight:600;font-display:swap;src:url("/fonts/inter-latin-600-normal.woff2") format("woff2")}
.pw{--bg:#F3F5F6;--surface:#FFFFFF;--ink:#14202B;--muted:#56636F;--line:#D9DFE3;--navy:#0E2841;--navy-2:#15304D;--on-navy:#F1F3F4;--on-navy-muted:#A9B7C4;--gold:#A9843F;--gold-soft:#C9A96A;--logo:url("/assets/logo-curto-claro.png");
  --serif:"Newsreader",Georgia,"Times New Roman",serif;--sans:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif;
  background:var(--bg);color:var(--ink);font:400 16px/1.65 var(--sans);min-height:100vh;-webkit-font-smoothing:antialiased}
@media (prefers-color-scheme: dark){.pw{--bg:#0B1620;--surface:#111F2C;--ink:#E8ECEF;--muted:#9AA8B5;--line:#223445;--navy:#08131D;--navy-2:#0F2132;--gold:#C9A96A;--gold-soft:#C9A96A;--logo:url("/assets/logo-curto-escuro.png");color-scheme:dark}}
html{scroll-behavior:smooth}
.pw *{box-sizing:border-box}
.pw a{color:inherit}
.pw [id]{scroll-margin-top:84px}
.pw h1,.pw h2,.pw h3{font-family:var(--serif);font-weight:500;letter-spacing:-.01em;text-wrap:balance;margin:0;color:inherit}
.pw .wrap{max-width:1160px;margin:0 auto;padding-left:max(20px,env(safe-area-inset-left,0px));padding-right:max(20px,env(safe-area-inset-right,0px))}
.pw .eyebrow{font:600 12px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--gold)}
.pw header{background:var(--surface);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:30}
.pw .bar{display:flex;align-items:center;justify-content:space-between;gap:24px;padding-block:16px}
.pw .brand{display:flex;flex-direction:row;align-items:center;gap:18px;text-decoration:none}
.pw .brand .logo{display:block;height:36px;width:168px;background:var(--logo) left center/contain no-repeat}
.pw .brand .nm{border-left:1px solid var(--gold);padding-left:18px;font:500 11px/1.6 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.pw .brand .nm em{display:block;margin-top:2px;font:italic 400 14px/1.3 var(--serif);letter-spacing:.02em;text-transform:none;color:var(--gold)}
@media (max-width:560px){.pw .brand .nm{display:none}.pw .brand .logo{height:30px;width:140px}}
.pw nav{display:flex;align-items:center;gap:26px;font-size:14px}
.pw nav a{text-decoration:none;color:var(--muted)}
.pw nav a:hover,.pw nav a:focus-visible{color:var(--ink)}
.pw .portal{border:1px solid var(--gold);background:none;color:var(--ink);padding:10px 20px;border-radius:2px;font:600 14px/1 var(--sans);cursor:pointer}
.pw .portal:hover,.pw .portal:focus-visible{background:var(--navy);color:var(--on-navy);border-color:var(--navy)}
@media (max-width:860px){.pw nav a{display:none}}
.pw .btn{display:inline-block;background:var(--navy);color:var(--on-navy);padding:15px 26px;text-decoration:none;font:600 14px/1 var(--sans);letter-spacing:.03em;border-radius:2px;border:1px solid var(--navy);cursor:pointer}
.pw .btn:hover,.pw .btn:focus-visible{background:var(--navy-2)}
.pw .btn.gold{background:var(--gold);border-color:var(--gold);color:#fff}
.pw .btn.gold:hover{filter:brightness(1.08);background:var(--gold)}
.pw .btn.ghost{background:transparent;color:inherit;border-color:var(--gold-soft)}
.pw .btn.ghost:hover{background:rgba(255,255,255,.08)}
.pw .link{font:500 14px/1 var(--sans);text-decoration:none;border-bottom:1px solid var(--gold);padding-bottom:4px;background:none;border-top:0;border-left:0;border-right:0;color:inherit;cursor:pointer}
.pw .hero{padding-block:72px 80px}
.pw .hero-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:64px;align-items:center}
.pw .hero h1{font-size:clamp(38px,5.4vw,64px);line-height:1.04;margin:18px 0 22px}
.pw .hero h1 em{font-style:italic;color:var(--gold)}
.pw .tag{display:flex;align-items:center;gap:16px;font:italic 400 clamp(22px,2.6vw,30px)/1.2 var(--serif);color:var(--gold);margin:0 0 22px}
.pw .tag span{display:block;width:44px;height:2px;background:var(--gold)}
.pw .lead{font-size:18px;color:var(--muted);max-width:52ch;margin:0 0 30px}
.pw .cta{display:flex;flex-wrap:wrap;gap:14px 22px;align-items:center}
.pw .assure{display:flex;flex-wrap:wrap;gap:6px 22px;margin:22px 0 0;padding:0;list-style:none;font-size:13.5px;color:var(--muted)}
.pw .assure li:before{content:"";display:inline-block;width:6px;height:6px;background:var(--gold);transform:rotate(45deg);margin-right:9px;vertical-align:middle}
.pw .portrait{position:relative;max-width:420px;justify-self:end;width:100%;margin:0}
.pw .portrait:before{content:"";position:absolute;inset:18px -18px -18px 18px;border:1px solid var(--gold-soft);z-index:0}
.pw .portrait img{position:relative;z-index:1;display:block;width:100%;height:auto;aspect-ratio:4/5;object-fit:cover}
.pw .portrait figcaption{position:relative;z-index:1;background:var(--navy);color:var(--on-navy);padding:14px 18px;font-size:13px;line-height:1.4}
.pw .portrait figcaption b{display:block;font:500 17px/1.2 var(--serif)}
@media (max-width:860px){.pw .hero{padding-block:44px 56px}.pw .hero-grid{grid-template-columns:1fr;gap:44px}.pw .portrait{justify-self:start;max-width:360px;margin-right:18px}}
.pw .pauta{background:var(--navy);color:var(--on-navy);padding-block:56px}
.pw .pauta .head{display:flex;justify-content:space-between;align-items:end;gap:24px;flex-wrap:wrap;margin-bottom:32px}
.pw .pauta h2{font-size:clamp(26px,3vw,36px)}
.pw .note{color:var(--on-navy-muted);font-size:14px;max-width:46ch;margin:0}
.pw .items{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:rgba(255,255,255,.14)}
.pw .item{background:var(--navy);padding:26px 26px 28px;min-width:0}
.pw .item small{display:block;font:600 11px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--gold-soft);margin-bottom:14px}
.pw .item h3{font-size:22px;line-height:1.2;margin-bottom:10px}
.pw .item p{margin:0;color:var(--on-navy-muted);font-size:15px}
@media (max-width:860px){.pw .items{grid-template-columns:1fr}}
.pw .block{padding-block:84px}
.pw .sec-head{max-width:680px;margin-bottom:40px}
.pw .sec-head h2{font-size:clamp(30px,3.6vw,44px);line-height:1.1;margin-top:14px}
.pw .sec-head p{color:var(--muted);margin:14px 0 0;max-width:58ch}
.pw .dec{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}
.pw .dcard{background:var(--surface);border:1px solid var(--line);border-top:2px solid var(--gold);padding:26px 24px 24px;display:flex;flex-direction:column;gap:12px;min-width:0}
.pw .dcard h3{font-size:22px;line-height:1.2}
.pw .dcard p{margin:0;color:var(--muted);font-size:14.5px}
.pw .dcard button{margin-top:auto;align-self:flex-start;font:600 13px/1.3 var(--sans);letter-spacing:.04em;color:var(--gold);background:none;border:0;padding:8px 0 0;cursor:pointer;text-align:left}
.pw .dcard button:hover{text-decoration:underline}
@media (max-width:1000px){.pw .dec{grid-template-columns:1fr 1fr}}
@media (max-width:560px){.pw .dec{grid-template-columns:1fr}}
.pw .fields{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--line)}
.pw .fgroup{padding:28px 26px 30px 0;min-width:0}
.pw .fgroup+.fgroup{padding-left:26px;border-left:1px solid var(--line)}
.pw .fgroup h3{font-size:24px;line-height:1.15;margin-bottom:16px}
.pw .fgroup ul{list-style:none;margin:0;padding:0}
.pw .fgroup li{padding:11px 0;border-top:1px solid var(--line);font-size:15px}
.pw .fgroup li:last-child{border-bottom:1px solid var(--line)}
.pw .fgroup.core h3{color:var(--gold)}
.pw .fgroup.core li{font-weight:500}
@media (max-width:980px){.pw .fields{grid-template-columns:1fr 1fr}.pw .fgroup:nth-child(3){padding-left:0;border-left:0}}
@media (max-width:560px){.pw .fields{grid-template-columns:1fr}.pw .fgroup+.fgroup{padding-left:0;border-left:0}}
.pw .about{background:var(--surface);border-block:1px solid var(--line)}
.pw .about-grid{display:grid;grid-template-columns:.8fr 1.2fr;gap:64px;align-items:start}
.pw .about h2{font-size:clamp(30px,3.6vw,44px);line-height:1.1;margin-top:14px}
.pw .about p{color:var(--muted);margin:0 0 16px;max-width:60ch}
.pw dl{margin:28px 0 0;display:grid;grid-template-columns:auto 1fr;gap:12px 24px;font-size:14px}
.pw dt{font-weight:600;color:var(--ink)}.pw dd{margin:0;color:var(--muted)}
@media (max-width:860px){.pw .about-grid{grid-template-columns:1fr;gap:28px}}
.pw .purpose{margin:72px 0 0;padding-top:48px;border-top:1px solid var(--line);font:500 clamp(24px,3vw,38px)/1.25 var(--serif);text-transform:uppercase;letter-spacing:.02em;max-width:26em;text-wrap:balance}
.pw .purpose .eyebrow{display:block;margin-bottom:18px}
.pw .values-head{margin:56px 0 18px}
.pw .values{display:grid;grid-template-columns:repeat(5,1fr)}
.pw .values>div{padding:6px 22px 6px 0;min-width:0}
.pw .values>div+div{padding-left:22px;border-left:1px solid var(--line)}
.pw .values h3{font-size:21px;margin-bottom:8px}
.pw .values p{margin:0;color:var(--muted);font-size:14.5px}
@media (max-width:980px){.pw .values{grid-template-columns:1fr 1fr;row-gap:28px}.pw .values>div:nth-child(odd){padding-left:0;border-left:0}.pw .values>div:nth-child(even){padding-left:22px}}
@media (max-width:560px){.pw .values{grid-template-columns:1fr}.pw .values>div,.pw .values>div+div{padding-left:0;border-left:0}}
.pw .steps{display:grid;grid-template-columns:repeat(4,1fr);border-top:2px solid var(--navy)}
@media (prefers-color-scheme: dark){.pw .steps{border-top-color:var(--gold)}}
.pw .step{padding:24px 24px 8px 0;min-width:0}
.pw .step h3{font-size:22px;margin-bottom:8px}
.pw .step p{margin:0;color:var(--muted);font-size:15px}
.pw .step .out{display:block;margin-top:12px;font:600 12px/1.4 var(--sans);letter-spacing:.06em;color:var(--gold);text-transform:uppercase}
@media (max-width:860px){.pw .steps{grid-template-columns:1fr 1fr;gap:12px}}
@media (max-width:520px){.pw .steps{grid-template-columns:1fr}}
.pw .contact{background:var(--navy);color:var(--on-navy)}
.pw .contact-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:64px;padding-block:80px}
.pw .contact h2{font-size:clamp(30px,3.6vw,44px);line-height:1.1;margin:14px 0 18px}
.pw .contact p{color:var(--on-navy-muted);max-width:52ch;margin:0 0 14px}
.pw .cform{margin-top:26px;display:grid;gap:14px}
.pw .cform label{display:block;font:600 11px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--gold-soft);margin-bottom:7px}
.pw .cform input,.pw .cform select,.pw .cform textarea{width:100%;padding:12px 13px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.05);color:var(--on-navy);font:400 15px/1.3 var(--sans);border-radius:2px}
.pw .cform select option{color:#14202B}
.pw .cform input:focus,.pw .cform select:focus,.pw .cform textarea:focus{outline:2px solid var(--gold-soft);outline-offset:1px}
.pw .cform .two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.pw .cform .err{color:#F0B6A6;font-size:13.5px;margin:0}
.pw .cform .acts{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.pw .cform .priv{font-size:12.5px;color:var(--on-navy-muted);margin:2px 0 0}
.pw .box{border:1px solid rgba(255,255,255,.18);padding:28px;display:flex;flex-direction:column;gap:18px;min-width:0;align-self:start}
.pw .box small{display:block;font:600 11px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--gold-soft);margin-bottom:6px}
.pw .box span,.pw .box a{overflow-wrap:anywhere}
.pw .copy{background:none;border:1px solid var(--gold-soft);color:var(--on-navy);padding:8px 14px;font:500 13px/1 var(--sans);cursor:pointer;border-radius:2px;align-self:flex-start}
.pw .copy:hover{background:rgba(255,255,255,.08)}
.pw .alert{border-top:1px solid rgba(255,255,255,.18);padding-top:18px;font-size:13px;color:var(--on-navy-muted);line-height:1.55;margin:0}
@media (max-width:860px){.pw .contact-grid{grid-template-columns:1fr;gap:36px;padding-block:56px}.pw .cform .two{grid-template-columns:1fr}}
.pw footer{padding-block:28px;font-size:12.5px;color:var(--muted)}
.pw footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px 28px}
.pw a:focus-visible,.pw button:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
.pw .wa{position:fixed;right:18px;bottom:18px;z-index:25;display:flex;align-items:center;gap:10px;background:#1F9D55;color:#fff!important;text-decoration:none;border-radius:40px;padding:13px 20px;font:600 14px/1 var(--sans);box-shadow:0 8px 24px rgba(0,0,0,.28)}
.pw .wa:hover{filter:brightness(1.08)}
@media (max-width:520px){.pw .wa span{display:none}.pw .wa{padding:14px}}
.pw .doc{max-width:760px;padding-block:64px 88px}
.pw .doc h1{font-size:clamp(32px,4vw,46px);line-height:1.1;margin:14px 0 10px}
.pw .doc .upd{color:var(--muted);font-size:14px;margin:0 0 36px}
.pw .doc h2{font-size:25px;line-height:1.2;margin:38px 0 12px}
.pw .doc p,.pw .doc li{color:var(--ink);font-size:16px;margin:0 0 12px}
.pw .doc ul{margin:0 0 14px;padding-left:22px}
.pw .doc a{color:var(--gold);text-underline-offset:3px}
.pw .doc .back{display:block;margin-bottom:26px;font-size:14px;color:var(--muted);text-decoration:none}
.pw .cform .ck{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;line-height:1.5;color:var(--on-navy-muted)}
.pw .cform .ck input{width:auto;margin-top:3px;flex:0 0 auto;accent-color:var(--gold-soft)}
.pw .cform .ck label{display:inline;font:inherit;letter-spacing:0;text-transform:none;color:inherit;margin:0}
.pw .cform .ck a,.pw .priv a{color:var(--on-navy);text-underline-offset:3px}
.pw footer a{color:var(--muted);text-underline-offset:3px}
.pw .veil{position:fixed;inset:0;background:rgba(8,19,29,.62);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px}
.pw .login{background:var(--surface);color:var(--ink);width:100%;max-width:420px;border-top:3px solid var(--gold);padding:30px 28px 26px;position:relative;max-height:100%;overflow:auto}
.pw .login h2{font-size:28px;margin:10px 0 6px}
.pw .login .sub{color:var(--muted);font-size:14px;margin:0 0 20px}
.pw .tabs{display:flex;border-bottom:1px solid var(--line);margin-bottom:20px}
.pw .tabs button{flex:1;background:none;border:0;border-bottom:2px solid transparent;padding:10px 0;font:500 14px/1 var(--sans);color:var(--muted);cursor:pointer;margin-bottom:-1px}
.pw .tabs button[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--gold);font-weight:600}
.pw .login label{display:block;font:600 12px/1 var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 7px}
.pw .login input{width:100%;padding:12px 13px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font:400 15px/1.2 var(--sans);border-radius:2px;margin-bottom:16px}
.pw .login input:focus{outline:2px solid var(--gold);outline-offset:1px}
.pw .login .btn{width:100%;text-align:center}
.pw .login .aux{margin-top:14px;font-size:13px}
.pw .login .aux a{color:var(--muted)}
.pw .login .msg{margin:14px 0 0;font-size:13px;color:var(--muted);min-height:1.4em}
.pw .login .x{position:absolute;top:10px;right:12px;background:none;border:0;font-size:24px;line-height:1;color:var(--muted);cursor:pointer;padding:6px}
.pw .login .safe{margin:18px 0 0;padding-top:14px;border-top:1px solid var(--line);font-size:12.5px;color:var(--muted)}
`;

function useHead(title, description) {
  useEffect(() => {
    document.title = title;
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement("meta"); m.setAttribute("name", "description"); document.head.appendChild(m); }
    m.setAttribute("content", description);
    if (!document.getElementById("pw-style")) {
      const s = document.createElement("style");
      s.id = "pw-style"; s.textContent = CSS; document.head.appendChild(s);
    }
    if (!document.getElementById("pw-ld")) {
      const j = document.createElement("script");
      j.id = "pw-ld"; j.type = "application/ld+json";
      j.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "LegalService", name: "Rodrigo Santos Advocacia e Consultoria", url: "https://www.rsaempresarial.com.br", email: EMAIL, areaServed: "BR" });
      document.head.appendChild(j);
    }
  }, [title, description]);
}

const waLink = (text) => `https://wa.me/${WHATS_NUM}?text=${encodeURIComponent(text)}`;

function Header({ onLogin }) {
  return (
    <header>
      <div className="wrap bar">
        <a className="brand" href="#topo" aria-label="RSAC - Rodrigo Santos Advocacia e Consultoria">
          <span className="logo" role="img" aria-label="RSAC" />
          <span className="nm">Rodrigo Santos<br />Advocacia e Consultoria<em>{TAGLINE}</em></span>
        </a>
        <nav aria-label="Principal">
          <a href="#areas">Áreas de atuação</a><a href="#sobre">Sobre</a><a href="#como">Como atuamos</a><a href="#contato">Contato</a>
          <button className="portal" type="button" aria-haspopup="dialog" onClick={onLogin}>Entrar</button>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  const [bad, setBad] = useState(false);
  return (
    <section className="hero">
      <div className="wrap hero-grid">
        <div>
          <span className="eyebrow">Direito tributário e empresarial</span>
          <h1>Advocacia para <em>empresas e empresários.</em></h1>
          <p className="tag"><span />{TAGLINE}</p>
          <p className="lead">Planejamento tributário, reorganização societária, holdings e o impacto fiscal de operações de M&amp;A, com análise individual de cada empresa e de cada família.</p>
          <div className="cta">
            <a className="btn" href="#contato">Agendar conversa reservada</a>
            <a className="link" href="#areas">Conheça as frentes de atuação</a>
          </div>
          <ul className="assure">
            <li>Atendimento direto pelo sócio</li>
            <li>Primeira conversa reservada</li>
            <li>Análise por escrito</li>
          </ul>
        </div>
        <figure className="portrait">
          <img src={bad ? "/assets/RSAC_monograma_perfil_redondo.png" : "/assets/retrato-hero.jpg"} alt="Rodrigo Santos, sócio responsável" onError={() => setBad(true)} />
          <figcaption><b>Rodrigo Santos</b>Sócio responsável · Direito tributário e empresarial</figcaption>
        </figure>
      </div>
    </section>
  );
}

function Contact({ topic, setTopic }) {
  const [f, setF] = useState({ nome: "", contato: "", msg: "" });
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const body = () => `Olá, sou ${f.nome.trim()}.\nTema: ${topic}.\n\n${f.msg.trim()}\n\nContato: ${f.contato.trim() || "-"}`;
  const valid = () => { if (!f.nome.trim() || !f.msg.trim()) { setErr("Informe seu nome e uma breve descrição da situação."); return false; } if (!ok) { setErr("Para enviar, confirme que leu o Aviso de Privacidade."); return false; } setErr(""); return true; };
  const viaWhats = () => { if (valid()) window.open(waLink(body()), "_blank", "noopener"); };
  const viaMail = () => { if (valid()) window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent("Contato pelo site — " + topic)}&body=${encodeURIComponent(body())}`; };
  const copy = () => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    try { navigator.clipboard.writeText(EMAIL).then(done, () => {}); } catch (e) { /* sem clipboard */ }
  };
  return (
    <section className="contact" id="contato">
      <div className="wrap contact-grid">
        <div>
          <span className="eyebrow">Contato</span>
          <h2>Conte qual é a decisão que você precisa tomar.</h2>
          <p>Escreva com o tema de interesse (holding, M&amp;A ou reforma tributária) e uma breve descrição da situação. O escritório retorna para agendar o atendimento.</p>
          <p>Não envie documentos nem dados sensíveis nesta primeira mensagem.</p>
          <div className="cform">
            <div><label htmlFor="c-tema">Tema</label>
              <select id="c-tema" value={topic} onChange={(e) => setTopic(e.target.value)}>{TOPICS.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="two">
              <div><label htmlFor="c-nome">Nome</label><input id="c-nome" value={f.nome} onChange={set("nome")} autoComplete="name" /></div>
              <div><label htmlFor="c-ct">E-mail ou telefone</label><input id="c-ct" value={f.contato} onChange={set("contato")} autoComplete="email" /></div>
            </div>
            <div><label htmlFor="c-msg">Descrição breve da situação</label><textarea id="c-msg" rows={4} value={f.msg} onChange={set("msg")} /></div>
            <div className="ck">
              <input id="c-ok" type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
              <label htmlFor="c-ok">Li o <a href="/privacidade" target="_blank" rel="noopener">Aviso de Privacidade</a> e estou ciente de que meus dados serão usados para retorno deste contato.</label>
            </div>
            {err && <p className="err" role="alert">{err}</p>}
            <div className="acts">
              <button type="button" className="btn gold" onClick={viaWhats}>Enviar pelo WhatsApp</button>
              <button type="button" className="btn ghost" onClick={viaMail}>Enviar por e-mail</button>
            </div>
            <p className="priv">Este site não guarda o que você escreve: ao enviar, a mensagem segue para o WhatsApp ou para o seu programa de e-mail, e fica registrada nesses serviços. Veja o <a href="/privacidade" target="_blank" rel="noopener">Aviso de Privacidade</a>.</p>
          </div>
        </div>
        <div className="box">
          <div><small>E-mail</small><span>{EMAIL}</span></div>
          <button className="copy" type="button" onClick={copy}>{copied ? "E-mail copiado" : "Copiar e-mail"}</button>
          <div><small>Atendimento</small><span>Mediante agendamento, presencial ou por videoconferência</span></div>
          <div><small>LinkedIn</small><a href={LINKEDIN} target="_blank" rel="noopener noreferrer">linkedin.com/in/rodrigolcssantos</a></div>
          <p className="alert"><b>Segurança:</b> o escritório não solicita depósitos, PIX ou pagamentos por mensagem sem contrato prévio. Na dúvida, confirme pelo e-mail acima antes de qualquer transferência.</p>
        </div>
      </div>
    </section>
  );
}

function LoginModal({ onClose, onTeam, onPortal }) {
  const [tab, setTab] = useState("cliente");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const first = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    if (first.current) first.current.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, tab]);

  const submit = async (e) => {
    e.preventDefault(); setMsg("");
    if (tab === "equipe") {
      if (!email.trim() || !pass) { setMsg("Informe e-mail e senha."); return; }
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
      setBusy(false);
      if (error) { setMsg(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message); return; }
      onTeam();
    } else {
      if (!code.trim()) { setMsg("Informe o código de acesso."); return; }
      try { sessionStorage.setItem("rsac_portal_code", code.trim()); } catch (er) { /* ignora */ }
      onPortal();
    }
  };
  const equipe = tab === "equipe";
  return (
    <div className="veil" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="login" role="dialog" aria-modal="true" aria-labelledby="login-t">
        <button className="x" type="button" aria-label="Fechar" onClick={onClose}>&times;</button>
        <span className="eyebrow">Acesso restrito</span>
        <h2 id="login-t">Entrar no sistema</h2>
        <p className="sub">{equipe ? "Área de gestão do escritório: processos, clientes, agenda e financeiro." : "Acompanhe processos, documentos e comunicados do seu caso."}</p>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!equipe} onClick={() => { setTab("cliente"); setMsg(""); }}>Portal do Cliente</button>
          <button type="button" role="tab" aria-selected={equipe} onClick={() => { setTab("equipe"); setMsg(""); }}>Acesso da Equipe</button>
        </div>
        <form onSubmit={submit} autoComplete="on">
          {equipe ? (
            <>
              <label htmlFor="lg-email">E-mail</label>
              <input id="lg-email" ref={first} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <label htmlFor="lg-pass">Senha</label>
              <input id="lg-pass" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} required />
            </>
          ) : (
            <>
              <label htmlFor="lg-code">Código de acesso</label>
              <input id="lg-code" ref={first} type="text" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} required />
            </>
          )}
          <button className="btn" type="submit" disabled={busy}>{busy ? "Entrando…" : equipe ? "Entrar como equipe" : "Entrar no Portal do Cliente"}</button>
          <div className="aux">{equipe
            ? <a href="#contato" onClick={onClose}>Esqueci minha senha (solicite ao administrador)</a>
            : <a href="#contato" onClick={onClose}>Primeiro acesso ou sem código? Fale com o escritório</a>}</div>
          <p className="msg" role="status">{msg}</p>
        </form>
        <p className="safe">Acesso apenas por convite do escritório. O RSAC nunca pede a senha por e-mail ou mensagem.</p>
      </div>
    </div>
  );
}

function Home({ path, openLogin }) {
  const [topic, setTopic] = useState(TOPICS[0]);
  useHead("RSAC | Advocacia tributária e empresarial", "Rodrigo Santos Advocacia e Consultoria: planejamento tributário, reorganização societária, holdings e M&A para empresas, grupos empresariais e famílias empresárias.");
  useEffect(() => {
    const id = SECTION_BY_PATH[path];
    if (id) setTimeout(() => { const el = document.getElementById(id); if (el) el.scrollIntoView(); }, 60);
  }, [path]);
  const pick = (t) => { setTopic(t); const el = document.getElementById("contato"); if (el) el.scrollIntoView({ behavior: "smooth" }); };
  return (
    <>
      <Header onLogin={openLogin} />
      <main id="topo">
        <Hero />
        <section className="pauta" aria-labelledby="pauta-t">
          <div className="wrap">
            <div className="head">
              <div><span className="eyebrow">Pauta tributária</span><h2 id="pauta-t" style={{ marginTop: 12 }}>O que está em discussão agora</h2></div>
              <p className="note">Resumo informativo das mudanças em andamento. O efeito em cada empresa ou patrimônio depende de análise individual.</p>
            </div>
            <div className="items">{PAUTA.map((x) => <article className="item" key={x.k}><small>{x.k}</small><h3>{x.t}</h3><p>{x.p}</p></article>)}</div>
          </div>
        </section>
        <section className="block" id="decisoes">
          <div className="wrap">
            <div className="sec-head"><span className="eyebrow">Quando nos procuram</span><h2>Decisões que merecem análise antes de serem tomadas.</h2><p>Estruturas e contratos são mais simples de acertar antes da assinatura do que de corrigir depois.</p></div>
            <div className="dec">{DECISOES.map((d) => (
              <div className="dcard" key={d.t}><h3>{d.t}</h3><p>{d.p}</p><button type="button" onClick={() => pick(d.topic)}>Falar sobre este tema →</button></div>
            ))}</div>
          </div>
        </section>
        <section className="block" id="areas" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="sec-head"><span className="eyebrow">Áreas de atuação</span><h2>Campos do direito em que atuamos.</h2></div>
            <div className="fields">{CAMPOS.map((g) => (
              <div className={"fgroup" + (g.core ? " core" : "")} key={g.h}><h3>{g.h}</h3><ul>{g.l.map((i) => <li key={i}>{i}</li>)}</ul></div>
            ))}</div>
          </div>
        </section>
        <section className="about block" id="sobre">
          <div className="wrap about-grid">
            <div><span className="eyebrow">Sobre o escritório</span><h2>Consultoria jurídica tributária e empresarial.</h2></div>
            <div>
              <p>O RSAC presta assessoria jurídica a empresas, grupos empresariais e famílias empresárias em planejamento tributário, estruturação e reorganização societária, operações de M&amp;A e organização patrimonial e sucessória.</p>
              <p>A atuação se divide em duas frentes. A consultiva antecede a decisão: estudos de estrutura, simulações tributárias e análise tributária e societária de operações. A de implementação formaliza a estrutura escolhida: atos societários, acordos de sócios, contratos e reorganizações.</p>
              <p>A reforma tributária altera custos e estruturas hoje em vigor. O escritório acompanha a LC 214/2025, a LC 227/2026 e a regulamentação que se segue, e revisa as estruturas já implantadas quando as regras mudam.</p>
              <dl>
                <dt>Áreas</dt><dd>Direito tributário e empresarial</dd>
                <dt>Frentes</dt><dd>Consultiva e de implementação</dd>
                <dt>Clientes</dt><dd>Empresas, grupos empresariais e famílias empresárias</dd>
                <dt>Atendimento</dt><dd>Mediante agendamento, presencial ou por videoconferência</dd>
              </dl>
            </div>
          </div>
          <div className="wrap">
            <p className="purpose"><span className="eyebrow">Propósito</span>Orientar decisões empresariais e patrimoniais com análise jurídica e tributária fundamentada.</p>
            <div className="values-head eyebrow">Valores</div>
            <div className="values">{VALORES.map(([h, p]) => <div key={h}><h3>{h}</h3><p>{p}</p></div>)}</div>
          </div>
        </section>
        <section className="block" id="como">
          <div className="wrap">
            <div className="sec-head"><span className="eyebrow">Como atuamos</span><h2>Do diagnóstico à implementação, em etapas claras.</h2></div>
            <div className="steps">{ETAPAS.map(([h, p, o]) => <div className="step" key={h}><h3>{h}</h3><p>{p}</p><span className="out">Entrega: {o}</span></div>)}</div>
            <div style={{ marginTop: 36 }}><a className="btn" href="#contato">Agendar conversa reservada</a></div>
          </div>
        </section>
        <Contact topic={topic} setTopic={setTopic} />
      </main>
      <footer>
        <div className="wrap">
          <span>© 2026 RSAC · Rodrigo Santos Advocacia e Consultoria</span>
          <span>Conteúdo informativo, sem caráter de aconselhamento jurídico individual. Os resultados dependem de análise de cada caso. · <a href="/privacidade">Privacidade e LGPD</a></span>
        </div>
      </footer>
      <a className="wa" href={waLink("Olá, gostaria de agendar uma conversa reservada com o escritório.")} target="_blank" rel="noopener noreferrer" aria-label="Falar pelo WhatsApp">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.700 6.700 0 0 1-3.300-2.900c-.2-.4.2-.4.700-1.300a.5.5 0 0 0 0-.5l-.8-1.800c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.200 5.200 5.200 0 0 0 1.100 2.800 11.900 11.900 0 0 0 4.600 4c1.700.7 2.400.8 3.200.7a2.700 2.700 0 0 0 1.800-1.300 2.200 2.200 0 0 0 .2-1.300c-.1-.1-.3-.2-.5-.3Z" /></svg>
        <span>Falar pelo WhatsApp</span>
      </a>
    </>
  );
}

function Privacy() {
  useHead("Aviso de Privacidade | RSAC", "Como o escritório RSAC trata dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD), e como exercer seus direitos como titular.");
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const mail = (assunto) => `mailto:${EMAIL}?subject=${encodeURIComponent(assunto)}`;
  return (
    <>
      <header><div className="wrap bar"><a className="brand" href="/" aria-label="RSAC - voltar ao início"><span className="logo" role="img" aria-label="RSAC" /><span className="nm">Rodrigo Santos<br />Advocacia e Consultoria</span></a></div></header>
      <main className="wrap doc" id="topo">
        <a className="back" href="/">← Voltar ao site</a>
        <span className="eyebrow">LGPD · Lei 13.709/2018</span>
        <h1>Aviso de Privacidade</h1>
        <p className="upd">Atualizado em {PRIV_ATUALIZ}.</p>

        <h2>1. Quem é o controlador</h2>
        <p>O controlador dos dados tratados por meio deste site é <b>{CONTROLADOR}</b>, advogado, responsável pelo escritório Rodrigo Santos Advocacia e Consultoria (RSAC){CNPJ ? <>, CNPJ {CNPJ}</> : null}. O escritório não possui sede aberta ao público; o atendimento ocorre mediante agendamento.</p>
        <p>Canal para assuntos de privacidade e proteção de dados: <a href={mail("Privacidade e dados pessoais")}>{EMAIL}</a>.</p>

        <h2>2. Quais dados tratamos e para quê</h2>
        <ul>
          <li><b>Formulário de contato:</b> nome, e-mail ou telefone, tema e a descrição que você escrever. Usamos apenas para responder à sua solicitação e agendar o atendimento. O site não grava esses dados: ao clicar em enviar, a mensagem é aberta no WhatsApp ou no seu programa de e-mail, e é você quem a envia.</li>
          <li><b>Contato direto</b> por e-mail, WhatsApp ou LinkedIn: os dados que você fornecer na conversa.</li>
          <li><b>Áreas restritas (Portal do Cliente e Acesso da Equipe):</b> código de acesso ou e-mail e senha, usados apenas para autenticação. Os dados de processos e documentos exibidos no portal são tratados no âmbito do contrato de serviços advocatícios.</li>
          <li><b>Dados de navegação:</b> este site não usa cookies de publicidade, estatística ou rastreamento, nem ferramentas de análise de terceiros. As fontes de letra são servidas pelo próprio site. Servidores de hospedagem podem registrar o endereço IP e dados técnicos do acesso por razões de segurança e funcionamento.</li>
        </ul>
        <p>Pedimos que <b>não envie documentos, dados sensíveis (como saúde ou origem racial), dados de terceiros ou senhas</b> na primeira mensagem. Se isso for necessário, será combinado um canal adequado depois do primeiro contato.</p>

        <h2>3. Bases legais</h2>
        <p>Tratamos seus dados com base no art. 7º da LGPD: <b>procedimentos preliminares relacionados a contrato</b>, a pedido do titular (inciso V), para responder ao seu contato; <b>execução de contrato</b> (inciso V), quando houver contratação; <b>cumprimento de obrigação legal ou regulatória</b> (inciso II), como as normas da OAB e a legislação fiscal; <b>exercício regular de direitos</b> em processo judicial, administrativo ou arbitral (inciso VI); e <b>legítimo interesse</b> (inciso IX), para a segurança do site e do sistema, sempre respeitados seus direitos e expectativas.</p>

        <h2>4. Com quem os dados podem ser compartilhados</h2>
        <p>Não vendemos nem cedemos dados para publicidade. O compartilhamento ocorre apenas quando necessário: com serviços usados por você ao enviar a mensagem (WhatsApp, operado pela Meta, e o seu provedor de e-mail); com prestadores de tecnologia que hospedam o site e o sistema do escritório (Vercel e Supabase), sob contratos com obrigações de segurança; e com autoridades, quando houver determinação legal. Alguns desses prestadores podem armazenar dados fora do Brasil (transferência internacional, art. 33 da LGPD), com garantias contratuais adequadas.</p>

        <h2>5. Sigilo profissional</h2>
        <p>Os dados de clientes e de pessoas em atendimento estão protegidos pelo sigilo profissional previsto no Estatuto da Advocacia (Lei 8.906/1994) e no Código de Ética e Disciplina da OAB, que se somam às regras da LGPD.</p>

        <h2>6. Por quanto tempo guardamos</h2>
        <p>Mensagens de pessoas que não se tornam clientes são mantidas pelo tempo necessário para o atendimento e, em regra, por até <b>12 meses</b>, quando são eliminadas. Dados de clientes são guardados durante o contrato e pelos prazos exigidos em lei e pelas normas da OAB, ou até o fim de eventual discussão judicial.</p>

        <h2>7. Seus direitos como titular</h2>
        <p>Nos termos do art. 18 da LGPD, você pode solicitar: confirmação de que tratamos seus dados; acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos; portabilidade; informação sobre compartilhamentos; informação sobre a possibilidade de não consentir e suas consequências; e revogação do consentimento, quando for a base legal. Alguns pedidos podem ser limitados por obrigação legal ou pelo sigilo profissional, e nesse caso explicaremos o motivo.</p>
        <p>Para exercer seus direitos, escreva para <a href={mail("Direitos do titular de dados (LGPD)")}>{EMAIL}</a>, indicando seu nome e o que deseja. Podemos pedir informações para confirmar sua identidade. Respondemos em até 15 dias.</p>
        <p>Se entender que seus dados foram tratados de forma irregular, você também pode apresentar petição à Autoridade Nacional de Proteção de Dados (ANPD), em <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer">gov.br/anpd</a>.</p>

        <h2>8. Segurança</h2>
        <p>Adotamos medidas técnicas e administrativas para proteger os dados: conexão criptografada (HTTPS), acesso restrito por convite e perfis de permissão na área da equipe, e controle de acesso ao banco de dados. O escritório nunca pede senha por e-mail ou mensagem, nem solicita depósitos ou PIX sem contrato prévio. Em caso de dúvida sobre uma mensagem recebida em nome do escritório, confirme pelo e-mail acima.</p>

        <h2>9. Alterações deste aviso</h2>
        <p>Este aviso pode ser atualizado, e a data de revisão aparece no topo. Se passarmos a usar cookies de análise ou outras ferramentas de terceiros, informaremos aqui e pediremos seu consentimento quando exigido.</p>
      </main>
      <footer><div className="wrap"><span>© 2026 RSAC · Rodrigo Santos Advocacia e Consultoria</span><a href="/">Voltar ao início</a></div></footer>
    </>
  );
}

function NotFound() {
  useHead("Página não encontrada | RSAC", "");
  return (
    <main style={{ padding: "120px 0", textAlign: "center" }}>
      <div className="wrap">
        <h1 style={{ fontSize: 44 }}>Página não encontrada</h1>
        <p style={{ color: "var(--muted)", margin: "14px 0 26px" }}>O endereço acessado não existe ou foi alterado.</p>
        <a className="btn" href="/">Voltar ao início</a>
      </div>
    </main>
  );
}

export default function PublicSite({ path, navigate, onTeam, onPortal }) {
  const [login, setLogin] = useState(false);
  const isHome = path === "/" || Object.prototype.hasOwnProperty.call(SECTION_BY_PATH, path);
  return (
    <div className="pw">
      {isHome ? <Home path={path} openLogin={() => setLogin(true)} /> : path === "/privacidade" ? <Privacy /> : <NotFound />}
      {login && <LoginModal onClose={() => setLogin(false)} onTeam={() => { setLogin(false); onTeam(); }} onPortal={() => { setLogin(false); onPortal(); }} />}
    </div>
  );
}
