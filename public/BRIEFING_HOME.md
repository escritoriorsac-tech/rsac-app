# Página inicial do site RSAC — briefing para implementação

Referência visual funcionando: `index.html` (HTML/CSS/JS puro, abre direto no navegador). Imagens em `assets/`. Use o HTML como especificação visual e os textos abaixo como conteúdo oficial. Onde o app tiver componentes próprios, reaproveite tokens e textos, não o markup.

## 1. Decisões já tomadas
- Título principal (H1): **Advocacia para empresas e empresários.** (destaque dourado em "empresas e empresários")
- Tagline em destaque (início da página, abaixo do H1, e no topo ao lado do nome): **Advogados especializados**
- Nome do escritório sempre visível no topo: **Rodrigo Santos Advocacia e Consultoria** + logo RSAC
- Visual claro (o escuro anterior foi considerado pesado para o público); navy e dourado como identidade
- Sem número de OAB em nenhum lugar do site; aviso de segurança contra golpes no contato
- Sem sede física: atendimento mediante agendamento (endereço da Av. Paulista só para correspondência, não exibido)
- Menu: Áreas de atuação, Sobre, Como atuamos, Contato, botão **Entrar** (abre painel de login com abas Portal do Cliente e Acesso da Equipe)

## 2. Tokens de design
| Token | Claro | Escuro |
|---|---|---|
| fundo | #F3F5F6 | #0B1620 |
| superfície | #FFFFFF | #111F2C |
| texto | #14202B | #E8ECEF |
| texto secundário | #56636F | #9AA8B5 |
| linhas | #D9DFE3 | #223445 |
| navy | #0E2841 | #08131D |
| dourado | #A9843F | #C9A96A |

Fontes: títulos **Newsreader** (400/500/600, itálico para a tagline); texto **Inter** (400/500/600). Rótulos em caixa alta com letter-spacing .16em. Largura máxima do conteúdo 1160px, gutter mínimo 20px. Tema claro/escuro via `prefers-color-scheme`.

Logo: arquivo `assets/logo-curto-claro.png` (tema claro) e `logo-curto-escuro.png` (tema escuro), altura 36px no topo, 30px no celular. Abaixo de 560px o nome some do topo (a logo fica sozinha). Logos completas e monograma de perfil em `assets/RSAC_*.png`.

## 3. Estrutura e textos

### Topo (fixo)
Logo RSAC | filete dourado | RODRIGO SANTOS / ADVOCACIA E CONSULTORIA / *Advogados especializados* (itálico dourado) · links · botão **Entrar**.

### Início
- Rótulo: DIREITO TRIBUTÁRIO E EMPRESARIAL
- H1: Advocacia para **empresas e empresários.**
- Tagline: — *Advogados especializados* (filete dourado antes)
- Texto: Planejamento tributário, reorganização societária, holdings e o impacto fiscal de operações de M&A, com análise individual de cada empresa e de cada família.
- Botão: Conheça as frentes de atuação (âncora #areas) · link: Falar com o escritório (#contato)
- Retrato (`assets/retrato-hero.jpg`, 4:5) com moldura dourada deslocada e legenda em navy: **Rodrigo Santos** — Sócio responsável · Direito tributário e empresarial

### Pauta tributária (faixa navy, 3 colunas)
Título: O que está em discussão agora. Nota: Resumo informativo das mudanças em andamento. O efeito em cada empresa ou patrimônio depende de análise individual.
1. **CBS · 2027 — Alíquota de referência de 11,3%.** O TCU calculou o percentual que substitui PIS e Cofins. O Senado ainda precisa confirmá-lo por resolução. Reduções setoriais e créditos mudam o resultado de cada empresa.
2. **ITCMD · LC 227/2026 — Herança e doação com regras novas.** A lei exige alíquotas progressivas, fixa teto de 8% e trata o valor de mercado das cotas. Cada estado ainda precisa legislar, o que torna a sucessão patrimonial uma pauta de planejamento.
3. **Dividendos — Tributação em debate.** Dois projetos de lei propõem novas regras para lucros e dividendos. São propostas em tramitação, ainda sem aprovação. A retenção vigente segue a Lei 15.270/2025.

### Áreas de atuação
Título: Campos do direito em que atuamos. Quatro colunas de lista (modelo: menu "Práticas" do Machado Meyer), grupo Tributário em dourado:
- **Tributário:** Planejamento tributário · Reforma tributária: CBS e IBS · Tributário em M&A · Tributação de lucros e dividendos · ITCMD e transmissão patrimonial
- **Empresarial:** Societário · M&A · Reorganização societária · Contratos e negociações · Contencioso societário
- **Patrimonial e imobiliário:** Planejamento patrimonial e sucessório · Holdings familiares e imobiliárias · Imobiliário e locações · Inventários e partilhas
- **Contencioso e demais áreas:** Contencioso cível e empresarial · Relações de consumo · Propriedade intelectual · Direito público e Fazenda Pública · Trabalhista

### Sobre o escritório
H2: Consultoria jurídica tributária e empresarial.
1. O RSAC presta assessoria jurídica a empresas, grupos empresariais e famílias empresárias em planejamento tributário, estruturação e reorganização societária, operações de M&A e organização patrimonial e sucessória.
2. A atuação se divide em duas frentes. A consultiva antecede a decisão: estudos de estrutura, simulações tributárias e análise tributária e societária de operações. A de implementação formaliza a estrutura escolhida: atos societários, acordos de sócios, contratos e reorganizações.
3. A reforma tributária altera custos e estruturas hoje em vigor. O escritório acompanha a LC 214/2025, a LC 227/2026 e a regulamentação que se segue, e revisa as estruturas já implantadas quando as regras mudam.
Quadro: Áreas — Direito tributário e empresarial · Frentes — Consultiva e de implementação · Clientes — Empresas, grupos empresariais e famílias empresárias · Atendimento — Mediante agendamento, presencial ou por videoconferência.

Propósito (serifa, caixa alta): ORIENTAR DECISÕES EMPRESARIAIS E PATRIMONIAIS COM ANÁLISE JURÍDICA E TRIBUTÁRIA FUNDAMENTADA.
Valores (5 colunas): **Rigor técnico** — Análise baseada na lei, na jurisprudência e nos documentos do cliente. · **Clareza** — Premissas, cenários e conclusões apresentados por escrito. · **Ética** — Atuação conforme o Código de Ética e Disciplina da OAB. · **Sigilo** — Confidencialidade sobre os dados e as operações dos clientes. · **Atualização** — Acompanhamento da legislação e da regulamentação em mudança.

### Como atuamos (4 etapas, com entrega)
1. **Diagnóstico** — Levantamento da empresa, do patrimônio e dos objetivos do cliente. *Entrega: escopo definido*
2. **Cenários** — Comparação das alternativas jurídicas e tributárias, com premissas explícitas. *Entrega: estudo comparativo*
3. **Implementação** — Elaboração e acompanhamento dos atos societários e documentos necessários. *Entrega: documentos prontos*
4. **Acompanhamento** — Revisão da estrutura conforme a legislação e a situação do cliente mudam. *Entrega: informativos e revisões*

### Contato (faixa navy)
H2: Conte qual é a decisão que você precisa tomar. Texto: Escreva com o tema de interesse (holding, M&A ou reforma tributária) e uma breve descrição da situação. O escritório retorna para agendar o atendimento. / Não envie documentos nem dados sensíveis nesta primeira mensagem.
Caixa: E-mail escritorio.rsac@gmail.com (botão copiar) · Atendimento mediante agendamento, presencial ou por videoconferência · LinkedIn linkedin.com/in/rodrigolcssantos · Segurança: o escritório não solicita depósitos, PIX ou pagamentos por mensagem sem contrato prévio. Na dúvida, confirme pelo e-mail acima antes de qualquer transferência.

### Rodapé
© 2026 RSAC · Rodrigo Santos Advocacia e Consultoria · Conteúdo informativo, sem caráter de aconselhamento jurídico individual. Os resultados dependem de análise de cada caso.

## 4. Painel de login ("Entrar")
Janela modal com abas **Portal do Cliente** e **Acesso da Equipe**, campos e-mail e senha, links "Esqueci minha senha" e "Primeiro acesso" (só na aba do cliente), aviso: Acesso apenas por convite do escritório. O RSAC nunca pede a senha por e-mail ou mensagem. **No HTML é protótipo**: o envio do formulário só exibe um aviso. Ligue ao login real do app e ao link de cadastro de clientes (não está neste material).

## 5. Pendências antes de publicar
1. **Tagline "Advogados especializados":** o Provimento 205/2021 da OAB restringe "especialista" e termos equivalentes a quem tem título. Decisão do sócio de manter; risco registrado. Alternativa sem risco: "Direito tributário e empresarial".
2. **Pauta tributária:** conferir nas fontes oficiais antes de publicar (ITCMD/LC 227/2026: teto, progressividade e cotas a valor de mercado; PLs de dividendos; aprovação da alíquota da CBS pelo Senado). A faixa envelhece rápido; reveja a cada mudança.
3. **Áreas de atuação:** o último grupo (consumo, PI, público, trabalhista) veio de tipos de caso do escritório; remover o que não deve ser divulgado como área de atuação.
4. **Valores e propósito:** são sugestões de texto; ajustar à preferência do sócio.
5. **Sem preços, sem promessa de resultado, sem nomes de clientes ou casos, sem prêmios ou rankings** (Provimento 205/2021).
6. A Home não cita formação acadêmica do sócio (decisão de tornar o texto menos pessoal). Se quiser voltar, cabe uma linha no quadro do "Sobre".
